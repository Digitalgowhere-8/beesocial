FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Vite bakes VITE_* vars at build time from .env.production (written by CI)
RUN npm run build

FROM nginx:1.25-alpine
# Custom nginx config: SPA routing + caching headers
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
