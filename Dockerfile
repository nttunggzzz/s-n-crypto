# The whole exchange in one image: API + realtime (/ws) + the exchange web app's production build,
# served by ONE process (CLAUDE.md invariant 5). Railway builds it from the repo root (railway.json).
#   docker build -t cex .   ·   docker run -p 8080:8080 --env-file .env.staging cex
# Required env in production: DATABASE_URL, APP_URL, DATA_ENCRYPTION_KEY, EMAIL_TRANSPORT=resend,
# RESEND_API_KEY, EMAIL_FROM (see .env.example and docs/deploy/railway.md).

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
# every workspace (UI included once merged): dev dependencies are needed to build the web app
RUN npm ci --no-audit --no-fund
RUN if [ -f apps/exchange/package.json ]; then npm run build -w @cex/exchange-web; fi
# keep only what the server needs at runtime (drops vite, vitest, playwright, embedded-postgres…)
RUN npm prune --omit=dev --no-audit --no-fund \
 && rm -rf legacy e2e .github docs apps/*/src apps/*/node_modules/.vite

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST=/app/apps/exchange/dist \
    MARKET_FEED=binance
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8080
# migrations run at start-up (after the single-instance lock); SIGTERM shuts down cleanly
WORKDIR /app/server
CMD ["node", "--import", "tsx", "src/main.ts"]
