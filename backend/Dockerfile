FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
# Updated execution command to target your real file name
CMD ["node", "src/server.js"]