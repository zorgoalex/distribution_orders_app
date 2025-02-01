// src/constants/index.js

export const STATUSES = {
  COMPLETED: 'готов',
  DELIVERED: 'выдан',
  CUT: 'распилен',
  UNKNOWN: '-'
};

export const PAYMENT_STATUSES = {
  UNPAID: 'не оплачен',
  DEBT: 'в долг',
  PARTIAL: 'частично',
  PAID: 'оплачен',
  COMPANY: 'за счет фирмы'
};

export const MILLING_TYPES = {
  MODERN: 'модерн',
  MILLING: 'фрезеровка',
  ROUGH: 'черновой',
  COLOR: 'краска',
  EXTRACT_TOP: 'выборка'
};