import { GOOGLE_SHEETS_CONFIG } from '../config/googleSheets';

class GoogleSheetsService {
  constructor() {
    this.gapi = null;
    this.isInitialized = false;
    this.tokenClient = null;
    this.accessToken = null;
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
      // 1. Load the Google API client library
      this.gapi = await this.loadGoogleAPI();

      // 2. Initialize the library with API key
      await new Promise((resolve, reject) => {
        this.gapi.load('client', {
          callback: resolve,
          onerror: reject
        });
      });

      // 3. Initialize the API client
      await this.gapi.client.init({
        apiKey: GOOGLE_SHEETS_CONFIG.API_KEY,
        discoveryDocs: [
          'https://sheets.googleapis.com/$discovery/rest?version=v4',
          'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
        ],
      });

      // 4. Load Google Identity Services and wait for it to be ready
      const google = await this.loadGoogleIdentityServices();

      // 5. Initialize token client with persistence
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_SHEETS_CONFIG.CLIENT_ID,
        scope: GOOGLE_SHEETS_CONFIG.SCOPES.join(' '),
        prompt: '', // Suppress the prompt if we have a saved token
        callback: (tokenResponse) => {
          if (tokenResponse.error !== undefined) {
            throw tokenResponse;
          }
          this.accessToken = tokenResponse.access_token;
          this.gapi.client.setToken(tokenResponse);
          
          localStorage.setItem('gauth_token', JSON.stringify({
            access_token: tokenResponse.access_token,
            expires_at: Date.now() + (tokenResponse.expires_in * 1000)
          }));
        },
      });

      const savedToken = localStorage.getItem('gauth_token');
      if (savedToken) {
        const tokenData = JSON.parse(savedToken);
        const now = Date.now();
        
        if (tokenData.expires_at > now) {
          this.accessToken = tokenData.access_token;
          this.gapi.client.setToken({
            access_token: tokenData.access_token
          });
        } else {
          localStorage.removeItem('gauth_token');
        }
      }

      this.isInitialized = true;
      return this.tokenClient;
    } catch (error) {
      console.error('Error initializing Google API:', error);
      throw error;
    }
  }

  async signIn() {
    if (!this.isInitialized || !this.tokenClient) {
      throw new Error('Service not initialized');
    }

    return new Promise((resolve, reject) => {
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
            resolve(tokenData);
            return;
          } else {
            localStorage.removeItem('gauth_token');
          }
        }

        this.tokenClient.callback = async (response) => {
          if (response.error !== undefined) {
            reject(response);
          }
          this.accessToken = response.access_token;
          this.gapi.client.setToken(response);

          localStorage.setItem('gauth_token', JSON.stringify({
            access_token: response.access_token,
            expires_at: Date.now() + (response.expires_in * 1000)
          }));

          resolve(response);
        };
        
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err) {
        console.error('Error signing in:', err);
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
    try {
      const response = await this.gapi.client.drive.files.get({
        fileId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        fields: 'capabilities'
      });

      return response.result.capabilities.canEdit || false;
    } catch (error) {
      console.error('Error checking edit access:', error);
      return false;
    }
  }

  async loadOrders() {
    try {
      console.log('Loading orders from spreadsheet...');
      const response = await this.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        range: 'A2:L'
      });

      console.log('Raw response from sheets:', response);
      const orders = this.parseOrdersData(response.result.values);
      console.log('Parsed orders:', orders);
      return orders;
    } catch (error) {
      console.error('Error loading orders:', error);
      throw error;
    }
  }

  parseOrdersData(rawData) {
    if (!rawData) {
      console.log('No raw data received');
      return [];
    }

    console.log('Parsing raw data:', rawData);
    
    return rawData.map(row => {
      let areaValue = 0;
      if (row[4]) {
        const normalizedArea = String(row[4]).replace(',', '.');
        const parsedArea = Number(normalizedArea);
        areaValue = !isNaN(parsedArea) ? parsedArea : 0;
      }
      
      const order = {
        orderDate: row[0],
        orderNumber: row[1],
        prisadkaNumber: row[2],
        client: row[3],
        area: areaValue,
        millingType: row[5],
        plannedDate: this.formatDate(row[6]),
        status: row[7],
        payment: row[8] ? row[8] : ' ', // Если значение пустое, ставим пробел
        remainingPayment: row[9],
        deliveryDate: row[10] ? this.formatDate(row[10]) : '',
        phone: row[11]
      };
      console.log('Parsed order:', order);
      return order;
    });
  }

  async updateOrderStatus(rowIndex, status, deliveryDate) {
    try {
      await this.gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        resource: {
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: `H${rowIndex + 2}`,
              values: [[status]]
            },
            {
              range: `K${rowIndex + 2}`,
              values: [[deliveryDate]]
            }
          ]
        }
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  async watchForChanges(callback) {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    const CHECK_INTERVAL = 3000; // 3 секунды между проверками
    
    const checkForChanges = async () => {
      try {
        const orders = await this.loadOrders();
        callback(orders);
      } catch (error) {
        console.error('Error watching for changes:', error);
      }
    };

    await checkForChanges();

    const intervalId = setInterval(checkForChanges, CHECK_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }

  async updatePlannedDate(rowIndex, newDate) {
    try {
      await this.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        range: `G${rowIndex + 2}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[newDate]]
        }
      });
    } catch (error) {
      console.error('Error updating planned date:', error);
      throw error;
    }
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    
    const formats = [
      /^(\d{2})\/(\d{2})\/(\d{2})$/,
      /^(\d{2})\.(\d{2})\.(\d{4})$/,
      /^(\d{4})-(\d{2})-(\d{2})$/
    ];

    for (let format of formats) {
      const match = dateStr.match(format);
      if (match) {
        const [_, part1, part2, part3] = match;
        if (format === formats[0]) { // DD/MM/YY
          return `${part1}.${part2}.20${part3}`;
        } else if (format === formats[1]) { // DD.MM.YYYY
          return dateStr;
        } else { // YYYY-MM-DD
          return `${part3}.${part2}.${part1}`;
        }
      }
    }

    console.warn('Unexpected date format:', dateStr);
    return dateStr;
  }

  getTotalArea(orders) {
    if (!orders || !Array.isArray(orders)) return '0.00';
    return orders.reduce((sum, order) => sum + parseFloat(order.area || 0), 0).toFixed(2);
  }

  getCellWidth() {
    return 'w-full';
  }

  async handleOrderMove(order, sourceDate, targetDate, updateDeliveryDate = false) {
    try {
      const rowIndex = this.orders.findIndex(o => o.orderNumber === order.orderNumber);
      await this.updatePlannedDate(rowIndex, targetDate);
      
      if (updateDeliveryDate) {
        await this.updateOrderStatus(rowIndex, order.status, targetDate);
      }
      
      return await this.loadOrders();
    } catch (error) {
      console.error('Error moving order:', error);
      throw new Error('Ошибка при перемещении заказа');
    }
  }

  async handleCheckboxChange(order, isChecked) {
    try {
      const rowIndex = this.orders.findIndex(o => o.orderNumber === order.orderNumber);
      const newStatus = isChecked ? 'выдан' : 'готов';
      await this.updateOrderStatus(rowIndex, newStatus);
      return await this.loadOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
      throw new Error('Ошибка при обновлении статуса заказа');
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();