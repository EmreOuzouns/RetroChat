FROM node:20-alpine
WORKDIR /app

# Bağımlılıkları kur
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

# Sunucu ve statik web uygulamasını kopyala
COPY server ./server
COPY www ./www

WORKDIR /app/server
EXPOSE 3000
CMD ["node", "index.js"]
