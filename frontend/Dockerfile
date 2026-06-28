# Step 1: Build the React application
FROM FROM mcr.microsoft.com/mirror/docker/library/node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Step 2: Serve the built static files using a light web server
FROM mcr.microsoft.com/mirror/docker/library/nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# If your app handles internal React routing, copy a basic nginx config if needed, otherwise this works for clean builds
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]