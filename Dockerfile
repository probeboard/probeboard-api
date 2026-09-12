FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Lifecycle scripts are not needed to build, and the `prepare` script installs
# git hooks that have no meaning inside an image.
RUN npm ci --ignore-scripts
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
# --ignore-scripts is required, not merely tidy: `prepare` runs husky, which is
# a devDependency and therefore absent here. It also keeps arbitrary install
# scripts out of the runtime image.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/api/main.js"]
