import { GOOGLE_SHEETS_CONFIG } from '../config/googleSheets';

class GoogleSheetsService {
  constructor() {
    this.gapi = null;
    this.isInitialized = false;
    this.tokenClient = null;
    this.accessToken = null;
    this.orders = [];
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
        range: 'A2:N'
      });

      console.log('Raw response from sheets:', response);
      const orders = response.result.values.map(row => {
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
    } catch (error) {
      console.error('Error loading orders:', error);
      throw error;
    }
  }

  async updateOrderStatus(rowIndex, newStatus, deliveryDate = null) {
    try {
      const updates = [];
      
      // Обновляем статус
      updates.push({
        range: `${GOOGLE_SHEETS_CONFIG.COLUMNS.STATUS}${rowIndex + 2}`,
        values: [[newStatus]]
      });
      
      // Всегда обновляем дату выдачи (пустая строка, если deliveryDate null)
      updates.push({
        range: `${GOOGLE_SHEETS_CONFIG.COLUMNS.DELIVERY_DATE}${rowIndex + 2}`,
        values: [[deliveryDate ? this.formatDate(deliveryDate) : '']]
      });
      
      // Выполняем batch update
      await this.gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        resource: {
          valueInputOption: 'USER_ENTERED',
          data: updates
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
      // Форматируем дату перед отправкой
      const formattedDate = this.formatDate(newDate);
      
      await this.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        range: `G${rowIndex + 2}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[formattedDate]] // Используем отформатированную дату
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
    
    // Если это объект Date или ISO строка
    if (dateStr instanceof Date || dateStr.includes('T')) {
      const date = new Date(dateStr);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    }
    
    // Обработка различных форматов даты
    const formats = [
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
      /^(\d{2})\.(\d{2})\.(\d{4})$/, // DD.MM.YYYY
      /^(\d{4})-(\d{2})-(\d{2})$/    // YYYY-MM-DD
    ];

    for (let format of formats) {
      const match = dateStr.match(format);
      if (match) {
        const [_, part1, part2, part3] = match;
        // Всегда возвращаем в формате DD.MM.YYYY
        if (format === formats[0]) { // из DD/MM/YYYY
          return `${part1}.${part2}.${part3}`;
        } else if (format === formats[1]) { // уже в DD.MM.YYYY
          return dateStr;
        } else { // из YYYY-MM-DD
          return `${part3}.${part2}.${part1}`;
        }
      }
    }

    // Если формат не распознан, логируем предупреждение и возвращаем исходную строку
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
    try {
      const rowIndex = this.orders.findIndex(o => o.orderNumber === order.orderNumber);
      
      // Всегда обновляем планируемую дату
      await this.updatePlannedDate(rowIndex, targetDate);
      
      // Обновляем дату выдачи только если это запрошено И заказ имеет статус "выдан"
      if (updateDeliveryDate && order.status === 'выдан') {
        await this.updateOrderStatus(rowIndex, order.status, targetDate);
      }
      
      return await this.loadOrders();
    } catch (error) {
      console.error('Error moving order:', error);
      throw new Error('Ошибка при перемещении заказа');
    }
  }

  async handleCheckboxChange(order, isChecked, issueDate) {
    try {
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
    } catch (error) {
      console.error('Error in handleCheckboxChange:', error);
      throw new Error('Ошибка при обновлении статуса заказа');
    }
  }

  async getUserInfo() {
    try {
      const response = await this.gapi.client.drive.about.get({
        fields: 'user'
      });
      return response.result.user;
    } catch (error) {
      console.error('Error getting user info:', error);
      return null;
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();