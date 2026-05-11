FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build:web

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV CC_SWITCH_WEB_HOST=0.0.0.0
ENV CC_SWITCH_WEB_PORT=3000
ENV CC_SWITCH_WEB_DATA_DIR=/data
ENV CC_SWITCH_WEB_STATIC_DIR=/app/dist
COPY --from=build /app/dist ./dist
COPY server ./server
EXPOSE 3000
VOLUME ["/data", "/root/.codex", "/root/.claude"]
CMD ["node", "server/web-server.mjs"]
