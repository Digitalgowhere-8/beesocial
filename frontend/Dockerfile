FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# 1. Accept the argument from GitHub Actions
ARG VITE_API_BASE_URL

# 2. Write it directly to the environment file inside the container filesystem
RUN echo "VITE_API_BASE_URL=${VITE_API_BASE_URL}" > .env.production

# 3. Run the compile step (Vite will now 100% find and bake it)
RUN npm run build

FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]