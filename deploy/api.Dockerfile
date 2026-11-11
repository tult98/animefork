# syntax=docker/dockerfile:1
# Build context is the repo root: docker build -f deploy/api.Dockerfile .
FROM node:24-slim AS build
ENV NX_DAEMON=false CI=true
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter api...
RUN pnpm nx build api
# Prod-only node_modules for the api, no other workspace package comes along.
RUN pnpm --filter api deploy --prod --legacy /out \
 && cp -r apps/api/dist /out/dist \
 && cp -r apps/api/db /out/db

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]
