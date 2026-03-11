# Análisis de Performance y Latencia — RangeGuard

Documento técnico exhaustivo sobre el rendimiento del bot, cuellos de botella identificados, modelos de optimización con costos, y recomendaciones para presupuestos futuros.

**Fecha**: Marzo 2026
**Versión del bot**: V2 (R10 range trading, R11 costos, R12 español)
**Dato real de referencia**: E2E testnet 10/03/2026 — hedge ejecutado en **2.4 segundos**

---

## Tabla de contenidos

1. [Cadena de latencia end-to-end](#1-cadena-de-latencia-end-to-end)
2. [Análisis por componente](#2-análisis-por-componente)
3. [Cuellos de botella identificados](#3-cuellos-de-botella-identificados)
4. [Modelos de optimización](#4-modelos-de-optimización)
5. [Base de datos y event loop](#5-base-de-datos-y-event-loop)
6. [Costos de cada nivel de optimización](#6-costos-de-cada-nivel-de-optimización)
7. [Comparativa de modelos](#7-comparativa-de-modelos)
8. [Impacto financiero de la latencia](#8-impacto-financiero-de-la-latencia)
9. [Mantenimiento por nivel](#9-mantenimiento-por-nivel)
10. [Recomendación final](#10-recomendación-final)
11. [Referencia técnica](#11-referencia-técnica)

---

## 1. Cadena de latencia end-to-end

Cuando el precio de un activo se mueve en la blockchain, el bot ejecuta esta cadena:

```
T=0ms     Swap ocurre en Uniswap V3 (on-chain)
   │
   ├─ VÍA WEBSOCKET ──────────────────────────────────────────┐
   │  T+10-100ms   Evento Swap llega via WS                   │
   │               (requiere RPC privado con WS)               │
   │                                                           │
   ├─ VÍA POLLING ─────────────────────────────────────────────┤
   │  T+0-5000ms   Bot lee slot0() en próximo poll             │
   │               (cada 5s, promedio 2.5s de delay)           │
   │                                                           │
   ▼                                                           │
T+Xms     RangeDetector.onPriceUpdate()                        │
   │      ├─ Observación 1 → count=1                           │
   │      ├─ Observación 2 → count=2                           │
   │      └─ Observación 3 → count=3 → TRANSICIÓN             │
   │                                                           │
   │      Debounce total:                                      │
   │        Con WS:  ~50-300ms (3 swaps rápidos)               │
   │        Con polling: ~10,000-15,000ms (3 polls × 5s)       │
   │                                                           │
   ▼                                                           │
T+Yms     eventBus.emit('range-exit')                          │
   │      └─ engine.onRangeExit() [ASYNC, bloquea event loop]  │
   │                                                           │
   ▼                                                           │
T+Y+5ms   Guards: DB reads (pool config, open hedges, wallet)  │
   │      └─ 3-4 queries SQLite síncronas (~5-15ms total)      │
   │                                                           │
   ▼                                                           │
T+Y+10ms  Force-close range trade (si hay una abierta)         │
   │      └─ 0ms si no hay / ~500-2000ms si hay                │
   │                                                           │
   ▼                                                           │
T+Y+15ms  HedgeCalculator.calculate() [~<1ms, en memoria]     │
   │                                                           │
   ▼                                                           │
T+Y+20ms  OrderExecutor.openHedge()                            │
   │      ├─ resolveAssetIndex() [~0ms cache / ~100ms 1ra vez] │
   │      ├─ updateLeverage() [~200-400ms con retry]           │
   │      └─ walletClient.order() IOC [~200-800ms con retry]   │
   │                                                           │
   ▼                                                           │
T+Y+600ms ★ HEDGE EJECUTADO — orden filled en Hyperliquid ★   │
   │                                                           │
   ▼                                                           │
T+Y+610ms tracker.recordOpen() [~5-10ms DB write]              │
   │      emit('hedge-opened') + alert webhook                 │
   │                                                           │
   ▼                                                           │
T+Y+620ms slManager.placeBackupSL() [~400-1500ms, paralelo]   │
   │      └─ No bloquea la ejecución del hedge                 │
   │                                                           │
   ▼                                                           │
T+Y+1500ms onRangeExit() handler retorna — event loop libre    │
```

### Timeline real por modo

| Modo | Detección | Debounce | Guards | Ejecución HL | **Total** |
|------|-----------|----------|--------|-------------|-----------|
| **Polling HTTP (actual)** | 0-5,000ms | 10,000-15,000ms | ~15ms | 500-2,000ms | **10.5-22s** |
| **WebSocket (RPC privado)** | 10-100ms | 50-300ms | ~15ms | 500-2,000ms | **0.6-2.4s** |
| **WS + optimizaciones Nivel 1** | 10-100ms | 30-200ms | ~5ms | 200-600ms | **0.25-0.9s** |
| **WS + Nivel 2 (paralelo)** | 10-100ms | 30-200ms | ~5ms | 100-400ms | **0.15-0.7s** |
| **WS + Nivel 3 (co-location)** | 5-50ms | 15-100ms | ~3ms | 50-200ms | **0.07-0.35s** |

---

## 2. Análisis por componente

### 2.1. Detección de precio (`packages/pool-monitor/src/pool-watcher.ts`)

| Método | Latencia | Costo | Confiabilidad |
|--------|----------|-------|---------------|
| **Polling HTTP** (default) | 0-5,000ms (promedio 2,500ms) | $0 (RPC público) | Alta (RPCs públicos rate-limited) |
| **WebSocket** (evento push) | 10-100ms | $49+/mes (RPC privado) | Media (WS se desconecta, fallback a polling) |

**Detalle técnico**:
- Polling: `client.readContract()` llama `slot0()` cada `POLLING_INTERVAL_MS` (default: 5,000ms)
- WebSocket: `watchContractEvent()` en eventos Swap del pool Uniswap V3
- Pools en la misma dirección de contrato comparten watcher (1 timer por pool address)
- Si WS falla, cae a polling automáticamente (sin intervención)

**Archivos**: `pool-watcher.ts:60-93` (WS), `pool-watcher.ts:114-118` (polling)

### 2.2. Range Detector (`packages/pool-monitor/src/range-detector.ts`)

State machine con debounce para evitar falsas rupturas:

```
in-range ──→ [3 observaciones out] ──→ out-of-range-below/above
    ▲                                          │
    └── [3 observaciones in] ◄─── [cooldown] ──┘
```

| Parámetro | Default | Configurable | Impacto en latencia |
|-----------|---------|-------------|---------------------|
| `DEBOUNCE_COUNT` | 3 | Sí (env var) | ×3 el intervalo de detección |
| `COOLDOWN_MINUTES` | 5 | Sí (env var) | Bloquea re-hedging post-cierre |

**Latencia del debounce**:
- Con polling (5s): 3 × 5s = **15s** (peor caso)
- Con WS: 3 × (tiempo entre swaps) = **50-300ms** en pools activos, **segundos** en pools con poco volumen

**Trade-off del debounce**:
- Menos debounce (2) = más rápido, pero más falsos positivos → más trades → más fees
- Más debounce (4+) = más lento, pero menos falsas alarmas → menos fees desperdiciados

### 2.3. Hyperliquid API (`packages/hedging-engine/src/hyperliquid-client.ts`)

La ejecución de un hedge requiere estas llamadas secuenciales a HL:

| Paso | API Call | Latencia típica | Con retry (max 2) |
|------|----------|----------------|-------------------|
| 1. Resolver asset index | `publicClient.meta()` | ~100ms (1ra vez), **0ms** (cacheado) | N/A |
| 2. Setear leverage | `walletClient.updateLeverage()` | 200-400ms | 500-5,500ms |
| 3. Colocar orden IOC | `walletClient.order()` | 200-800ms | 500-5,500ms |
| **Subtotal (1 wallet)** | | **400-1,200ms** | **1,000-11,000ms** |
| 4. SL backup (paralelo) | `walletClient.order()` trigger | 200-800ms | No bloquea hedge |

**Si hay profit wallet habilitada**: pasos 2+3 se repiten → **800-2,400ms** (secuencial).

**Retry logic** (`packages/common/src/utils/retry.ts`):
```
Intento 0: ejecutar
Intento 1: esperar 500ms × 2^0 + random(0-1000) = 500-1,500ms
Intento 2: esperar 500ms × 2^1 + random(0-1000) = 1,000-2,000ms
Max delay: 30,000ms
```

**Dato real testnet**: 2.4s latencia total (incluye leverage + order + network roundtrip)

### 2.4. Event Bus (`apps/bot/src/event-bus.ts`)

- Wrapper sobre Node.js `EventEmitter`
- Emisión **síncrona** (<1ms overhead)
- Handlers `async` se ejecutan **secuencialmente** (bloqueantes)
- **Mientras `onRangeExit()` ejecuta (2-5s), no se procesan otros eventos**

**Implicación**: Si WS dispara 10 eventos de precio por segundo durante un crash, los eventos se encolan y procesan después del hedge.

### 2.5. Base de datos (`packages/db/src/`)

**Configuración actual** (`connection.ts:18-21`):
```typescript
db.pragma('journal_mode = WAL');     // Lecturas concurrentes OK
db.pragma('busy_timeout = 5000');    // Espera hasta 5s si hay conflicto de escritura
db.pragma('foreign_keys = ON');      // Integridad referencial
```

**Operaciones en el hot path** (cada price update):

| Operación | Frecuencia | Latencia | Archivo |
|-----------|-----------|----------|---------|
| `poolsRepo.updateStatus()` | Cada price update (~5s) | 5-10ms | `main.ts:199-203` |
| `rangeDetector.onPriceUpdate()` | Cada price update | <1ms (memoria) | `main.ts:193` |
| `rangeTradingEngine.onPriceUpdate()` | Cada price update | <1ms (memoria) | `main.ts:196` |
| `pnlRepo.createPriceCache()` | 1/min (throttled) | 5-10ms | `main.ts:189` |
| Heartbeat | Cada 10s | ~1ms | `main.ts:432-438` |

**Operaciones en hedge open** (raro, 0.5-2/día):

| Operación | Latencia | Archivo |
|-----------|----------|---------|
| `poolsRepo.findById()` | <1ms (PK lookup) | `engine.ts:71` |
| `tracker.hasOpenHedge()` | <1ms (query con index) | `engine.ts:83` |
| `walletsRepo.findProfitWallet()` | 1-2ms (full scan, ~10 rows) | `engine.ts:112` |
| `tracker.recordOpen()` | 5-10ms (INSERT + SELECT) | `engine.ts:132-143` |

**Indexes existentes**:
```sql
idx_pool_configs_status          ON pool_configs(status)         ✅
idx_hedge_trades_pool            ON hedge_trades(pool_config_id) ✅
idx_hedge_trades_status          ON hedge_trades(status)         ✅
idx_hedge_trades_wallet          ON hedge_trades(wallet_id)      ✅
idx_price_cache_asset            ON price_cache(asset, recorded_at) ✅
idx_sl_orders_pool               ON stop_loss_orders(pool_config_id, status) ✅
idx_range_trades_pool            ON range_trades(pool_config_id) ✅
idx_range_trades_status          ON range_trades(status)         ✅
```

**Indexes faltantes** (bajo impacto, pero recomendados):
```sql
-- Usado en findOpenByPool() — hot path en cada hedge
CREATE INDEX idx_hedge_trades_pool_status ON hedge_trades(pool_config_id, status);

-- Usado en findProfitWallet() — cada hedge open
CREATE INDEX idx_wallets_type ON wallets(wallet_type);
```

---

## 3. Cuellos de botella identificados

Ordenados por impacto en latencia:

### 3.1. CRÍTICO — Latencia de Hyperliquid API (~60% del tiempo total)

**Problema**: Cada hedge requiere 2-3 llamadas secuenciales a la API de HL (leverage + order + opcionalmente profit wallet).

**Latencia**: 500-2,000ms por orden (testnet: 2.4s total con todo incluido).

**Causa raíz**: Network roundtrip + procesamiento del matching engine de HL.

**No controlable directamente** — es latencia de un servicio externo. Solo mitigable con:
- Co-location del servidor (reduce network latency ~50-70%)
- Pre-setear leverage en background (elimina 1 API call del hot path)
- Ejecutar wallets en paralelo (reduce latencia cuando hay profit wallet)

### 3.2. ALTO — Modo de detección: Polling vs WebSocket (~35% del tiempo total)

**Problema**: Sin WebSocket, el bot depende de polling cada 5s. El debounce de 3 observaciones multiplica este delay: 3 × 5s = 15s solo para confirmar una salida de rango.

**Causa raíz**: RPCs públicos gratuitos no soportan WebSocket.

**Solución**: RPC privado con WebSocket (Alchemy Growth $49/mes). Reduce detección de 15s → 300ms.

### 3.3. MEDIO — Event loop bloqueado durante hedge (~5% del tiempo total)

**Problema**: `onRangeExit()` es un handler async que se ejecuta en el event loop principal. Mientras el hedge se ejecuta (2-5s), no se procesan otros eventos de precio.

**Impacto práctico**: Bajo, porque las detecciones de rango son mutuamente excluyentes por pool. Solo afectaría si múltiples pools salen de rango simultáneamente.

**Solución**: Worker Threads o microservicios separados para ejecución de órdenes.

### 3.4. BAJO — DB writes síncronos en cada price update

**Problema**: `poolsRepo.updateStatus()` se ejecuta en cada price update (~cada 5s por pool). Es un write síncrono de better-sqlite3 que bloquea el event loop ~5-10ms.

**Impacto**: Con 10 pools = ~100ms de bloqueo cada 5s = 2% del event loop. Negligible para <50 pools.

**Solución**: Throttlear a 1/min o actualizar solo cuando el estado cambia.

### 3.5. BAJO — busy_timeout de 5s en SQLite

**Problema**: Si dos escrituras compiten (bot + dashboard), el segundo writer espera hasta 5s.

**Impacto**: Casi nulo en producción (dashboard es read-heavy, bot es single-writer).

**Solución**: Reducir a 1,000ms + agregar `synchronous = NORMAL`.

---

## 4. Modelos de optimización

### Nivel 0 — Estado actual (sin optimizar)

```
Configuración:
  - Polling HTTP con RPCs públicos gratuitos
  - Debounce: 3 observaciones × 5s = 15s
  - Leverage se setea en cada hedge
  - Asset index se resuelve en cada hedge (cacheado después de la 1ra vez)
  - Wallets ejecutan secuencialmente

Latencia end-to-end: 10-22 segundos
Costo de infraestructura: $5-10/mes (solo hosting)
```

### Nivel 1 — Quick Wins (sin cambiar arquitectura)

```
Optimizaciones:
  1. WebSocket via RPC privado (Alchemy Growth)
  2. Reducir debounce de 3 → 2
  3. Pre-cachear asset index al startup (meta() call una sola vez)
  4. Pre-setear leverage al registrar pool (no en hot path)
  5. Agregar indexes faltantes en SQLite
  6. Pragma synchronous = NORMAL
  7. Throttlear updateStatus() a 1/min

Cambios de código: ~80-120 líneas
Latencia end-to-end: 0.25-0.9 segundos
Costo de infraestructura: $54-70/mes (hosting + Alchemy)
```

**Detalle de cada optimización del Nivel 1**:

| # | Optimización | Líneas de código | Ahorro de latencia | Riesgo |
|---|---|---|---|---|
| 1 | WS via Alchemy Growth | 0 (config .env) | -12,500ms promedio | Ninguno |
| 2 | Debounce 3→2 | 1 línea (.env) | -33% del debounce | Más falsos positivos |
| 3 | Pre-cache asset index | ~15 líneas | -100ms en 1er hedge | Negligible |
| 4 | Pre-set leverage | ~30 líneas | -300ms por hedge | Leverage fijo entre hedges |
| 5 | Indexes SQL | ~5 líneas (migración) | -5ms en queries | Ninguno |
| 6 | Pragma NORMAL | 1 línea | -2ms por write | Mínimo riesgo WAL |
| 7 | Throttle updateStatus | ~10 líneas | -5ms por price update | Status menos fresh en dashboard |

### Nivel 2 — Arquitectura optimizada

```
Optimizaciones (sobre Nivel 1):
  8. Ejecutar protection + profit wallet en paralelo (Promise.all)
  9. Separar hedge execution a Worker Thread
  10. WebSocket de HL para account updates (reemplaza wallet polling)
  11. Reducir syncPools de 30s → 10s o usar push desde dashboard

Cambios de código: ~300-500 líneas + refactor de OrderExecutor
Latencia end-to-end: 0.15-0.7 segundos
Costo de infraestructura: $54-70/mes (mismo que Nivel 1)
Costo de desarrollo: 40-60 horas
```

### Nivel 3 — Ultra-baja latencia

```
Optimizaciones (sobre Nivel 2):
  12. Servidor co-locado (AWS us-east-1 o similar, cerca de HL)
  13. RPC premium (Alchemy Scale o nodo dedicado)
  14. Debounce adaptativo (1 si señal fuerte, 3 si débil)
  15. Pre-computar hedge params continuamente en memoria
  16. Connection pool persistente a HL API (keep-alive)
  17. Múltiples pools salen de rango → ejecución paralela por pool

Cambios de código: ~500-800 líneas + nueva infra
Latencia end-to-end: 0.07-0.35 segundos
Costo de infraestructura: $220-600/mes
Costo de desarrollo: 80-120 horas
```

---

## 5. Base de datos y event loop

### 5.1. Impacto de SQLite síncrono en el event loop

`better-sqlite3` ejecuta todas las queries de forma **síncrona** — bloquea el event loop de Node.js durante cada operación.

| Operación | Frecuencia | Bloqueo por op. | Bloqueo total/min |
|-----------|-----------|-----------------|-------------------|
| `updateStatus()` | 12/min (1 pool, polling 5s) | 5-10ms | 60-120ms |
| `createPriceCache()` | 1/min (throttled) | 5-10ms | 5-10ms |
| Heartbeat | 6/min (cada 10s) | ~1ms | ~6ms |
| `rangeDetector.onPriceUpdate()` | 12/min | <0.1ms | <1.2ms |
| **Total (1 pool)** | | | **~71-137ms/min** |
| **Total (10 pools)** | | | **~660-1,250ms/min** |
| **Total (50 pools)** | | | **~3,300-6,250ms/min** |

**Conclusión**: Con 10 pools, el event loop está bloqueado ~1.2s de cada 60s = **2% de utilización**. Aceptable. Con 50 pools, sube a ~10% — ahí sí conviene optimizar.

### 5.2. WAL mode y concurrencia

```
WAL Mode: ✅ Habilitado
  → Permite N lectores + 1 escritor simultáneos
  → Dashboard (Next.js) puede leer mientras el bot escribe
  → No hay deadlocks posibles (single-writer model)

busy_timeout: 5000ms ⚠️
  → Si el dashboard intenta escribir mientras el bot escribe, espera hasta 5s
  → En práctica: el dashboard es read-only excepto para pool config edits
  → Riesgo real: muy bajo
```

### 5.3. Crecimiento de la base de datos

| Tabla | Registros/día | Registros/año | Tamaño estimado |
|-------|--------------|--------------|-----------------|
| `pool_configs` | <1 | ~12-50 | <50 KB |
| `hedge_trades` | 0.5-2 | 200-700 | <500 KB |
| `range_trades` | 1-5 | 500-2,000 | <2 MB |
| `price_cache` | ~1,440 (1/min × 24h) | Rotado cada 7 días | <10 MB pico |
| `pnl_snapshots` | variable | Rotado cada 90 días | <50 MB pico |
| `trade_log` | 2-4 por trade | 1,000-3,000 | <3 MB |
| **Total estimado** | | | **<70 MB** |

Limpieza automática: `price_cache` >7 días y `pnl_snapshots` >90 días se purgan cada hora.

---

## 6. Costos de cada nivel de optimización

### 6.1. Nivel 0 — Estado actual

| Concepto | Costo mensual | Costo anual |
|----------|--------------|-------------|
| Hosting (Railway Hobby) | $5 | $60 |
| RPC (públicos gratuitos) | $0 | $0 |
| **Infraestructura total** | **$5** | **$60** |
| Mantenimiento dev (0 hrs/mes) | $0 | $0 |
| **Total operativo** | **$5/mes** | **$60/año** |

### 6.2. Nivel 1 — Quick Wins

| Concepto | Costo único | Costo mensual | Costo anual |
|----------|------------|--------------|-------------|
| **Desarrollo** (8-12 hrs × $50/hr) | **$400-600** | — | — |
| Hosting (Railway/VPS) | — | $5-20 | $60-240 |
| RPC privado (Alchemy Growth) | — | $49 | $588 |
| **Infraestructura total** | — | **$54-69** | **$648-828** |
| Mantenimiento dev (1 hr/mes) | — | $50 | $600 |
| **Total año 1** | **$400-600** | **$104-119/mes** | **$1,648-2,028** |
| **Total año 2+** | — | **$104-119/mes** | **$1,248-1,428** |

**Desglose del desarrollo Nivel 1**:

| Tarea | Horas | Detalle |
|-------|-------|---------|
| Configurar WS en .env + testing | 1-2 | Solo config, código ya soporta WS |
| Pre-cache asset index al startup | 2-3 | Llamar `meta()` una vez, popular cache |
| Pre-set leverage al registrar pool | 3-4 | Mover `updateLeverage()` fuera del hot path |
| Migración SQL (indexes) | 1 | 2 CREATE INDEX |
| Pragma + throttle updateStatus | 1-2 | ~15 líneas |
| Testing + QA | 1-2 | Verificar en testnet |
| **Total** | **8-12 hrs** | |

### 6.3. Nivel 2 — Arquitectura optimizada

| Concepto | Costo único | Costo mensual | Costo anual |
|----------|------------|--------------|-------------|
| **Desarrollo** (40-60 hrs × $50/hr) | **$2,000-3,000** | — | — |
| Hosting (VPS) | — | $10-20 | $120-240 |
| RPC privado (Alchemy Growth) | — | $49 | $588 |
| **Infraestructura total** | — | **$59-69** | **$708-828** |
| Mantenimiento dev (2 hrs/mes) | — | $100 | $1,200 |
| **Total año 1** | **$2,000-3,000** | **$159-169/mes** | **$3,908-5,028** |
| **Total año 2+** | — | **$159-169/mes** | **$1,908-2,028** |

**Desglose del desarrollo Nivel 2**:

| Tarea | Horas | Detalle |
|-------|-------|---------|
| Includes todo de Nivel 1 | 8-12 | — |
| Parallelizar profit + protection wallet | 6-8 | Refactor OrderExecutor con Promise.all |
| Worker Thread para hedge execution | 12-15 | Separar ejecución del event loop principal |
| HL WebSocket para account updates | 8-12 | Reemplazar wallet polling por suscripción WS |
| Push dashboard→bot (opcional) | 4-6 | WebSocket interno o file watcher |
| Testing + QA + refactor | 4-6 | Unit tests nuevos, E2E en testnet |
| **Total** | **40-60 hrs** | |

### 6.4. Nivel 3 — Ultra-baja latencia

| Concepto | Costo único | Costo mensual | Costo anual |
|----------|------------|--------------|-------------|
| **Desarrollo** (80-120 hrs × $60/hr) | **$4,800-7,200** | — | — |
| Hosting (VPS co-locado, US-East) | — | $20-50 | $240-600 |
| RPC premium (Alchemy Scale) | — | $199 | $2,388 |
| **Infraestructura total** | — | **$219-249** | **$2,628-2,988** |
| Mantenimiento dev (3-4 hrs/mes) | — | $180-240 | $2,160-2,880 |
| **Total año 1** | **$4,800-7,200** | **$399-489/mes** | **$9,588-13,068** |
| **Total año 2+** | — | **$399-489/mes** | **$4,788-5,868** |

**Desglose del desarrollo Nivel 3**:

| Tarea | Horas | Detalle |
|-------|-------|---------|
| Includes todo de Nivel 1 + 2 | 40-60 | — |
| Debounce adaptativo | 8-10 | Lógica de señal fuerte/débil por volatilidad |
| Pre-compute hedge params continuo | 6-8 | Calcular size/side en background cada price update |
| Connection pooling / keep-alive HL | 4-6 | HTTP keep-alive, reutilizar conexiones |
| Ejecución paralela multi-pool | 8-12 | Queue de hedge requests + pool de workers |
| Infra co-location setup | 4-6 | AWS/GCP config, benchmarking, CI/CD adaptado |
| Benchmark + profiling completo | 4-6 | Flame graphs, latency histograms, alertas |
| Testing + QA + stress testing | 6-8 | Load testing, fault injection |
| **Total** | **80-120 hrs** | |

---

## 7. Comparativa de modelos

### 7.1. Latencia vs costo

| Nivel | Latencia | Costo infra/mes | Desarrollo único | Mantenimiento/mes |
|-------|----------|-----------------|-----------------|-------------------|
| **0 — Actual** | 10-22s | $5 | $0 | $0 |
| **1 — Quick Wins** | 0.25-0.9s | $54-69 | $400-600 | $50 |
| **2 — Optimizado** | 0.15-0.7s | $59-69 | $2,000-3,000 | $100 |
| **3 — Ultra** | 0.07-0.35s | $219-249 | $4,800-7,200 | $180-240 |

### 7.2. Mejora relativa por nivel

| Transición | Mejora de latencia | Inversión adicional | ROI |
|------------|-------------------|--------------------|----|
| Nivel 0 → 1 | **~25x más rápido** | $400-600 + $54/mes | Excelente |
| Nivel 1 → 2 | ~1.5x más rápido | $2,000-3,000 + $50/mes | Bueno si hay profit wallet |
| Nivel 2 → 3 | ~2x más rápido | $4,800-7,200 + $180/mes | Solo para operaciones grandes |

### 7.3. Diagrama de decisión

```
¿Cuánto capital está en los pools?
│
├── < $50K total → NIVEL 0 o NIVEL 1
│   │
│   ├── Rangos amplios (±5-10%) → NIVEL 0 (polling suficiente)
│   └── Rangos estrechos (±1-3%) → NIVEL 1 (WS necesario)
│
├── $50K - $500K total → NIVEL 1 o NIVEL 2
│   │
│   ├── Sin profit wallet → NIVEL 1
│   └── Con profit wallet → NIVEL 2 (paralelización justificada)
│
└── > $500K total → NIVEL 2 o NIVEL 3
    │
    ├── Rangos medios → NIVEL 2
    └── Rangos estrechos + alta volatilidad → NIVEL 3
```

---

## 8. Impacto financiero de la latencia

### 8.1. Exposición sin cobertura

Mientras el bot detecta y ejecuta el hedge, el pool queda **sin protección**. El costo de esa ventana depende de la velocidad del movimiento de precio:

| Velocidad del movimiento | Con polling (15s) | Con WS Nivel 1 (0.5s) | Diferencia |
|--------------------------|-------------------|----------------------|-----------|
| Lento: ETH baja $1/s | $15 sin cubrir | $0.50 sin cubrir | **$14.50** |
| Medio: ETH baja $5/s | $75 sin cubrir | $2.50 sin cubrir | **$72.50** |
| Rápido: ETH baja $20/s | $300 sin cubrir | $10 sin cubrir | **$290** |
| Crash: ETH baja $100/s | $1,500 sin cubrir | $50 sin cubrir | **$1,450** |

> Los números anteriores son el movimiento de precio no cubierto. El IL real depende del tamaño del pool, el ancho del rango y la concentración de liquidez.

### 8.2. IL estimado por ventana de exposición

Para un pool de **$10,000** con rango **±3%** (concentración típica):

| Latencia total | Precio sin cubrir (ETH baja $5/s) | IL estimado | Fee del hedge |
|----------------|-----------------------------------|-------------|---------------|
| 15s (Nivel 0) | $75 | $15-40 | $7 |
| 0.5s (Nivel 1) | $2.50 | $0.50-1.50 | $7 |
| 0.15s (Nivel 2) | $0.75 | $0.15-0.40 | $7 |

**Conclusión**: La diferencia entre Nivel 0 y Nivel 1 para un pool de $10K es de **$14-39 por evento de hedge**. Con 8 hedges/mes, eso son **$112-312/mes** de IL evitado extra — más que el costo de Alchemy ($49/mes).

### 8.3. Breakeven por nivel de optimización

| Transición | Costo mensual extra | IL evitado extra (pool $10K) | Breakeven |
|------------|--------------------|-----------------------------|-----------|
| 0→1 | +$99/mes ($49 Alchemy + $50 mantenimiento) | $112-312/mes (8 hedges × $14-39) | **1 pool alcanza** |
| 1→2 | +$50/mes (mantenimiento) | $3-8/mes (marginal) | Necesita >10 pools o profit wallet |
| 2→3 | +$280/mes ($150 infra + $130 mant.) | $2-5/mes (marginal) | Necesita >$500K en pools |

---

## 9. Mantenimiento por nivel

### 9.1. Nivel 0 — Sin mantenimiento extra

| Tarea | Frecuencia | Horas/mes | Costo ($50/hr) |
|-------|-----------|-----------|-----------------|
| Monitoreo de alertas | Continuo | Incluido en operación | $0 |
| Actualización de dependencias | Trimestral | 0 (no aplica aún) | $0 |
| **Total** | | **0 hrs/mes** | **$0/mes** |

### 9.2. Nivel 1 — Mantenimiento mínimo

| Tarea | Frecuencia | Horas/mes | Costo ($50/hr) |
|-------|-----------|-----------|-----------------|
| Monitoreo de Alchemy dashboard (uso, rate limits) | Semanal | 0.25 | $12.50 |
| Verificar WS uptime y reconexiones | Semanal | 0.25 | $12.50 |
| Review de métricas de latencia (logs) | Mensual | 0.5 | $25 |
| **Total** | | **~1 hr/mes** | **~$50/mes** |

### 9.3. Nivel 2 — Mantenimiento moderado

| Tarea | Frecuencia | Horas/mes | Costo ($50/hr) |
|-------|-----------|-----------|-----------------|
| Todo de Nivel 1 | — | 1 | $50 |
| Monitoreo de Worker Threads (health, memory) | Semanal | 0.25 | $12.50 |
| Review de HL WS subscription (reconexiones) | Quincenal | 0.25 | $12.50 |
| Actualización de @nktkas/hyperliquid SDK | Cuando hay release | 0.5 | $25 |
| **Total** | | **~2 hrs/mes** | **~$100/mes** |

### 9.4. Nivel 3 — Mantenimiento avanzado

| Tarea | Frecuencia | Horas/mes | Costo ($60/hr) |
|-------|-----------|-----------|-----------------|
| Todo de Nivel 2 | — | 2 | $120 |
| Análisis de latency histograms | Quincenal | 0.5 | $30 |
| Tuning de debounce adaptativo | Mensual | 0.5 | $30 |
| Infra co-location (updates, security patches) | Mensual | 0.5 | $30 |
| Stress testing post-deploys | Cuando hay release | 0.5 | $30 |
| **Total** | | **~3-4 hrs/mes** | **~$180-240/mes** |

---

## 10. Recomendación final

### Para la mayoría de los casos: **Nivel 1**

**El Nivel 1 es el sweet spot** — con una inversión de $400-600 en desarrollo + $54/mes de infraestructura, se logra:

- **~25x mejora en latencia** (de 15s → 0.5s)
- **$112-312/mes de IL evitado** extra (se paga solo con 1 pool de $10K)
- **Sin cambios de arquitectura** — son config changes + <120 líneas de código
- **Bajo riesgo** — cambios pequeños, fáciles de revertir

### Para operaciones grandes (>$100K en pools): **Nivel 2**

Si el cliente tiene profit wallet activa y >10 pools, el Nivel 2 justifica el costo:

- La paralelización de wallets ahorra ~300ms por hedge (×2 wallets)
- El Worker Thread evita bloqueo del event loop con muchos pools
- El costo incremental es bajo ($2,000-3,000 una vez + $50/mes extra)

### Nivel 3 solo se justifica para:

- Operaciones institucionales (>$500K en pools)
- Rangos ultra-estrechos (±0.5-1%)
- Mercados con alta volatilidad donde cada 100ms cuenta
- Estrategias de range trading (R10) que operan dentro del rango con alta frecuencia

### Plan de implementación sugerido

```
Fase 1 (inmediato, sin desarrollo):
  ✅ Contratar Alchemy Growth ($49/mes)
  ✅ Configurar WS_ARBITRUM + RPC_ARBITRUM en .env
  ✅ Ajustar DEBOUNCE_COUNT=2 si el cliente acepta más sensibilidad
  → Impacto: latencia de 15s → ~1-2s

Fase 2 (1-2 semanas, 8-12 hrs de dev):
  □ Pre-cache de asset index al startup
  □ Pre-set leverage al registrar pool
  □ Migración SQL: indexes compuestos
  □ Pragma synchronous=NORMAL
  □ Throttle updateStatus()
  → Impacto: latencia de ~1-2s → ~0.3-0.9s

Fase 3 (solo si se justifica, 40-60 hrs):
  □ Paralelización de wallets (Promise.all)
  □ Worker Thread para hedge execution
  □ HL WebSocket para account updates
  → Impacto: latencia de ~0.5s → ~0.15-0.5s
```

---

## 11. Referencia técnica

### 11.1. Parámetros configurables que afectan latencia

| Parámetro | Env var | Default | Ubicación |
|-----------|---------|---------|-----------|
| Intervalo de polling | `POLLING_INTERVAL_MS` | 5,000ms | `apps/bot/src/config.ts:28` |
| Debounce (confirmaciones) | `DEBOUNCE_COUNT` | 3 | `apps/bot/src/config.ts:27` |
| Cooldown post-cierre | `COOLDOWN_MINUTES` | 5 min | `apps/bot/src/config.ts:30` |
| Chequeo de wallets | `WALLET_CHECK_INTERVAL_MS` | 30,000ms | `apps/bot/src/config.ts:29` |
| Slippage IOC | `HL_SLIPPAGE_BPS` | 100 (1%) | constante en `common/` |
| WebSocket Arbitrum | `WS_ARBITRUM` | — (sin WS) | `apps/bot/src/config.ts:46` |
| WebSocket Ethereum | `WS_ETHEREUM` | — | `apps/bot/src/config.ts:45` |
| URL API Hyperliquid | `HL_API_URL` | testnet | `apps/bot/src/config.ts:23` |
| Sync de pools | — (hardcodeado) | 30,000ms | `apps/bot/src/main.ts:426` |
| Heartbeat | — (hardcodeado) | 10,000ms | `apps/bot/src/main.ts:432` |
| DB cleanup | — (hardcodeado) | 3,600,000ms (1h) | `apps/bot/src/main.ts:442` |

### 11.2. Retry logic (todas las llamadas HL)

```
maxRetries: 2 (3 intentos totales)
baseDelayMs: 500ms
maxDelayMs: 30,000ms
Backoff: exponencial con jitter
  Intento 1: 500ms + random(0-1000)
  Intento 2: 1,000ms + random(0-1000)
```

### 11.3. Archivos clave para performance

| Archivo | Relevancia |
|---------|-----------|
| `apps/bot/src/main.ts` | Event loop principal, wiring de componentes |
| `apps/bot/src/config.ts` | Todos los parámetros de latencia |
| `packages/pool-monitor/src/pool-watcher.ts` | Detección de precios (WS vs polling) |
| `packages/pool-monitor/src/range-detector.ts` | Debounce + cooldown |
| `packages/hedging-engine/src/hyperliquid-client.ts` | API calls a HL (leverage, orders) |
| `packages/hedging-engine/src/order-executor.ts` | Orquestación de órdenes |
| `packages/hedging-engine/src/engine.ts` | Handler de range-exit/return |
| `packages/common/src/utils/retry.ts` | Lógica de retry con backoff |
| `packages/db/src/connection.ts` | Pragmas de SQLite |

### 11.4. Métricas observadas en testnet (10/03/2026)

| Métrica | Valor |
|---------|-------|
| Latencia total hedge open | 2.4 segundos |
| Tamaño de la orden | 0.0097 ETH |
| Precio de entrada | $2,062.90 |
| Precio de cierre | $2,072.34 |
| PnL del ciclo | -$0.09 |
| SL backup colocado | Sí (correctamente) |
| SL backup cancelado | Sí (en range return) |

---

## Documentos relacionados

| Documento | Contenido |
|-----------|-----------|
| `docs/COSTOS_OPERATIVOS.md` | Costos de hosting, RPC, fees HL, funding, colateral |
| `docs/PRICING_DESARROLLO.md` | Cómo calcular precio del desarrollo (horas, rates) |
| `docs/BUDGET.md` | Presupuesto V2 (R10, R11, R12) |
| `docs/PRODUCTION_READINESS.md` | Checklist de producción (8 pasos) |
| `docs/TESTNET_GUIDE.md` | Guía E2E de testing en testnet HL |
| `CLAUDE.md` | Referencia técnica del proyecto |
