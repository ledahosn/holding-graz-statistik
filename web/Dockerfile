# web/Dockerfile

# Stage 0: Base image with Node.js 22
FROM node:24-slim as base
WORKDIR /usr/src/app
COPY package*.json ./

# Stage 1: Development server
# This target is used in docker-compose.dev.yml
FROM base as development
RUN npm install
COPY . .
# Expose Vite's default port
EXPOSE 5173
# The command is overridden in docker-compose.dev.yml to run the dev server
CMD ["npm", "run", "dev"]

# Stage 2: Build the application for production
# This target is the default for production builds
FROM base as build
RUN npm install
COPY . .
RUN npm run build

# Stage 3: Serve the application from Nginx for production
FROM nginx:1.25-alpine as production
# Copy the built assets from the 'build' stage
COPY --from=build /usr/src/app/dist /usr/share/nginx/html
# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]