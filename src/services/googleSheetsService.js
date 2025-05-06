import { GOOGLE_SHEETS_CONFIG } from '../config/googleSheets';

class GoogleSheetsService {
  constructor() {
    this.gapi = null;
    this.isInitialized = false;
    this.tokenClient = null;
    this.accessToken = null;
    this.orders = [];
    this.isRefreshingToken = false;
    this.tokenRefreshPromise = null;
    this.tokenRefreshPromiseResolver = null;
    this.onTokenAcquiredCallbacks = [];
  }

  async loadGoogleAPI() {
    if (window.gapi) return window.gapi;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => resolve(window.gapi);
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async loadGoogleIdentityServices() {
    if (window.google?.accounts?.oauth2) {
      return window.google;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        setTimeout(() => {
          if (window.google?.accounts?.oauth2) {
            resolve(window.google);
          } else {
            reject(new Error('Failed to load Google Identity Services'));
          }
        }, 100);
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async initialize() {
    if (this.isInitialized) {
      return this.tokenClient;
    }

    try {
      this.gapi = await this.loadGoogleAPI();
      await new Promise((resolve, reject) => {
        this.gapi.load('client', { callback: resolve, onerror: reject });
      });

      await this.gapi.client.init({
        apiKey: GOOGLE_SHEETS_CONFIG.API_KEY,
        discoveryDocs: [
          'https://sheets.googleapis.com/$discovery/rest?version=v4',
          'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
        ],
      });

      const google = await this.loadGoogleIdentityServices();

      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_SHEETS_CONFIG.CLIENT_ID,
        scope: GOOGLE_SHEETS_CONFIG.SCOPES.join(' '),
        prompt: '',
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            console.error("Token client error:", tokenResponse.error, tokenResponse.error_description);
            if (this.isRefreshingToken && this.tokenRefreshPromiseResolver) {
              this.tokenRefreshPromiseResolver.reject(tokenResponse);
            } else if (!this.isRefreshingToken) {
              throw tokenResponse;
            }
          } else {
            this.accessToken = tokenResponse.access_token;
            this.gapi.client.setToken(tokenResponse);
            localStorage.setItem('gauth_token', JSON.stringify({
              access_token: tokenResponse.access_token,
              expires_at: Date.now() + (tokenResponse.expires_in * 1000)
            }));
            console.log('Token acquired/refreshed successfully via main callback.');
            if (this.isRefreshingToken && this.tokenRefreshPromiseResolver) {
              this.tokenRefreshPromiseResolver.resolve(this.accessToken);
            }
          }
          
          if (this.isRefreshingToken) {
            this.isRefreshingToken = false;
            this.tokenRefreshPromiseResolver = null;
          }
        },
      });

      const savedToken = localStorage.getItem('gauth_token');
      if (savedToken) {
        const tokenData = JSON.parse(savedToken);
        if (tokenData.expires_at > Date.now()) {
          this.accessToken = tokenData.access_token;
          this.gapi.client.setToken({ access_token: tokenData.access_token });
          console.log('Initialized with token from localStorage.');
        } else {
          localStorage.removeItem('gauth_token');
          console.log('Removed stale token from localStorage during init.');
        }
      }

      this.isInitialized = true;
      return this.tokenClient;
    } catch (error) {
      console.error('Error initializing Google API:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async signIn() {
    if (!this.isInitialized || !this.tokenClient) {
      await this.initialize();
    }

    return new Promise(async (resolve, reject) => {
      try {
        const savedToken = localStorage.getItem('gauth_token');
        if (savedToken) {
          const tokenData = JSON.parse(savedToken);
          const now = Date.now();
          
          if (tokenData.expires_at > now) {
            this.accessToken = tokenData.access_token;
            this.gapi.client.setToken({
              access_token: tokenData.access_token
            });
            return resolve(tokenData);
          } else {
            localStorage.removeItem('gauth_token');
          }
        }

        const handleSignInResponse = (response) => {
          if (response.error) {
            reject(response);
          } else {
            resolve(response);
          }
        };

        if (this.isRefreshingToken && this.tokenRefreshPromise) {
          await this.tokenRefreshPromise;
        }
        
        const currentSavedToken = localStorage.getItem('gauth_token');
        if (currentSavedToken) {
          const tokenData = JSON.parse(currentSavedToken);
          if (tokenData.expires_at > Date.now()) {
            this.accessToken = tokenData.access_token;
            this.gapi.client.setToken({ access_token: this.accessToken });
            return resolve(tokenData);
          } else {
            localStorage.removeItem('gauth_token');
          }
        }

        const signInPromise = new Promise((resolveSignIn, rejectSignIn) => {
            const originalTokenClientCallback = this.tokenClient.callback;

            this.tokenClient.callback = (tokenResponse) => {
                originalTokenClientCallback(tokenResponse);
                if (tokenResponse.error) {
                    rejectSignIn(tokenResponse);
                } else {
                    resolveSignIn(tokenResponse);
                }
            };
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
        
        this.isRefreshingToken = true;
        const specificSignInPromise = new Promise((res, rej) => {
            this.onTokenAcquiredCallbacks.push({ resolve: res, reject: rej });
        });
        
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
        
        resolve(await specificSignInPromise);

      } catch (err) {
        console.error('Error signing in:', err);
        this.isRefreshingToken = false;
        this.onTokenAcquiredCallbacks = [];
        reject(err);
      }
    });
  }

  async signOut() {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    try {
      const authInstance = this.gapi.auth2.getAuthInstance();
      await authInstance.signOut();
      this.accessToken = null;
      localStorage.removeItem('gauth_token');
      this.gapi.client.setToken(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }

  async checkEditAccess() {
    return this.handleApiCall(async () => {
      const response = await this.gapi.client.drive.files.get({
        fileId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        fields: 'capabilities'
      });
      return response.result.capabilities.canEdit || false;
    });
  }

  async loadOrders() {
    return this.handleApiCall(async () => {
      console.log('Loading orders from spreadsheet via handleApiCall...');
      const response = await this.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        range: 'A2:N'
      });

      console.log('Raw response from sheets:', response);
      const values = response.result.values || [];
      const orders = values.map(row => {
        const orderDate = this.formatDate(row[0] || '');
        const plannedDate = this.formatDate(row[6] || '');
        const deliveryDate = this.formatDate(row[10] || '');

        return {
          orderDate,
          orderNumber: row[1] || '',
          prisadkaNumber: row[2] || '',
          client: row[3] || '',
          area: row[4] || '',
          millingType: row[5] || '',
          plannedDate,
          status: row[7] || '',
          payment: row[8] || '',
          remainingPayment: row[9] || '',
          deliveryDate,
          phone: row[11] || '',
          cadFiles: row[12] || '',
          material: row[13] || ''
        };
      });

      this.orders = orders;
      return orders;
    });
  }

  async updateOrderStatus(rowIndex, newStatus, deliveryDate = null) {
    return this.handleApiCall(async () => {
      const updates = [];
      
      updates.push({
        range: `${GOOGLE_SHEETS_CONFIG.COLUMNS.STATUS}${rowIndex + 2}`,
        values: [[newStatus]]
      });
      
      updates.push({
        range: `${GOOGLE_SHEETS_CONFIG.COLUMNS.DELIVERY_DATE}${rowIndex + 2}`,
        values: [[deliveryDate ? this.formatDate(deliveryDate) : '']]
      });
      
      await this.gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        resource: {
          valueInputOption: 'USER_ENTERED',
          data: updates
        }
      });
    });
  }

  async watchForChanges(callback) {
    let isWatching = true;
    let pollInterval = GOOGLE_SHEETS_CONFIG.POLL_INTERVAL || 60000;
    let errorCount = 0;
    const maxErrors = 3;

    const checkForChanges = async () => {
      if (!isWatching) return;

      try {
        console.log('Watching for changes: loading orders...');
        const currentOrders = await this.loadOrders();
        
        if (JSON.stringify(currentOrders) !== JSON.stringify(this.orders)) {
          console.log('Changes detected in watchForChanges.');
          this.orders = [...currentOrders];
          callback(this.orders);
        }
        errorCount = 0;
      } catch (error) {
        console.error('Error during watchForChanges:', error);
        errorCount++;
        if (error.reauthRequired) {
            console.error("Re-authentication required. Stopping watchForChanges.");
            isWatching = false; 
            return; 
        }
        if (errorCount >= maxErrors) {
            console.error("Max errors reached in watchForChanges. Stopping watching.");
            isWatching = false;
            return;
        }
        pollInterval = Math.min(pollInterval * 2, 300000);
      }

      if (isWatching) {
        setTimeout(checkForChanges, pollInterval);
      }
    };

    setTimeout(checkForChanges, 1000);

    return () => {
      console.log('Stopped watching for changes.');
      isWatching = false;
    };
  }

  async updatePlannedDate(rowIndex, newDate) {
    return this.handleApiCall(async () => {
      const formattedDate = this.formatDate(newDate);
      
      await this.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        range: `G${rowIndex + 2}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[formattedDate]]
        }
      });
    });
  }

  isAuthenticated() {
    const token = this.gapi && this.gapi.client && this.gapi.client.getToken();
    if (token && token.access_token) {
        const savedToken = localStorage.getItem('gauth_token');
        if (savedToken) {
            const tokenData = JSON.parse(savedToken);
            return tokenData.expires_at > Date.now();
        }
    }
    return false;
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    
    if (dateStr instanceof Date || dateStr.includes('T')) {
      const date = new Date(dateStr);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    }
    
    const formats = [
      /^(\d{2})\/(\d{2})\/(\d{4})$/,
      /^(\d{2})\.(\d{2})\.(\d{4})$/,
      /^(\d{4})-(\d{2})-(\d{2})$/
    ];

    for (let format of formats) {
      const match = dateStr.match(format);
      if (match) {
        const [_, part1, part2, part3] = match;
        if (format === formats[0]) {
          return `${part1}.${part2}.${part3}`;
        } else if (format === formats[1]) {
          return dateStr;
        } else {
          return `${part3}.${part2}.${part1}`;
        }
      }
    }

    console.warn('Unexpected date format:', dateStr);
    return dateStr;
  }

  getTotalArea(orders) {
    if (!orders || !Array.isArray(orders)) return '0.00';
    const total = orders.reduce((sum, order) => {
        const area = parseFloat(order.area?.replace(',', '.') || 0);
        console.log('Order area:', order.area, 'Parsed:', area);
        return sum + area;
    }, 0);
    console.log('Total before formatting:', total);
    return total.toFixed(2);
  }

  getCellWidth() {
    return 'w-full';
  }

  async handleOrderMove(order, sourceDate, targetDate, updateDeliveryDate = false) {
    return this.handleApiCall(async () => {
      const rowIndex = this.orders.findIndex(o => o.orderNumber === order.orderNumber);
      
      await this.updatePlannedDate(rowIndex, targetDate);
      
      if (updateDeliveryDate && order.status === 'выдан') {
        await this.updateOrderStatus(rowIndex, order.status, targetDate);
      }
      
      return await this.loadOrders();
    });
  }

  async handleCheckboxChange(order, isChecked, issueDate) {
    return this.handleApiCall(async () => {
      if (!this.orders || !this.orders.length) {
        throw new Error('Orders not loaded');
      }

      const rowIndex = this.orders.findIndex(o => o.orderNumber === order.orderNumber);
      if (rowIndex === -1) {
        throw new Error(`Order ${order.orderNumber} not found`);
      }

      console.log('Updating order:', {
        orderNumber: order.orderNumber,
        rowIndex,
        newStatus: isChecked ? 'Выдан' : 'Готов',
        issueDate
      });

      await this.updateOrderStatus(rowIndex, isChecked ? 'Выдан' : 'Готов', issueDate);
      return await this.loadOrders();
    });
  }

  async getUserInfo() {
    return this.handleApiCall(async () => {
      if (!this.gapi.auth2 || !this.gapi.auth2.getAuthInstance().isSignedIn.get()) {
        try {
            const response = await this.gapi.client.oauth2.userinfo.get();
            return response.result;
        } catch (error) {
            console.error("Error fetching user info with gapi.client.oauth2:", error);
            return { name: 'N/A', email: 'N/A' }; 
        }
      }
    });
  }

  async refreshToken() {
    if (!this.tokenClient) {
      console.warn('Token client not ready for refreshToken, attempting to initialize.');
      await this.initialize();
      if (!this.tokenClient) {
        console.error('Token client still not initialized after attempt. Cannot refresh token.');
        throw new Error('Token client not initialized, cannot refresh.');
      }
    }

    if (this.isRefreshingToken && this.tokenRefreshPromise) {
      console.log('Token refresh already in progress, returning existing promise.');
      return this.tokenRefreshPromise;
    }

    this.isRefreshingToken = true;
    this.tokenRefreshPromise = new Promise((resolve, reject) => {
      this.tokenRefreshPromiseResolver = { resolve, reject };
      
      console.log('Attempting silent token refresh (prompt: none) via refreshToken method.');
      try {
        this.tokenClient.requestAccessToken({ prompt: 'none' });
      } catch (error) {
        console.error("Error directly calling requestAccessToken in refreshToken:", error);
        this.isRefreshingToken = false;
        if (this.tokenRefreshPromiseResolver) {
            this.tokenRefreshPromiseResolver.reject(error);
        }
        this.tokenRefreshPromiseResolver = null;
        throw error; 
      }
    });

    return this.tokenRefreshPromise;
  }

  async handleApiCall(apiFunction, retries = 1) {
    try {
      if (!this.gapi || !this.gapi.client || !this.gapi.client.getToken()?.access_token) {
        const savedToken = localStorage.getItem('gauth_token');
        let tokenRestored = false;
        if (savedToken) {
          const tokenData = JSON.parse(savedToken);
          if (tokenData.expires_at > Date.now()) {
            this.accessToken = tokenData.access_token;
            if (this.gapi && this.gapi.client) {
                 this.gapi.client.setToken({ access_token: this.accessToken });
            } else {
                // If gapi.client is not ready, initialize() will set it.
                // Storing accessToken here is fine; initialize will use it.
            }
            tokenRestored = true;
            console.log('Token restored from localStorage for API call.');
          } else {
            localStorage.removeItem('gauth_token');
            console.log('Stale token removed from localStorage.');
          }
        }
        
        if (!tokenRestored) {
            console.warn('No valid token found before API call, attempting refresh.');
            await this.refreshToken(); 
            // After refreshToken, this.accessToken and gapi.client token should be set.
        }
      }
      return await apiFunction();
    } catch (error) {
      const gapiError = error.result && error.result.error;
      const isAuthError = (gapiError && gapiError.status === 401) ||
                          (error.type === 'tokenResponse' && error.error && error.error !== 'popup_closed'); 
                          // popup_closed might occur if prompt:'consent' was somehow triggered and closed by user.
                          // For prompt:'none', this shouldn't be the primary error for expiration.

      if (isAuthError && retries > 0) {
        console.warn('API call failed due to auth error (Status:', 
                     gapiError ? gapiError.status : 'N/A', 
                     'TokenClientError:', error.error || 'N/A',
                     '), attempting token refresh. Retries left:', retries);
        try {
          await this.refreshToken();
          console.log('Token refresh attempt completed, retrying API call.');
          return await this.handleApiCall(apiFunction, retries - 1);
        } catch (refreshError) {
          console.error('Failed to refresh token during API call retry, or retry also failed.', refreshError);
          const authFailedError = new Error('Authentication required after refresh attempt failed.');
          authFailedError.originalError = refreshError;
          authFailedError.reauthRequired = true;
          throw authFailedError;
        }
      } else {
        if (isAuthError) {
          console.error('Auth error on API call and no retries left, or initial refresh failed.', error);
          const authFailedError = new Error('Authentication failed after retries.');
          authFailedError.originalError = error;
          authFailedError.reauthRequired = true;
          throw authFailedError;
        }
        console.error('API call failed (not an auth error or retries exhausted):', error);
        throw error; 
      }
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();