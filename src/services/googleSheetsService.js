import { GOOGLE_SHEETS_CONFIG } from '../config/googleSheets';
// test
class GoogleSheetsService {
  constructor() {
    this.gapi = null;
    this.isInitialized = false;
    this.tokenClient = null;
    this.accessToken = null;
    this.idToken = null;
    this.idTokenPayload = null;
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
          'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
          'https://www.googleapis.com/discovery/v1/apis/oauth2/v2/rest'
        ],
      });

      const google = await this.loadGoogleIdentityServices();

      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_SHEETS_CONFIG.CLIENT_ID,
        scope: GOOGLE_SHEETS_CONFIG.SCOPES.join(' '),
        prompt: '',
        callback: (tokenResponse) => {
          console.log('TokenClient callback for access_token. Full tokenResponse:', JSON.stringify(tokenResponse, null, 2));
          if (tokenResponse.error) {
            console.error("Token client error (access_token):", tokenResponse.error, tokenResponse.error_description);
            if (this.isRefreshingToken && this.tokenRefreshPromiseResolver) {
              this.tokenRefreshPromiseResolver.reject(tokenResponse);
            } else if (!this.isRefreshingToken) {
              // Potentially notify parts of the app that rely on access_token
            }
          } else {
            this.accessToken = tokenResponse.access_token;
            // this.gapi.client.setToken(tokenResponse); // setToken is not strictly necessary here as gapi client doesn't use it directly for token management.
                                                       // Instead, ensure accessToken is passed to API calls.
            
            localStorage.setItem('gauth_token', JSON.stringify({
              access_token: tokenResponse.access_token,
              expires_at: Date.now() + (tokenResponse.expires_in * 1000)
            }));
            console.log('Access Token acquired/refreshed successfully via TokenClient callback.');
            
            if (this.isRefreshingToken && this.tokenRefreshPromiseResolver) {
              this.tokenRefreshPromiseResolver.resolve(this.accessToken);
            }
            // Execute any pending callbacks that were waiting for the access token
            this.onTokenAcquiredCallbacks.forEach(cb => cb.resolve(this.accessToken));
            this.onTokenAcquiredCallbacks = [];

          }
          
          if (this.isRefreshingToken) {
            this.isRefreshingToken = false;
            this.tokenRefreshPromiseResolver = null;
          }
        },
      });

      // Load accessToken from localStorage
      const savedToken = localStorage.getItem('gauth_token');
      if (savedToken) {
        const tokenData = JSON.parse(savedToken);
        if (tokenData.expires_at > Date.now()) {
          this.accessToken = tokenData.access_token;
          // this.gapi.client.setToken({ access_token: tokenData.access_token }); // Similar to above, direct gapi.client.setToken is less critical here
          console.log('Initialized with access token from localStorage.');
        } else {
          localStorage.removeItem('gauth_token');
          console.log('Removed stale access token from localStorage during init.');
        }
      }
      
      // Load idTokenPayload from localStorage
      const savedIdPayload = localStorage.getItem('gauth_id_token_payload');
      if (savedIdPayload) {
        try {
          this.idTokenPayload = JSON.parse(savedIdPayload);
          if (this.idTokenPayload && this.idTokenPayload.exp && (this.idTokenPayload.exp * 1000 < Date.now())) {
              console.log('Stored ID token payload has expired.');
              this.idTokenPayload = null;
              this.idToken = null; // Also clear the raw token if payload is expired
              localStorage.removeItem('gauth_id_token_payload');
              // Potentially clear gauth_token as well if ID token is the primary auth proof
          } else {
              console.log('Initialized with ID token payload from localStorage:', this.idTokenPayload);
              // If we have a valid payload, we might have the idToken too (though not strictly necessary to store raw idToken long term)
          }
        } catch (e) {
          console.error('Failed to parse saved ID token payload:', e);
          this.idTokenPayload = null;
          this.idToken = null;
          localStorage.removeItem('gauth_id_token_payload');
        }
      }

      this.isInitialized = true;
      return this.tokenClient;
    } catch (error) {
      console.error('Error initializing Google API or TokenClient:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async processIdTokenResponse(credentialResponse) {
    if (!credentialResponse || !credentialResponse.credential) {
      console.error('Invalid credentialResponse received in processIdTokenResponse');
      throw new Error('Invalid credentialResponse');
    }
    const idTokenString = credentialResponse.credential;
    this.idToken = idTokenString;
    console.log('Received ID Token:', idTokenString ? 'Yes' : 'No');

    try {
      this.idTokenPayload = this.parseJwt(idTokenString);
      localStorage.setItem('gauth_id_token_payload', JSON.stringify(this.idTokenPayload));
      console.log('ID token processed and payload stored:', this.idTokenPayload);

      // Critical step: After successfully processing id_token, request access_token
      if (this.tokenClient) {
        console.log('Requesting access_token with prompt:none and hint.');
        this.tokenClient.requestAccessToken({
          prompt: 'none',
          hint: this.idTokenPayload?.email
        });
      } else {
        console.error('TokenClient not initialized before requesting access token in processIdTokenResponse');
        // This case should ideally not happen if initialize() is called before any sign-in attempt
        await this.initialize(); // Attempt to initialize if not already
        if (this.tokenClient) {
            this.tokenClient.requestAccessToken({
              prompt: 'none',
              hint: this.idTokenPayload?.email
            });
        } else {
            throw new Error("Failed to initialize TokenClient for access token request.");
        }
      }
      return this.idTokenPayload;
    } catch (e) {
      console.error('Failed to parse or store ID token:', e);
      this.idToken = null;
      this.idTokenPayload = null;
      localStorage.removeItem('gauth_id_token_payload');
      throw e;
    }
  }

  async signIn() {
    // This method is now largely superseded by the GSI flow in LoginPage.js
    // It might be called as a fallback or if parts of the app still use it.
    // For now, let's ensure it doesn't interfere with the new flow.
    console.warn('googleSheetsService.signIn() called. This method is being deprecated in favor of GSI flow in LoginPage.');
    
    // If already authenticated (e.g. via GSI flow), resolve immediately.
    if (this.isAuthenticated()) {
        console.log("signIn: Already authenticated based on idTokenPayload and accessToken.");
        return Promise.resolve(this.idTokenPayload); 
    }

    // If not authenticated, this method should ideally not be the primary way to sign in.
    // The GSI flow initiated from UI (LoginPage) should handle it.
    // If we want this to trigger the GSI flow, it would need a way to communicate with the UI layer.
    // For now, returning a rejected promise or a specific status might be best.
    return Promise.reject(new Error("Sign-in should be initiated via Google Identity Services UI."));
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
    // Check for valid idTokenPayload (and its expiration)
    const hasValidIdTokenPayload = this.idTokenPayload && 
                                   this.idTokenPayload.exp && 
                                   (this.idTokenPayload.exp * 1000 > Date.now());

    // Check for accessToken (and its expiration, if gauth_token stores it)
    let hasValidAccessToken = !!this.accessToken;
    if (!hasValidAccessToken) {
        const savedToken = localStorage.getItem('gauth_token');
        if (savedToken) {
            try {
                const tokenData = JSON.parse(savedToken);
                if (tokenData.access_token && tokenData.expires_at > Date.now()) {
                    hasValidAccessToken = true;
                    this.accessToken = tokenData.access_token; // Restore if found valid
                }
            } catch (e) {
                console.warn("Error parsing gauth_token in isAuthenticated", e);
            }
        }
    }
    
    const authenticated = hasValidIdTokenPayload && hasValidAccessToken;
    console.log(`isAuthenticated: idTokenPayload valid: ${!!hasValidIdTokenPayload}, accessToken valid: ${!!hasValidAccessToken}, Result: ${authenticated}`);
    return authenticated;
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

  async getUserInfo_V2() {
    console.log('getUserInfo_V2 called.');
    if (this.idTokenPayload) {
      console.log('Returning user info from this.idTokenPayload:', this.idTokenPayload);
      return {
        email: this.idTokenPayload.email,
        name: this.idTokenPayload.name,
        given_name: this.idTokenPayload.given_name,
        family_name: this.idTokenPayload.family_name,
        picture: this.idTokenPayload.picture,
      };
    }

    const savedIdPayload = localStorage.getItem('gauth_id_token_payload');
    if (savedIdPayload) {
      try {
        const payload = JSON.parse(savedIdPayload);
        if (payload && payload.exp && (payload.exp * 1000 > Date.now())) {
          this.idTokenPayload = payload; // Cache it back
          console.log('Returning user info from localStorage (gauth_id_token_payload):', payload);
          return {
            email: payload.email,
            name: payload.name,
            given_name: payload.given_name,
            family_name: payload.family_name,
            picture: payload.picture,
          };
        } else if (payload) {
            console.log("User info from localStorage is expired.");
            localStorage.removeItem('gauth_id_token_payload');
            this.idTokenPayload = null; // Clear stale data
        }
      } catch (e) {
        console.error('Failed to parse gauth_id_token_payload in getUserInfo_V2:', e);
        localStorage.removeItem('gauth_id_token_payload');
        this.idTokenPayload = null; // Clear stale data
      }
    }
    
    console.log('User info not available in idTokenPayload or localStorage.');
    // Removed the gapi.client.oauth2.userinfo.get() call as it's deprecated and was causing issues.
    // The id_token is now the source of truth for user info.
    // If we reach here, it means the user is likely not authenticated or id_token is missing.
    return {
        email: 'Пользователь не определен',
        name: 'Неизвестный пользователь',
    };
  }

  parseJwt(token) {
    if (!token) return null;
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error("Error parsing JWT: ", e);
      return null;
    }
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
      
      console.log('Attempting silent token refresh (prompt: none) via refreshToken method, with hint.');
      try {
        // Try to get email from idTokenPayload or a fresh one from localStorage if service's is stale
        let userEmailHint = this.idTokenPayload?.email;
        if (!userEmailHint) {
            const savedIdPayload = localStorage.getItem('gauth_id_token_payload');
            if (savedIdPayload) {
                try {
                    const payload = JSON.parse(savedIdPayload);
                    if (payload && payload.exp && (payload.exp * 1000 > Date.now())) {
                        userEmailHint = payload.email;
                    }
                } catch (e) { console.warn('Could not parse stored id token for hint in refreshToken'); }
            }
        }

        this.tokenClient.requestAccessToken({
          prompt: 'none',
          hint: userEmailHint // Add hint, ensuring it could be null if not found
        });
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