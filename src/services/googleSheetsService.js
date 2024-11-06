import { GOOGLE_SHEETS_CONFIG } from '../config/googleSheets';
import { format, parse } from 'date-fns';

class GoogleSheetsService {
  constructor() {
    this.gapi = null;
    this.orders = [];
  }

  async loadGoogleAPI() {
    if (window.gapi) return window.gapi;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.gapi) {
          resolve(window.gapi);
        } else {
          reject(new Error('Failed to load Google API: window.gapi is undefined'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load Google API script'));
      document.body.appendChild(script);
    });
  }

  async init() {
    try {
      console.log('Initializing Google API...');
      this.gapi = await this.loadGoogleAPI();
      
      console.log('Loading client and auth2...');
      await new Promise((resolve, reject) => {
        this.gapi.load('client:auth2', {
          callback: resolve,
          onerror: (error) => reject(new Error(`Failed to load client:auth2: ${error.message}`))
        });
      });

      console.log('Initializing gapi client...');
      await this.gapi.client.init({
        apiKey: GOOGLE_SHEETS_CONFIG.API_KEY,
        clientId: GOOGLE_SHEETS_CONFIG.CLIENT_ID,
        discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
        scope: GOOGLE_SHEETS_CONFIG.SCOPES.join(' '),
      });

      console.log('Google API initialized successfully');
    } catch (error) {
      console.error('Error initializing Google API:', error);
      throw new Error(`Failed to initialize Google API: ${error.message}`);
    }
  }

  async signIn() {
    try {
      const googleAuth = this.gapi.auth2.getAuthInstance();
      const user = await googleAuth.signIn({prompt: 'select_account'});
      return user.getBasicProfile().getEmail();
    } catch (error) {
      console.error('Error signing in:', error);
      throw new Error(`Failed to sign in: ${error.message}`);
    }
  }

  async signOut() {
    try {
      const googleAuth = this.gapi.auth2.getAuthInstance();
      await googleAuth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      throw new Error(`Failed to sign out: ${error.message}`);
    }
  }

  isSignedIn() {
    return this.gapi && this.gapi.auth2.getAuthInstance().isSignedIn.get();
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    
    try {
      const date = parse(dateStr, 'dd.MM.yyyy', new Date());
      return format(date, 'dd.MM.yyyy');
    } catch (error) {
      console.warn('Unexpected date format:', dateStr);
      return dateStr;
    }
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
      this.orders = this.parseOrdersData(response.result.values);
      console.log('Parsed orders:', this.orders);
      return this.orders;
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
      
      return {
        orderDate: row[0],
        orderNumber: row[1],
        prisadkaNumber: row[2],
        client: row[3],
        area: areaValue,
        millingType: row[5],
        plannedDate: this.formatDate(row[6]),
        status: row[7],
        payment: row[8] ? row[8] : ' ',
        remainingPayment: row[9],
        deliveryDate: row[10] ? this.formatDate(row[10]) : '',
        phone: row[11]
      };
    });
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

  async updateOrderStatus(rowIndex, newStatus, deliveryDate = '') {
    try {
      await this.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID,
        range: `H${rowIndex + 2}:K${rowIndex + 2}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[newStatus, '', '', deliveryDate]]
        }
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();