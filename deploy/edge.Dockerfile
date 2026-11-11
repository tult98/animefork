# syntax=docker/dockerfile:1
# Builds the web app and bakes it into Caddy. Build context is the repo root.
FROM node:24-slim AS build
ENV NX_DAEMON=false CI=true
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter web...
# VITE_API_URL is compiled into the bundle, so it must be the public URL of this server.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm nx build web

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
