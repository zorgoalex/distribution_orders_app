export const GOOGLE_SHEETS_CONFIG = {
  API_KEY: process.env.REACT_APP_GOOGLE_API_KEY,
  CLIENT_ID: process.env.REACT_APP_GOOGLE_CLIENT_ID,
  SPREADSHEET_ID: process.env.REACT_APP_SPREADSHEET_ID,
  /* SPREADSHEET_ID: (() => {
    const id = process.env.REACT_APP_SPREADSHEET_ID;
    if (!id) {
      console.error('SPREADSHEET_ID is not defined!');
    }
    console.log('Using spreadsheet ID:', id);
    return id; 
  })(),*/
  SCOPES: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
  ],
  COLUMNS: {
    ORDER_DATE: 'A',
    ORDER_NUMBER: 'B',
    PRISADKA_NUMBER: 'C',
    CLIENT: 'D',
    AREA: 'E',
    MILLING_TYPE: 'F',
    PLANNED_DATE: 'G',
    STATUS: 'H',
    PAYMENT: 'I',
    REMAINING_PAYMENT: 'J',
    DELIVERY_DATE: 'K',
    PHONE: 'L'
  },
  VALID_VALUES: {
    STATUS: ['готов', 'выдан'],
    PAYMENT: ['не оплачен', 'в долг', 'частично', 'оплачен'],
    MILLING_TYPE: ['модерн', 'фрезеровка', 'черновой']
  }
};