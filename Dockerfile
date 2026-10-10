# Build stage
FROM node:22-bookworm AS build
WORKDIR /app

COPY package.json ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig.base.json ./

RUN npm install
RUN npm run build

# Production stage — reuse compiled native modules from build
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json

WORKDIR /app/apps/server
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
