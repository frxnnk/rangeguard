# CLAUDE.md - Trading Bot CGR

## Project Overview

Monorepo TypeScript para hedgear impermanent loss en pools Uniswap V3 usando perpetuos en Hyperliquid DEX. Cuando el precio sale del rango → abre hedge. Cuando vuelve → cierra.

## Commands

```bash
pnpm dev:bot           # Bot (tsx, no watch)
pnpm dev:dashboard     # Dashboard Next.js en :3000
pnpm test              # 62 tests via Vitest
pnpm typecheck         # tsc --noEmit en 7 packages
pnpm lint              # ESLint (0 errors, ~28 warnings)
pnpm format            # Prettier
pnpm build:dashboard   # Next.js production build
pnpm setup-testnet     # Genera wallets + vault + DB seed
pnpm setup-keys        # CLI interactivo para private keys
```

## Architecture

- `packages/common` - Types, constants (chains/pairs/ABIs), utils
- `packages/db` - SQLite (better-sqlite3, WAL), 6 tables, repository pattern
- `packages/security` - AES-256-GCM vault for private keys, scrypt KDF
- `packages/pool-monitor` - viem multi-chain, Swap WS + slot0 polling, range detector
- `packages/hedging-engine` - @nktkas/hyperliquid SDK, hedge calc, order executor
- `packages/dashboard` - Next.js 15, React 19, Tailwind 4, shadcn/ui, TanStack Query
- `apps/bot` - Bootstrap, event bus, config, graceful shutdown

## Key Patterns

- ESM throughout (`"type": "module"` in all package.json)
- Bot uses `import.meta.dirname` (Node 22+) for path resolution
- Dashboard uses `process.cwd()` for DB path
- HL SDK uses short field names: `a` (asset), `b` (isBuy), `p` (price), `s` (size)
- Range detector: debounce 3 consecutive + cooldown post-close
- Market orders = IOC limit with 1% slippage on HL
- One HL wallet per pool, one global profit wallet

## Database

SQLite WAL at `data/bot.db`. Tables: `wallets`, `pool_configs`, `hedge_trades`, `trade_log`, `pnl_snapshots`, `price_cache`.

## Dashboard

shadcn/ui (new-york, dark theme), 17 components. API routes at `/api/pools`, `/api/wallets`, `/api/hedges`, `/api/trades`, `/api/stats`, `/api/prices`, `/api/pnl`, `/api/bot-status`.

Config: `packages/dashboard/components.json`, `cn()` at `src/lib/utils.ts`.

## Testing

Vitest workspace config. Test DB: in-memory SQLite via `createTestDb()` in `packages/db/src/test-utils.ts`.

## Infrastructure

- Docker: multi-stage Dockerfile (targets: bot, dashboard), docker-compose with shared volume
- CI: `.github/workflows/ci.yml` (Node 22, pnpm 9)
- ESLint flat config + Prettier

## Security

Private keys stored in `~/.trading-bot-cgr/vault.enc` (AES-256-GCM, scrypt N=2^17). Never in DB or .env.

## Current Status

- All code complete, 62 tests passing, 0 typecheck errors
- Dashboard fully migrated to shadcn/ui
- Pending: fund wallets on HL testnet for real E2E testing
