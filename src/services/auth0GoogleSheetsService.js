import { GOOGLE_SHEETS_CONFIG } from '../config/googleSheets';

class Auth0GoogleSheetsService {
  constructor() {
    this.gapi = null;
    this.isInitialized = false;
    this.orders = [];
  }

  async initialize(accessToken) {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load Google API client library
      this.gapi = await this.loadGoogleAPI();

      // Initialize the library with API key
      await new Promise((resolve, reject) => {
        this.gapi.load('client', {
          callback: resolve,
          onerror: reject
        });
      });

      // Initialize the API client
      await this.gapi.client.init({
        apiKey: GOOGLE_SHEETS_CONFIG.API_KEY,
        discoveryDocs: [
          'https://sheets.googleapis.com/$discovery/rest?version=v4',
          'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
        ],
      });

      // Set the access token from Auth0
      this.gapi.client.setToken({
        access_token: accessToken
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing Google API:', error);
      throw error;
    }
  }

  async loadGoogleAPI() {
    if (window.gapi) {
      return window.gapi;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        setTimeout(() => {
          if (window.gapi) {
            resolve(window.gapi);
          } else {
            reject(new Error('Failed to load Google API'));
          }
        }, 100);
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });
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

  formatDate(dateStr) {
    if (!dateStr) return '';
    
    if (dateStr.includes('.')) {
      return dateStr;
    }
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return dateStr;
      }
      
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    } catch (error) {
      return dateStr;
    }
  }

  // Остальные методы из старого сервиса...
  async updateOrderStatus(rowIndex, newStatus, deliveryDate = null) {
    try {
      const updates = [];
      
      updates.push({
        range: `H${rowIndex + 2}`,
        values: [[newStatus]]
      });
      
      if (deliveryDate) {
        updates.push({
          range: `K${rowIndex + 2}`,
          values: [[deliveryDate ? this.formatDate(deliveryDate) : '']]
        });
      }
      
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

  async updatePlannedDate(rowIndex, newDate) {
    try {
      await this.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        range: `G${rowIndex + 2}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[this.formatDate(newDate)]]
        }
      });
    } catch (error) {
      console.error('Error updating planned date:', error);
      throw error;
    }
  }

  async handleOrderMove(order, sourceDate, targetDate, updateDeliveryDate = false) {
    try {
      if (!this.orders || !this.orders.length) {
        throw new Error('Orders not loaded');
      }

      const rowIndex = this.orders.findIndex(o => o.orderNumber === order.orderNumber);
      if (rowIndex === -1) {
        throw new Error(`Order ${order.orderNumber} not found`);
      }

      await this.updatePlannedDate(rowIndex, targetDate);
      
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

      const newStatus = isChecked ? 'выдан' : 'готов';
      await this.updateOrderStatus(rowIndex, newStatus, isChecked ? issueDate : null);
      
      return await this.loadOrders();
    } catch (error) {
      console.error('Error updating checkbox:', error);
      throw new Error('Ошибка при обновлении статуса заказа');
    }
  }

  getTotalArea(orders) {
    return orders.reduce((total, order) => {
      const area = parseFloat(order.area.replace(',', '.')) || 0;
      return total + area;
    }, 0).toString();
  }

  getCellWidth(orders) {
    const totalArea = this.getTotalArea(orders);
    const maxWidth = 200;
    const minWidth = 50;
    
    return Math.max(minWidth, Math.min(maxWidth, parseFloat(totalArea) * 10));
  }

  async watchForChanges(callback) {
    const CHECK_INTERVAL = 3000;
    
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

  async getUserInfo() {
    // В Auth0 версии получаем информацию о пользователе из Auth0, не из Google
    return { emailAddress: 'Auth0 User' };
  }
}

export const auth0GoogleSheetsService = new Auth0GoogleSheetsService(); 