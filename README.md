# Trading Bot CGR

Bot de cobertura automatizada contra **Impermanent Loss** en pools de liquidez concentrada (Uniswap V3). Cuando el precio sale del rango configurado, el bot abre posiciones de hedge en **Hyperliquid DEX** (perpetuos) para compensar la perdida. Cuando vuelve al rango, cierra las posiciones automaticamente.

---

## Indice

- [Arquitectura](#arquitectura)
- [Flujo de datos](#flujo-de-datos)
- [Estructura del monorepo](#estructura-del-monorepo)
- [Base de datos](#base-de-datos)
- [Dashboard](#dashboard)
- [Logica de hedging](#logica-de-hedging)
- [Setup](#setup)
- [Configuracion](#configuracion)
- [Decisiones tecnicas](#decisiones-tecnicas)

---

## Arquitectura

```
                        Uniswap V3 Pools
                     (Arbitrum, Base, etc.)
                              |
                   WebSocket events / slot0 polling
                              |
                              v
┌─────────────────────────────────────────────────────────────┐
│                        apps/bot                             │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  Config   │    │  Event Bus   │    │ Graceful Shutdown│   │
│  │  Loader   │    │  (typed)     │    │ SIGINT/SIGTERM   │   │
│  └──────────┘    └──────┬───────┘    └──────────────────┘   │
│                         │                                   │
│         ┌───────────────┼───────────────┐                   │
│         v               v               v                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐       │
│  │pool-monitor │ │hedging-     │ │  wallet-monitor  │       │
│  │             │ │engine       │ │  (balance check) │       │
│  │PoolWatcher  │ │             │ └─────────────────┘       │
│  │RangeDetector│ │HedgeCalc    │                            │
│  │PriceFeed    │ │OrderExecutor│                            │
│  └──────┬──────┘ │PositionTrack│                            │
│         │        └──────┬──────┘                            │
│         │               │                                   │
│         │               v                                   │
│         │        Hyperliquid DEX                            │
│         │        (testnet/mainnet)                           │
│         v                                                   │
│  ┌─────────────┐                                            │
│  │  SQLite DB  │◄──── packages/db (repositories)            │
│  │  (WAL mode) │                                            │
│  └──────┬──────┘                                            │
│         │                                                   │
└─────────┼───────────────────────────────────────────────────┘
          │
          │  Shared DB file
          │
┌─────────┼───────────────────────────────────────────────────┐
│         v              packages/dashboard                   │
│  ┌─────────────┐                                            │
│  │ Next.js API │  GET/POST /api/pools, /api/wallets, etc.   │
│  │  Routes     │                                            │
│  └──────┬──────┘                                            │
│         │                                                   │
│         v                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              React Dashboard (SPA)                  │    │
│  │  Overview | Pools | Wallets | Hedges | History      │    │
│  │  TanStack Query (auto-refresh 5s) + Recharts       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

El bot y el dashboard son **dos procesos separados** que comparten la misma base de datos SQLite. El bot escribe (precios, hedges, trades) y el dashboard lee y muestra.

---

## Flujo de datos

### 1. Monitoreo de precio

```
Pool Uniswap V3
    │
    ├─ WebSocket: Swap events en tiempo real (preferido)
    │  └─ Si WS falla → fallback a polling slot0 cada 5s
    │
    v
PoolWatcher
    │  Extrae sqrtPriceX96 + tick → calcula currentPrice
    │
    v
PriceFeed (cache en memoria) + DB (price_cache)
    │
    v
RangeDetector (maquina de estados)
    │  Compara currentPrice vs [rangeLower, rangeUpper]
    │  Requiere 3 updates consecutivos para confirmar transicion
    │  Cooldown post-retorno para evitar whipsaw
    │
    ├─ RANGE EXIT  ──→ HedgingEngine.onRangeExit()
    └─ RANGE RETURN ──→ HedgingEngine.onRangeReturn()
```

### 2. Apertura de hedge (range exit)

```
RangeDetector confirma salida
    │
    v
HedgingEngine.onRangeExit()
    │
    ├─ 1. Verificar pool activo + sin hedge abierto
    ├─ 2. HedgeCalculator: size = poolAmount / currentPrice
    │     Exit below → SHORT | Exit above → LONG
    ├─ 3. OrderExecutor.openHedge()
    │     ├─ Protection wallet: market order (IOC limit + 1% slippage)
    │     └─ Profit wallet (opcional): mirror trade
    ├─ 4. PositionTracker.recordOpen() → DB hedge_trades
    └─ 5. Actualizar pool status → out-of-range-below/above
```

### 3. Cierre de hedge (range return)

```
RangeDetector confirma retorno
    │
    v
HedgingEngine.onRangeReturn()
    │
    ├─ 1. Buscar hedges abiertos del pool
    ├─ 2. Calcular PnL:
    │     Short: (entryPrice - exitPrice) * size
    │     Long:  (exitPrice - entryPrice) * size
    ├─ 3. Marcar false breakout si PnL < 0
    ├─ 4. OrderExecutor.closeHedge() → reduceOnly orders
    ├─ 5. PositionTracker.recordClose() → DB
    └─ 6. Pool status → in-range + activar cooldown
```

---

## Estructura del monorepo

```
trading-bot-cgr/
├── apps/
│   └── bot/                          # Proceso principal del bot
│       └── src/
│           ├── main.ts               # Bootstrap: init todo, registrar pools, arrancar
│           ├── config.ts             # Carga .env + defaults
│           └── event-bus.ts          # EventEmitter tipado (price-update, range-exit, etc.)
│
├── packages/
│   ├── common/                       # Tipos, constantes y utilidades compartidas
│   │   └── src/
│   │       ├── types/
│   │       │   ├── config.ts         # AppConfig
│   │       │   ├── pool-config.ts    # PoolConfig, ProtectionDirection, PoolStatus
│   │       │   ├── wallets.ts        # Wallet, WalletBalance
│   │       │   ├── hedges.ts         # HedgeTrade, TradeLogEntry
│   │       │   └── events.ts        # PriceUpdate, RangeExitEvent, etc.
│   │       ├── constants/
│   │       │   ├── chains.ts         # Ethereum, Arbitrum, Base, Polygon
│   │       │   ├── pairs.ts          # ETH/USDC, BTC/USDC, fee tiers, leverage
│   │       │   ├── abis.ts           # Uniswap V3 Pool ABI (slot0, Swap)
│   │       │   └── hyperliquid.ts    # URLs, asset indices, slippage (1%)
│   │       └── utils/
│   │           ├── logger.ts         # pino + pino-pretty en dev
│   │           ├── tick-math.ts      # sqrtPriceX96 → precio human-readable
│   │           └── retry.ts          # Exponential backoff con jitter
│   │
│   ├── db/                           # Persistencia SQLite
│   │   └── src/
│   │       ├── connection.ts         # Singleton, WAL mode, busy_timeout 5s
│   │       ├── migrations/
│   │       │   ├── 001_initial.ts    # Schema: 6 tablas + indices
│   │       │   └── run.ts           # Migration runner
│   │       └── repositories/
│   │           ├── pools.repo.ts     # CRUD + findActive, updateStatus, toggleProtection
│   │           ├── wallets.repo.ts   # CRUD + findByType, findProfitWallet, updateBalance
│   │           ├── hedges.repo.ts    # create, findOpen, close, findHistory, countFalseBreakouts
│   │           ├── trade-log.repo.ts # Audit log de cada request/response a HL
│   │           └── pnl.repo.ts       # Snapshots de PnL + price cache
│   │
│   ├── security/                     # Gestion de private keys
│   │   └── src/
│   │       ├── vault.ts              # AES-256-GCM + scrypt KDF, archivo encriptado
│   │       ├── key-manager.ts        # Carga keys en memoria desde vault
│   │       └── setup-cli.ts          # CLI interactivo (listar, agregar, borrar keys)
│   │
│   ├── pool-monitor/                 # Lectura on-chain
│   │   └── src/
│   │       ├── chain-client.ts       # viem PublicClient multi-chain (HTTP + WS)
│   │       ├── pool-watcher.ts       # Swap events via WS, fallback a slot0 polling
│   │       ├── range-detector.ts     # Maquina de estados: in-range / out-of-range
│   │       └── price-feed.ts         # Cache de precios en memoria
│   │
│   ├── hedging-engine/               # Ejecucion de trades en Hyperliquid
│   │   └── src/
│   │       ├── engine.ts             # Orquestador: onRangeExit / onRangeReturn
│   │       ├── hedge-calculator.ts   # poolAmount / price = size, direction → side
│   │       ├── hyperliquid-client.ts # Wrapper de @nktkas/hyperliquid SDK
│   │       ├── order-executor.ts     # Abre/cierra en protection + profit wallets
│   │       ├── position-tracker.ts   # CRUD de hedge_trades en DB
│   │       ├── stop-loss-manager.ts  # Backup SL (placeholder)
│   │       └── wallet-monitor.ts     # Chequeo periodico de balances
│   │
│   └── dashboard/                    # UI web
│       └── src/
│           ├── app/
│           │   ├── layout.tsx        # Root layout, sidebar, dark theme
│           │   ├── page.tsx          # Overview: stats, alertas
│           │   ├── providers.tsx     # TanStack Query (refetch 5s)
│           │   ├── pools/            # Lista de pools + formulario de creacion
│           │   ├── wallets/          # Gestion de wallets
│           │   ├── hedges/           # Hedges abiertos
│           │   ├── history/          # Historial de trades cerrados
│           │   ├── settings/         # Configuracion
│           │   └── api/              # API routes (Next.js Route Handlers)
│           │       ├── db.ts         # Singleton de repositorios
│           │       ├── pools/        # GET/POST/PUT/DELETE + toggle protection
│           │       ├── wallets/      # GET/POST
│           │       ├── hedges/       # GET (filtra por status)
│           │       ├── trades/       # GET paginado + false breakout count
│           │       └── stats/        # GET overview stats
│           └── components/
│               ├── charts/           # PnLChart, PriceChart (Recharts)
│               ├── common/           # Sidebar, AlertBanner, NetworkBadge, StatusBadge
│               ├── pools/            # PoolCard, PoolForm, ProtectionToggle, RangeIndicator
│               ├── hedges/           # HedgeCard, PnLDisplay
│               └── wallets/          # WalletCard, WalletList
│
├── scripts/
│   ├── setup-keys.ts                 # CLI para agregar/listar/borrar private keys
│   └── testnet-seed.ts               # Seed de datos de prueba (idempotente)
│
├── .env.example                      # Template de variables de entorno
├── pnpm-workspace.yaml               # packages/* + apps/*
└── package.json                      # Scripts del monorepo
```

### Dependencias entre packages

```
common ◄─── db ◄─── security
  ▲          ▲         ▲
  │          │         │
  ├── pool-monitor     │
  │          │         │
  └── hedging-engine ──┘
              ▲
              │
           apps/bot ──→ todos los packages
           dashboard ──→ db, common
```

---

## Base de datos

SQLite con WAL mode. 6 tablas:

### `wallets`

| Columna               | Tipo        | Descripcion                                      |
| --------------------- | ----------- | ------------------------------------------------ |
| id                    | TEXT PK     | UUID                                             |
| alias                 | TEXT UNIQUE | Nombre legible (`pool-eth-arb`, `profit-global`) |
| address               | TEXT        | Direccion de la wallet en Hyperliquid            |
| wallet_type           | TEXT        | `protection` o `profit`                          |
| available_balance     | TEXT        | Balance disponible en USD                        |
| margin_used           | TEXT        | Margen en uso                                    |
| total_balance         | TEXT        | Balance total                                    |
| low_balance_threshold | TEXT        | Umbral de alerta                                 |
| is_low_balance        | INTEGER     | Flag 0/1                                         |
| balance_updated_at    | TEXT        | Ultimo chequeo                                   |
| created_at            | TEXT        | Timestamp de creacion                            |

### `pool_configs`

| Columna                      | Tipo    | Descripcion                                                                   |
| ---------------------------- | ------- | ----------------------------------------------------------------------------- |
| id                           | TEXT PK | UUID                                                                          |
| name                         | TEXT    | Nombre descriptivo                                                            |
| chain_id                     | INTEGER | 1, 42161, 8453, 137                                                           |
| chain_name                   | TEXT    | Ethereum, Arbitrum, Base, Polygon                                             |
| pool_address                 | TEXT    | Address del pool Uniswap V3                                                   |
| token0_symbol, token1_symbol | TEXT    | Par (WETH/USDC)                                                               |
| fee_tier                     | INTEGER | 100, 500, 3000, 10000 bps                                                     |
| range_lower, range_upper     | REAL    | Rango de precio configurado                                                   |
| pool_amount                  | TEXT    | Monto en USD a cubrir                                                         |
| hedge_asset                  | TEXT    | Asset a hedgear en HL (ETH, BTC)                                              |
| leverage                     | INTEGER | Multiplicador (10x, 20x)                                                      |
| protection_direction         | TEXT    | `both`, `below`, `above`                                                      |
| protection_wallet_id         | TEXT FK | Wallet asignada                                                               |
| profit_wallet_enabled        | INTEGER | 0/1                                                                           |
| protection_active            | INTEGER | 0/1 (toggle)                                                                  |
| status                       | TEXT    | `in-range`, `out-of-range-below`, `out-of-range-above`, `monitoring`, `error` |
| current_price                | TEXT    | Ultimo precio leido                                                           |
| created_at, updated_at       | TEXT    | Timestamps                                                                    |

### `hedge_trades`

| Columna              | Tipo    | Descripcion                           |
| -------------------- | ------- | ------------------------------------- |
| id                   | TEXT PK | UUID                                  |
| pool_config_id       | TEXT FK | Pool asociado                         |
| wallet_id            | TEXT FK | Wallet que ejecuto                    |
| asset                | TEXT    | ETH, BTC, etc.                        |
| side                 | TEXT    | `short` o `long`                      |
| size                 | TEXT    | Cantidad de asset                     |
| entry_price          | TEXT    | Precio de entrada                     |
| exit_price           | TEXT    | Precio de salida (null si abierto)    |
| leverage             | INTEGER | Leverage usado                        |
| status               | TEXT    | `open`, `closed`, `liquidated`        |
| realized_pnl         | TEXT    | PnL realizado al cerrar               |
| fees                 | TEXT    | Fees pagados                          |
| hl_order_id          | TEXT    | Order ID de Hyperliquid               |
| close_reason         | TEXT    | `range-return`, `stop-loss`, `manual` |
| is_false_breakout    | INTEGER | 1 si PnL < 0 al cerrar                |
| opened_at, closed_at | TEXT    | Timestamps                            |

### `trade_log`

Audit log de cada request/response al API de Hyperliquid.

### `pnl_snapshots`

Snapshots periodicos de PnL por pool para graficos historicos.

### `price_cache`

Cache de precios por asset y chain para el dashboard.

---

## Dashboard

Next.js 15 + React 19 + TailwindCSS 4. Dark theme. Auto-refresh cada 5s via TanStack Query.

| Pagina   | Ruta         | Que muestra                                                                                          |
| -------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| Overview | `/`          | Cards: pools activos, in-range, hedges abiertos, PnL total, false breakouts. Alertas de low balance. |
| Pools    | `/pools`     | Lista de pools con status, precio actual, rango. Toggle de proteccion.                               |
| New Pool | `/pools/new` | Formulario: chain, pool address, tokens, fee tier, rango, monto, leverage, direccion.                |
| Wallets  | `/wallets`   | Lista de wallets con balances, tipo, alertas.                                                        |
| Hedges   | `/hedges`    | Posiciones abiertas con PnL no realizado.                                                            |
| History  | `/history`   | Trades cerrados paginados, PnL realizado, false breakouts.                                           |
| Settings | `/settings`  | Configuracion del bot.                                                                               |

### API Routes

```
GET    /api/stats              # Overview stats
GET    /api/pools              # Listar pools
POST   /api/pools              # Crear pool
GET    /api/pools/:id          # Pool individual
PUT    /api/pools/:id          # Actualizar pool
DELETE /api/pools/:id          # Eliminar pool
POST   /api/pools/:id/toggle   # Toggle proteccion activa
GET    /api/wallets            # Listar wallets
POST   /api/wallets            # Crear wallet
GET    /api/hedges             # Hedges abiertos (filtro por status)
GET    /api/trades             # Historial paginado (limit, offset)
```

---

## Logica de hedging

### Calculo de size

```
hedgeSize = poolAmount (USD) / currentPrice

Ejemplo:
  poolAmount = $10,000
  currentPrice = $2,500 (ETH)
  hedgeSize = 4.0000 ETH
```

### Direccion del hedge

| Evento                             | Significado para LP                                     | Hedge           |
| ---------------------------------- | ------------------------------------------------------- | --------------- |
| Precio baja del rango (exit below) | LP acumula mas del token volatil (ETH) → pierde valor   | **SHORT** en HL |
| Precio sube del rango (exit above) | LP acumula mas del token estable (USDC) → pierde upside | **LONG** en HL  |

### Ordenes en Hyperliquid

- **Tipo**: IOC limit order (Immediate-Or-Cancel) con 1% de slippage sobre el precio actual
- **Leverage**: Configurable por pool (10x, 20x)
- **Cierre**: `reduceOnly` order cuando el precio vuelve al rango
- **SDK**: `@nktkas/hyperliquid` con field names cortos (`a`, `b`, `p`, `s`, `t`, `r`)

### Range Detector (maquina de estados)

```
                    ┌──────────────┐
     ┌──────────────│   IN RANGE   │◄─────────────────┐
     │              └──────┬───────┘                   │
     │                     │                           │
     │         Precio sale del rango                   │
     │         (3 updates consecutivos)     Precio vuelve al rango
     │                     │                (3 updates consecutivos)
     │                     v                           │
     │  ┌──────────────────────────────────┐           │
     │  │  OUT OF RANGE (below o above)    │───────────┘
     │  │  → dispara hedge                 │
     │  └──────────────────────────────────┘
     │
     │  Cooldown de N minutos post-retorno
     │  para evitar whipsaw
     └─────────────────────────────────────
```

### Wallets

- **Protection wallet**: Una por pool. Ejecuta el hedge principal.
- **Profit wallet** (opcional): Una global compartida. Mirror trade para separar ganancias.

Las private keys se guardan en un vault encriptado con AES-256-GCM + scrypt KDF. El archivo vault se guarda fuera del repo (`~/.trading-bot-cgr/vault.enc` por default).

---

## Setup

### Prerequisitos

- Node.js >= 20
- pnpm >= 9

```bash
pnpm install
```

### Nivel 1 — Solo Dashboard (sin dependencias externas)

Ver la UI, crear pools manualmente, sin datos en vivo.

```bash
pnpm testnet-seed      # Crea DB con datos de prueba
pnpm dev:dashboard     # http://localhost:3000
```

Que ves: pools listados, wallets con addresses de prueba, formulario de creacion, todo sin precios reales.

### Nivel 2 — Dashboard + Bot con precios reales

Necesitas: una API key de [Alchemy](https://www.alchemy.com) (gratis).

1. Crear cuenta en Alchemy
2. Crear app para **Arbitrum Mainnet**
3. Copiar las URLs HTTP y WebSocket

```bash
# Crear .env en la raiz del proyecto (copiar de .env.example)
cp .env.example .env
```

Editar `.env`:

```env
RPC_ARBITRUM=https://arb-mainnet.g.alchemy.com/v2/TU_KEY
WS_ARBITRUM=wss://arb-mainnet.g.alchemy.com/v2/TU_KEY
LOG_LEVEL=info
```

Correr en dos terminales:

```bash
pnpm dev:dashboard     # Terminal 1 → http://localhost:3000
pnpm dev:bot           # Terminal 2 → logs de precio cada 5s
```

Que ves: el bot lee el precio real de ETH/USDC del pool en Arbitrum. El dashboard muestra el precio actual y si esta in-range o out-of-range. El bot detecta range exits pero no puede hedgear (no hay wallets con keys reales).

### Nivel 3 — E2E con Hyperliquid testnet

Necesitas: wallets con fondos en HL testnet.

1. Ir a https://app.hyperliquid-testnet.xyz
2. Conectar wallet o crear una nueva
3. Pedir USDC del faucet testnet
4. Necesitas al menos 2 wallets: una de proteccion y una de profit
5. Anotar las private keys

```bash
# Agregar a .env
VAULT_PASSWORD=una-contraseña-segura

# Correr el CLI interactivo para guardar las keys
pnpm setup-keys
```

En el CLI:

- Agregar wallet con alias `pool-eth-arb` (private key de wallet 1)
- Agregar wallet con alias `profit-global` (private key de wallet 2)

Luego actualizar las direcciones de las wallets en el dashboard (las del seed son `0x000...001`, hay que poner las reales).

Que ves: el bot abre shorts/longs reales en HL testnet cuando el precio sale del rango. Cuando vuelve, los cierra automaticamente. El dashboard muestra hedges activos, PnL, saldos.

---

## Configuracion

### Variables de entorno (.env)

| Variable                   | Default                                | Descripcion                                                   |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| `VAULT_PASSWORD`           | -                                      | Password para encriptar/desencriptar el vault de private keys |
| `VAULT_PATH`               | `~/.trading-bot-cgr/vault.enc`         | Ruta al archivo vault                                         |
| `DB_PATH`                  | `./data/bot.db`                        | Ruta a la base de datos SQLite                                |
| `RPC_ARBITRUM`             | -                                      | URL HTTP del nodo RPC de Arbitrum                             |
| `WS_ARBITRUM`              | -                                      | URL WebSocket del nodo RPC de Arbitrum                        |
| `RPC_ETHEREUM`             | -                                      | URL HTTP del nodo RPC de Ethereum                             |
| `WS_ETHEREUM`              | -                                      | URL WebSocket del nodo RPC de Ethereum                        |
| `RPC_BASE`                 | -                                      | URL HTTP del nodo RPC de Base                                 |
| `WS_BASE`                  | -                                      | URL WebSocket del nodo RPC de Base                            |
| `RPC_POLYGON`              | -                                      | URL HTTP del nodo RPC de Polygon                              |
| `WS_POLYGON`               | -                                      | URL WebSocket del nodo RPC de Polygon                         |
| `HL_API_URL`               | `https://api.hyperliquid-testnet.xyz`  | API endpoint de Hyperliquid                                   |
| `HL_WS_URL`                | `wss://api.hyperliquid-testnet.xyz/ws` | WebSocket de Hyperliquid                                      |
| `DEBOUNCE_COUNT`           | `3`                                    | Updates consecutivos para confirmar transicion de rango       |
| `POLLING_INTERVAL_MS`      | `5000`                                 | Intervalo de polling de precio (ms)                           |
| `WALLET_CHECK_INTERVAL_MS` | `30000`                                | Intervalo de chequeo de balances (ms)                         |
| `COOLDOWN_MINUTES`         | `5`                                    | Cooldown post range-return (minutos)                          |
| `DASHBOARD_PORT`           | `3000`                                 | Puerto del dashboard                                          |
| `LOG_LEVEL`                | `info`                                 | Nivel de log: `debug`, `info`, `warn`, `error`                |

### Nota sobre OneDrive

SQLite con WAL mode puede tener problemas de file locking si OneDrive sincroniza los archivos `.db`, `.db-wal`, `.db-shm` mientras el bot escribe. Si ves errores `SQLITE_BUSY`, setear `DB_PATH` a una ruta fuera de OneDrive:

```env
DB_PATH=C:/temp/trading-bot/bot.db
```

### Scripts disponibles

| Script               | Descripcion                                   |
| -------------------- | --------------------------------------------- |
| `pnpm dev:bot`       | Arranca el bot en modo desarrollo (tsx watch) |
| `pnpm dev:dashboard` | Arranca el dashboard en http://localhost:3000 |
| `pnpm build`         | Build de produccion de todos los packages     |
| `pnpm typecheck`     | Typecheck de todos los packages               |
| `pnpm test`          | Correr tests de todos los packages            |
| `pnpm testnet-seed`  | Crear DB con datos de prueba (idempotente)    |
| `pnpm setup-keys`    | CLI interactivo para gestionar private keys   |
| `pnpm db:migrate`    | Correr migraciones de la DB                   |

---

## Decisiones tecnicas

| Decision                         | Razon                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Una wallet HL por pool**       | Perpetuos cancelan posiciones opuestas en la misma wallet. Wallets separadas permiten hedges independientes.          |
| **Una wallet de profit global**  | Simplifica la gestion. Las ganancias se consolidan en un solo lugar.                                                  |
| **Config manual de pools**       | No leemos posiciones LP on-chain. El usuario define rangos y montos manualmente via dashboard. Mas simple y flexible. |
| **Market orders = IOC limit**    | HL no tiene market orders nativos. IOC limit con 1% slippage es equivalente.                                          |
| **Debounce de 3 updates**        | Evita abrir/cerrar hedges por spikes momentaneos de precio.                                                           |
| **Cooldown post-retorno**        | Evita whipsaw: si el precio oscila en el borde del rango, no abre/cierra repetidamente.                               |
| **SQLite WAL**                   | Permite lecturas concurrentes (dashboard) mientras el bot escribe. Simple, sin servidor externo.                      |
| **Monorepo con pnpm workspaces** | Packages con responsabilidades claras. Tipos compartidos. Build independiente.                                        |
| **@nktkas/hyperliquid SDK**      | SDK liviano para HL con soporte de signing. Field names cortos: `a` (asset), `b` (isBuy), `p` (price), `s` (size).    |
| **viem para on-chain**           | Type-safe, tree-shakeable, soporte multi-chain con PublicClient.                                                      |

---

## Stack

| Capa            | Tecnologia                           |
| --------------- | ------------------------------------ |
| Runtime         | Node.js 20+                          |
| Lenguaje        | TypeScript 5.7+                      |
| Package manager | pnpm 9+ (workspaces)                 |
| On-chain        | viem (Uniswap V3 pools)              |
| DEX             | @nktkas/hyperliquid (perpetuos)      |
| Base de datos   | SQLite via better-sqlite3 (WAL mode) |
| Dashboard       | Next.js 15, React 19, TailwindCSS 4  |
| Estado client   | TanStack Query (auto-refetch 5s)     |
| Graficos        | Recharts                             |
| Logging         | pino + pino-pretty                   |
| Seguridad       | AES-256-GCM + scrypt KDF             |
| CLI             | @inquirer/prompts                    |
