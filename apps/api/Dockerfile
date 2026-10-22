# Build context: repo root. docker build -f apps/api/Dockerfile .
# The API runs TypeScript via tsx (no emit build step), so dev deps stay in the image.
FROM node:20-slim AS deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter api...

FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=deps /repo ./
COPY apps/api apps/api
COPY packages packages
COPY db db
RUN chown -R node:node /repo
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1
# Worker: override command with `node --import tsx src/worker.ts`
CMD ["node", "--import", "tsx", "src/server.ts"]
