ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY scripts/check-runtime-dependencies.mjs ./scripts/
RUN npm ci --omit=dev --ignore-scripts \
    && npm rebuild --omit=dev better-sqlite3 @lancedb/lancedb sharp --foreground-scripts \
    && node scripts/check-runtime-dependencies.mjs

FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY web/package.json web/package-lock.json ./web/
COPY web/scripts ./web/scripts
RUN npm --prefix web ci --ignore-scripts \
    && node web/scripts/patch-element-plus-tabs.mjs

COPY tsconfig.json ./
COPY config/brand.defaults.json ./config/brand.defaults.json
COPY src ./src
COPY web ./web

RUN npm run build && npm --prefix web run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV DATA_DIR=/app/data
ENV LOG_DIR=/app/data/logs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/config/brand.defaults.json ./config/brand.defaults.json
COPY package.json package-lock.json ./
COPY LICENSE NOTICE ./
COPY --from=deps /app/scripts/check-runtime-dependencies.mjs ./scripts/

RUN mkdir -p /app/data \
    && chown node:node /app/data

USER node

VOLUME ["/app/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "--input-type=module", "--eval", "const response = await fetch('http://127.0.0.1:' + process.env.PORT + '/api/health'); if (!response.ok) process.exit(1)"]

CMD ["node", "dist/index.js"]
