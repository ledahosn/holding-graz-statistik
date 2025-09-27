# api/Dockerfile

# ---- Base Stage ----
FROM node:18-slim AS base
WORKDIR /usr/src/app
COPY package*.json ./

# ---- Dependencies Stage ----
FROM base AS dependencies
RUN npm install --production

# ---- Build Stage ----
FROM base AS build
COPY . .
RUN npm install
# If you had a build step, you would run it here

# ---- Production Stage ----
FROM node:18-slim AS production
WORKDIR /usr/src/app
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app .
EXPOSE 3001
CMD ["node", "index.js"]