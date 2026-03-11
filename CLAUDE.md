# CLAUDE.md - Trading Bot CGR

## What is this project?

Monorepo TypeScript para hedgear impermanent loss en pools Uniswap V3 usando perpetuos en Hyperliquid DEX. Cuando el precio sale del rango configurado, abre hedge automaticamente. Cuando vuelve, cierra y registra PnL.

## Quick Reference

```bash
# Development
pnpm install                # Install all dependencies
pnpm dev:bot                # Start bot (tsx, no watch)
pnpm dev:dashboard          # Start Next.js dashboard on :3000

# Quality checks (run all before committing)
pnpm test                   # 116 tests via Vitest
pnpm typecheck              # tsc --noEmit across 7 packages
pnpm lint                   # ESLint (0 errors, ~28 warnings expected)
pnpm format:check           # Prettier check

# Setup
pnpm testnet-seed           # Seed DB with dummy data (quick start)
pnpm setup-testnet          # Generate real wallets + vault + DB seed
pnpm setup-keys             # Interactive CLI for vault key management

# Build
pnpm build                  # Build all packages
pnpm build:dashboard        # Next.js production build
docker compose up -d        # Docker (bot + dashboard)
```

## Package Structure

```
packages/common          → Types, constants (chains/pairs/ABIs), utils (logger, tick-math, retry)
packages/db              → SQLite (better-sqlite3, WAL), 6 tables, repository pattern
packages/security        → AES-256-GCM vault for N wallet private keys, scrypt KDF
packages/pool-monitor    → viem multi-chain clients, Swap event WS + slot0 polling, range detector
packages/hedging-engine  → @nktkas/hyperliquid SDK, hedge calculator, order executor, wallet monitor, range trading engine
packages/dashboard       → Next.js 15 App Router, TanStack Query, Recharts, shadcn/ui (dark theme)
apps/bot                 → Bootstrap, event bus, config loader, graceful shutdown
```

## Key Patterns & Conventions

### Code style

- ESM throughout (`"type": "module"` in all package.json)
- singleQuote, trailingComma all, printWidth 100
- TypeScript strict mode
- shadcn/ui components in `packages/dashboard/src/components/ui/`
- Semantic design tokens: `text-foreground`, `bg-card`, `bg-muted`, `border-border` (never `text-white`, `bg-gray-*`)

### Runtime

- Bot uses `import.meta.dirname` (Node 22+) for path resolution
- Dashboard uses `process.cwd()` for DB path (Next.js convention)
- Bot dev: `node --no-warnings --import tsx src/main.ts` (no watch to avoid MaxListeners)
- Dashboard: next.config has `extensionAlias` (.js→.ts) + `serverExternalPackages` for better-sqlite3

### Hyperliquid SDK (`@nktkas/hyperliquid` v0.16)

- Short field names: `a` (asset index), `b` (isBuy), `p` (price), `s` (size), `t` (type), `r` (reduceOnly)
- Market orders = IOC limit with 1% slippage
- Asset resolution: coin names → numeric indices via `meta()` API
- SL trigger orders: `t: { trigger: { triggerPx, isMarket: true, tpsl: 'sl' } }`, `r: true`
- Cancel orders: `walletClient.cancel({ cancels: [{ a: assetIndex, o: orderId }] })`
- Transport: `new HttpTransport({ url: 'https://hyperliquid-testnet.xyz' })` (uses `url`, NOT `isTestnet`)
- WalletClient: `new WalletClient({ wallet, transport, isTestnet: true })` (`isTestnet` goes HERE, affects EIP-712 chain ID for signing)

### Architecture decisions

- One HL wallet per pool (perpetuals cancel opposing positions in same wallet)
- One global profit wallet shared across pools
- Manual pool config via dashboard (no on-chain LP position reading)
- Range detector: debounce 3 consecutive updates + cooldown post-close

## Database

SQLite WAL at `data/bot.db`. Tables: `wallets`, `pool_configs`, `hedge_trades`, `range_trades`, `trade_log`, `pnl_snapshots`, `price_cache`.

Private keys are NEVER stored in the DB — only in the encrypted vault file.

## Dashboard

shadcn/ui (new-york style, dark theme), 17 components installed. Config at `packages/dashboard/components.json`.

### API Routes

`/api/pools`, `/api/wallets`, `/api/hedges`, `/api/hedges/[id]/close`, `/api/trades`, `/api/range-trades`, `/api/stats`, `/api/prices`, `/api/pnl`, `/api/bot-status`

### Adding shadcn/ui components

```bash
cd packages/dashboard
npx shadcn@latest add <component-name>
```

## Testing

Vitest workspace config at root. Per-package `vitest.config.ts`.

- Test DB: in-memory SQLite via `createTestDb()` in `packages/db/src/test-utils.ts`
- 116 tests: db (64), pool-monitor (15), hedging-engine (37)

## Security

Vault file: `~/.trading-bot-cgr/vault.enc` (or `VAULT_PATH` env var)

- Encryption: AES-256-GCM
- KDF: scrypt (N=2^17, r=8, p=1, maxmem=256MB)
- Keys loaded into memory at startup via KeyManager, cleared on shutdown

## Current Status

- V1 complete + V2 features (R10 range trading, R11 per-pool costs, R12 Spanish UI)
- 116 tests passing, 0 typecheck errors
- Dashboard fully migrated to shadcn/ui with semantic tokens, all in Spanish
- Docker + CI/CD configured
- **E2E tested on HL testnet** (2026-03-10): full open→close hedge cycle verified
  - Hedge open: short 0.0097 ETH @ $2062.9 (IOC filled, 2.4s latency)
  - Hedge close: range return detected, position closed @ $2072.34, PnL: -$0.09
  - Stop-loss backup orders placed and cancelled correctly
  - syncPools live range updates working
- See [docs/TESTNET_GUIDE.md](docs/TESTNET_GUIDE.md) for step-by-step testing instructions
