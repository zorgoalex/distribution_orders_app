FROM node:18-alpine

WORKDIR /app

# Объявляем аргументы сборки
ARG REACT_APP_GOOGLE_API_KEY
ARG REACT_APP_GOOGLE_CLIENT_ID
ARG REACT_APP_SPREADSHEET_ID

# Копируем файлы package.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем все файлы проекта
COPY . .

# Создаем .env файл с переменными
RUN echo "REACT_APP_GOOGLE_API_KEY=${REACT_APP_GOOGLE_API_KEY}" > .env && \
    echo "REACT_APP_GOOGLE_CLIENT_ID=${REACT_APP_GOOGLE_CLIENT_ID}" >> .env && \
    echo "REACT_APP_SPREADSHEET_ID=${REACT_APP_SPREADSHEET_ID}" >> .env

# Проверяем содержимое .env (для отладки)
RUN cat .env

# Выполняем сборку
RUN npm run build

RUN npm install -g serve
EXPOSE 3001
CMD ["serve", "-s", "build", "-l", "3001"]