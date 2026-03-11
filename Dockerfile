# ---- base ----
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9 --activate
RUN useradd -m -u 1001 botuser
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/common/package.json packages/common/
COPY packages/db/package.json packages/db/
COPY packages/security/package.json packages/security/
COPY packages/pool-monitor/package.json packages/pool-monitor/
COPY packages/hedging-engine/package.json packages/hedging-engine/
COPY packages/dashboard/package.json packages/dashboard/
COPY apps/bot/package.json apps/bot/
RUN pnpm install --frozen-lockfile

# ---- dashboard-build ----
FROM deps AS dashboard-build
COPY . .
RUN pnpm --filter @trading-bot/dashboard build

# ---- bot (target) ----
FROM deps AS bot
COPY . .
RUN mkdir -p /app/data && chown botuser:botuser /app/data
RUN mkdir -p /home/botuser/.trading-bot-cgr && chown botuser:botuser /home/botuser/.trading-bot-cgr
ENV NODE_ENV=production
USER botuser
CMD ["node", "--no-warnings", "--import", "tsx", "apps/bot/src/main.ts"]

# ---- dashboard (target) ----
FROM base AS dashboard
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/common/node_modules ./packages/common/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=dashboard-build /app/packages/dashboard/.next ./packages/dashboard/.next
COPY . .
RUN mkdir -p /app/data && chown botuser:botuser /app/data
ENV NODE_ENV=production
USER botuser
EXPOSE 3000
CMD ["pnpm", "--filter", "@trading-bot/dashboard", "start"]

# ---- combined (single service for Railway — no VOLUME, Railway manages volumes) ----
FROM deps AS combined
COPY . .
COPY --from=dashboard-build /app/packages/dashboard/.next ./packages/dashboard/.next
RUN mkdir -p /app/data && chown botuser:botuser /app/data
RUN mkdir -p /home/botuser/.trading-bot-cgr && chown botuser:botuser /home/botuser/.trading-bot-cgr
ENV NODE_ENV=production
USER botuser
EXPOSE 3000
CMD ["bash", "scripts/start-railway.sh"]
