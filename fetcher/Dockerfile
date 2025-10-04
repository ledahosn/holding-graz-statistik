# api/Dockerfile & fetcher/Dockerfile

# ---- Base Stage ----
# Use Node.js v22 for modern features like --watch
FROM node:24-slim AS base
WORKDIR /usr/src/app
COPY package*.json ./

# ---- Development Stage ----
# This stage installs all dependencies (including dev) and is used for development
FROM base AS development
RUN npm install
# The command will be provided by docker-compose.dev.yml
CMD ["node", "--watch", "index.js"]

# ---- Production Dependencies Stage ----
# This stage only installs production dependencies for a smaller final image
FROM base AS dependencies
RUN npm install --production

# ---- Production Stage ----
# This is the final, lean production image
FROM node:24-slim AS production
WORKDIR /usr/src/app
# Copy only necessary files from previous stages
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=development /usr/src/app .

EXPOSE 3001
CMD ["node", "index.js"]