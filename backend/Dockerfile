# Production image for the Socorro team messenger backend.
# Runs Express + Socket.IO. Point Twenty at it via MESSENGER_BASE_URL.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# The migrate script reads raw .sql files from its own directory (dist/db/).
# tsc only emits .js files, so we bring the .sql assets along manually.
COPY --from=build /app/src/db/schema.sql ./dist/db/schema.sql
COPY --from=build /app/src/db/migrations ./dist/db/migrations

EXPOSE 3000
CMD ["node", "dist/index.js"]
