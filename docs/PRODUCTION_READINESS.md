# Production Readiness — Requerimientos y Estado

## Contexto

El bot estaba funcional y testeado en testnet, pero le faltaban capas de robustez para producción: el dashboard no tenía auth, el bot no se recuperaba de crashes, las SL orders se perdían en memoria si el proceso moría, no había alertas externas, y la DB crecía sin límite.

Scope: 8 pasos ordenados por prioridad. Cada paso es independiente y testeable.

---

## Paso 1: Dashboard Auth — API Key middleware

**Problema**: Todas las rutas `/api/*` estaban abiertas. Cualquiera en la red podía crear pools, cerrar hedges, ver wallets.

**Solución**: Next.js middleware con API_KEY simple.

**Implementación**:
- [x] `packages/dashboard/src/middleware.ts` — intercepta rutas `/api/*` (excepto `/api/bot-status`)
- [x] Compara header `x-api-key` o cookie `auth-token` contra `DASHBOARD_API_KEY` env var
- [x] Si no hay `DASHBOARD_API_KEY` configurada → permitir todo (dev mode)
- [x] Si hay key pero no coincide → 401 JSON response
- [x] Página de login: `/login` con input de API key que setea cookie
- [x] API auth route: `POST /api/auth` (setea cookie httpOnly), `DELETE /api/auth` (logout)
- [x] Botón Logout en sidebar

---

## Paso 2: Bot crash handlers

**Problema**: Si había uncaughtException o unhandledRejection, el proceso moría sin logging. Los event handlers no tenían try-catch.

**Implementación**:
- [x] `process.on('uncaughtException', ...)` y `process.on('unhandledRejection', ...)` al inicio de main()
- [x] Envolver hedge-opened y hedge-closed handlers en try-catch
- [x] Timeout al shutdown (30s max)

---

## Paso 3: Persistir SL orders en DB

**Problema**: StopLossManager guardaba order IDs en un Map en memoria. Si el bot crasheaba, las SL orders quedaban huérfanas en HL.

**Implementación**:
- [x] Tabla `stop_loss_orders` en `001_initial.ts` (id, pool_config_id, wallet_id, wallet_type, asset, hl_order_id, status, created_at, cancelled_at)
- [x] `packages/db/src/repositories/stop-loss.repo.ts` — CRUD: create, findActive, findAllActive, markCancelled, markCancelledByIds, markTriggered
- [x] StopLossManager usa repo como fuente de verdad + Map in-memory como cache
- [x] `cleanupOrphanedSLs()` al iniciar — lee SLs activos de DB, cancela en HL, marca cancelled
- [x] 11 tests en `stop-loss.repo.test.ts`

---

## Paso 4: Alertas via webhook (Discord / Telegram)

**Problema**: Cuando se abría/cerraba un hedge, errores del bot, o balance bajo — nadie se enteraba.

**Implementación**:
- [x] `packages/common/src/utils/webhook.ts` — sendWebhookAlert() con Discord embed format
- [x] Wiring en main.ts para eventos: hedge-opened, hedge-closed, wallet-balance (isLow), bot startup, bot shutdown, fatal errors
- [x] Env var `ALERT_WEBHOOK_URL` (compatible con Discord y Telegram)

---

## Paso 5: Detección de liquidaciones

**Problema**: Si una posición era liquidada en HL, el bot creía que seguía abierta.

**Implementación**:
- [x] En `WalletMonitor.checkAll()`, para cada wallet con hedge activo, comparar contra hedges abiertos en DB
- [x] Si un hedge está "open" en DB pero no hay posición en HL → fue liquidado
- [x] `engine.onLiquidation()` — cierra el hedge en DB con closeReason='liquidated'
- [x] Frecuencia: cada 30s (mismo ciclo que checkAll)

---

## Paso 6: DB cleanup automático

**Problema**: `price_cache` y `pnl_snapshots` crecen sin límite.

**Implementación**:
- [x] `pnl.repo.cleanupPriceCache(olderThan)` — DELETE entries > 7 días (preserva `__bot_heartbeat`)
- [x] `pnl.repo.cleanupPnlSnapshots(olderThan)` — DELETE entries > 90 días
- [x] Interval de cleanup cada hora en main.ts
- [x] 4 tests en `pnl.repo.test.ts`

---

## Paso 7: Docker hardening

**Problema**: Container corría como root, sin health checks, sin init process, sin resource limits.

**Implementación**:
- [x] Non-root user `botuser` (uid 1001)
- [x] `init: true` en docker-compose
- [x] Health checks para bot y dashboard
- [x] Resource limits (512M)
- [x] Vault volume path → `/home/botuser/.rangeguard`

---

## Paso 8: .env.example actualizado + config validation

**Problema**: Faltaban env vars nuevas y no había validación de que las requeridas existieran.

**Implementación**:
- [x] Nuevas env vars en `.env.example`: `DASHBOARD_API_KEY`, `ALERT_WEBHOOK_URL`, HL mainnet URL
- [x] Config validation en `apps/bot/src/config.ts`: warnings para missing `VAULT_PASSWORD`, `DASHBOARD_API_KEY`, `ALERT_WEBHOOK_URL`
- [x] Info log si usa testnet

---

## Resumen de calidad

| Métrica | Antes | Después |
|---------|-------|---------|
| Tests | 62 | 78 |
| Typecheck errors | 0 | 0 |
| Lint errors | 0 | 0 |
| Auth | Ninguna | API key + cookie |
| Crash recovery | Ninguna | SL persistence + handlers |
| Alertas | Solo stdout | Webhook Discord/Telegram |
| Liquidation detection | No | Sí (30s polling) |
| DB growth | Sin límite | Cleanup automático |
| Docker security | root user | Non-root + limits |
