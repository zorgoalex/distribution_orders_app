export const GOOGLE_SHEETS_CONFIG = {
  API_KEY: process.env.REACT_APP_GOOGLE_API_KEY,
  CLIENT_ID: process.env.REACT_APP_GOOGLE_CLIENT_ID,
  SPREADSHEET_ID: process.env.REACT_APP_SPREADSHEET_ID,
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
    PHONE: 'L',
    CAD_FILES: 'M',
    MATERIAL: 'N'
  },
  VALID_VALUES: {
    STATUS: ['готов', 'выдан', 'распилен', '-'],
    PAYMENT: ['не оплачен', 'в долг', 'частично', 'оплачен', 'за счет фирмы'],
    MILLING_TYPE: ['модерн', 'фрезеровка', 'черновой', 'краска'],
    CAD_FILES: ['_', 'отрисован'],
    MATERIAL: ['16мм', '18мм', '8мм', '10мм', 'ЛДСП']
  }
};