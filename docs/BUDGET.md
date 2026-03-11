# Presupuesto — RangeGuard V2

## Resumen para el cliente

### Producto entregado (V1) — Ya implementado

| # | Feature | Estado |
|---|---------|--------|
| R1 | Monitoreo de pools multi-chain (Arbitrum, Ethereum, Base, Polygon) | ✅ Completo |
| R2 | Configuración manual de pools desde dashboard | ✅ Completo |
| R3 | Ejecución automática de hedge en Hyperliquid (open/close + SL backup) | ✅ Completo |
| R4 | Múltiples wallets — una por pool | ✅ Completo |
| R5 | Wallet de ganancia (profit) compartida | ✅ Completo |
| R6 | Seguridad de claves privadas (AES-256-GCM + scrypt) | ✅ Completo |
| R7 | Dashboard de monitoreo (PnL, charts, historial, estado del bot) | ✅ Completo |
| R8 | Detección de falsas rupturas (debounce + cooldown) | ✅ Completo |
| R9 | Infraestructura (Docker, CI/CD, VPS-ready) | ✅ Completo |
| — | Dashboard auth (API key + login) | ✅ Completo |
| — | Crash recovery (SL persistidas en DB) | ✅ Completo |
| — | Alertas Discord/Telegram via webhook | ✅ Completo |
| — | Detección de liquidaciones | ✅ Completo |
| — | DB cleanup automático | ✅ Completo |
| — | Docker hardening (non-root, health checks, limits) | ✅ Completo |
| — | E2E testnet verified (ciclo completo open→close hedge) | ✅ Completo |

**Métricas de calidad V1:**
- 116 tests automatizados — reducen el riesgo de bugs que pueden causar pérdida de fondos
- 0 errores de typecheck (TypeScript strict) — cada variable y operación está validada en compilación
- 0 errores de lint
- 7 paquetes en monorepo, ~12,100 líneas de código en 125 archivos
- 17 componentes UI (shadcn/ui)

**Verificación E2E en testnet (10 marzo 2026):**
- Ciclo completo open→close hedge verificado en Hyperliquid testnet
- Latencia de ejecución: **2.4 segundos** desde detección hasta orden ejecutada
- Stop-loss backup colocado y cancelado correctamente
- El bot detectó cambios de configuración en vivo (pool sync cada 30s)

---

### Nuevos requerimientos (V2) — Pedidos por el cliente

---

## R10. Bot de Trading dentro del Rango

### Descripción
Bot que opera activamente **dentro** del rango del pool de liquidez en Hyperliquid. Abre longs en la zona baja y shorts en la zona alta, buscando capturar movimiento de precio como ganancia adicional al yield del pool.

### Alcance técnico detallado

| Componente | Descripción | Complejidad |
|------------|-------------|-------------|
| **Range Entry Detector** | Nuevo state machine que detecta zonas de entrada (zona baja → long, zona alta → short). Debounce configurable. | Alta |
| **Entry Calculator** | Calcula tamaño de posición según config (apalancamiento, monto, % del rango). Validaciones de risk. | Media |
| **Position Executor** | Coloca órdenes IOC en HL, registra en DB. Reutiliza infra existente de `HyperliquidClient`. | Media |
| **Stop Loss fijo** | Coloca SL como trigger order en HL al abrir posición. Configurable en % o precio absoluto. | Media |
| **Trailing Stop** | HL no soporta trailing stop nativo → el bot monitorea el precio y mueve el SL dinámicamente. Requiere estado en memoria + persistencia en DB para crash recovery. | **Alta** |
| **Apalancamiento configurable** | Exponer leverage en UI por pool, separado del hedge. Ya existe la lógica en HL client. | Baja |
| **DB: tabla `range_trades`** | Nueva tabla para trades del bot de trading (similar a `hedge_trades`). Migraciones, repositorio, tests. | Media |
| **DB: campos en `pool_configs`** | Agregar campos de configuración de range trading al pool existente (zones, SL%, TS%, leverage, enabled). | Baja |
| **API endpoints** | CRUD de configuración de range trading por pool. Listado de trades. Stats separados. | Media |
| **Dashboard: config UI** | Formulario de configuración de range trading por pool (SL, TS, leverage, zonas). | Media |
| **Dashboard: trades view** | Tabla de trades del bot de trading, separada de hedges. Métricas propias. | Media |
| **Integration con hedge** | Lógica de coordinación: si hay hedge activo, ¿se pausa el trading? ¿wallet compartida o separada? | Media |
| **Tests** | Unit tests para calculator, detector, executor. ~20-30 tests nuevos. | Media |

### Dependencias
- Reutiliza: monitoreo de pools (R1), wallets (R4), vault (R6), HL client, event bus
- Requiere: definición final del cliente en preguntas abiertas (ver REQUIREMENTS_V2.md)

### Riesgos
- Trailing stop requiere monitoreo continuo — si el bot se cae, la posición queda sin trailing. Mitigación: SL fijo como backup + crash recovery.
- Wallet compartida con hedge puede generar conflictos de posición. Recomendación: wallet dedicada.
- La lógica de entrada (cuándo abrir long/short) puede requerir iteración con el cliente.

---

## R11. Costos detallados por Pool + Historial con limpieza

### Descripción
Desglose completo de costos y trades dentro de cada pool. Historial general con posibilidad de borrado manual.

### Alcance técnico detallado

| Componente | Descripción | Complejidad |
|------------|-------------|-------------|
| **Queries SQL de agregación** | SUM fees, COUNT trades, PnL neto por pool. GROUP BY pool_config_id. | Baja |
| **API: `/api/pools/[id]/costs`** | Endpoint que devuelve desglose de costos por pool. | Baja |
| **API: `/api/history`** | Endpoint consolidado con filtros (pool, fecha, tipo). Paginación. | Media |
| **API: `DELETE /api/history`** | Borrado de historial por pool o general. Confirmación. | Baja |
| **Dashboard: sección costos en pool detail** | Tabla de costos + totales en `/pools/[id]`. | Media |
| **Dashboard: página historial mejorada** | Filtros, totales acumulados, botón de borrado con confirmación. | Media |
| **Fees reales vs estimados** | Opción: seguir estimando (0.035%) o llamar `getUserFills()` de HL. Decisión del cliente. | Baja-Media |
| **Tests** | Tests para queries de agregación y endpoints de borrado. ~8-10 tests. | Baja |

### Dependencias
- Datos ya existen en `hedge_trades` y `trade_log`
- Se expande con datos de R10 cuando se implemente

---

## R12. Interfaz en Español

### Descripción
Traducción completa del dashboard al español.

### Alcance técnico detallado

| Componente | Descripción | Complejidad |
|------------|-------------|-------------|
| **Traducción de strings** | ~200 strings en ~25 archivos (páginas + componentes). | Media |
| **Formatos localizados** | Fechas dd/mm/yyyy, números con separadores locales. | Baja |
| **Implementación** | Opción A (solo español, reemplazo directo) — sin framework i18n. | Baja |
| **QA visual** | Verificar que textos traducidos no rompan layouts. | Baja |

### Notas
- No se usa framework i18n (next-intl) a menos que el cliente quiera multi-idioma en el futuro
- La página About ya está mayormente en español

---

## Tabla de esfuerzo consolidada

| Req | Feature | Esfuerzo estimado (horas) | % del total V2 |
|-----|---------|---------------------------|----------------|
| R10 | Range Trading Bot | 60-80 hs | ~65% |
| R10.3 | — Trailing Stop (dentro de R10) | 15-20 hs | incluido |
| R11 | Costos por pool + historial | 16-24 hs | ~20% |
| R12 | UI en español | 8-12 hs | ~10% |
| — | Testing + QA + ajustes | 8-10 hs | ~5% |
| **Total** | | **92-126 hs** | **100%** |

> **Nota**: El cliente pidió "calculá de más por las dudas" → aplicar margen del 20-30% sobre el total.
>
> **Con margen**: ~110-165 hs

---

## Consideraciones para el presupuesto

### Valor del bot: protección de capital

El bot no es un gasto — es un seguro contra impermanent loss. Sin cobertura automática, cada vez que el precio sale del rango, el pool pierde valor sin protección. Con el bot, esa misma caída genera ganancia en el short que compensa la pérdida.

- **Costo operativo del bot**: ~$50-300/mes (hosting + nodo + fees de HL). Ver detalle en `docs/COSTOS_OPERATIVOS.md`.
- **Costo de NO tener el bot**: cada evento de range-exit sin cobertura puede representar el 5-15% del valor del pool en impermanent loss, dependiendo del ancho del rango y la magnitud del movimiento.
- **El bot se paga con 1-2 hedges exitosos.** Después, todo es protección neta.

### Escalabilidad futura

El cliente mencionó que "seguro agrego un bot más de Trading". La arquitectura de R10 se diseña para que agregar nuevos tipos de bot sea plug-and-play:
- Cada bot es un "engine" independiente que recibe eventos de precio
- Comparten infraestructura común (wallets, HL client, pool monitoring, DB)
- Agregar un nuevo bot = nuevo engine + nuevas reglas de entrada/salida
- **Estimación de un bot adicional futuro: ~40-50% del esfuerzo de R10** (la infra ya está)

### Entregables por fase

**Fase 1** — R12 (español) + R11 (costos/historial)
- Mejora inmediata visible en el dashboard actual
- No requiere preguntas abiertas al cliente
- Estimación: 24-36 hs (~2-3 semanas)
- Entregables: dashboard traducido, costos por pool, historial con filtros y borrado

**Fase 2** — R10 (range trading bot)
- Requiere definición previa con el cliente (6 preguntas abiertas en REQUIREMENTS_V2.md)
- Se puede empezar la infra mientras se resuelven las preguntas
- Estimación: 68-90 hs (~4-6 semanas)
- Entregables: bot de trading funcional, trailing stop, dashboard de trades, tests

### Garantía

- **Bug fixes**: correcciones sin cargo por 60 días después de la entrega de cada fase
- **Soporte**: disponibilidad para consultas durante el período de garantía
- **Documentación**: cada feature entregada con documentación actualizada

### Stack técnico (sin cambios)
- TypeScript, Node.js 22, pnpm monorepo
- Next.js 15, React 19, Tailwind CSS 4, shadcn/ui
- SQLite (better-sqlite3, WAL mode)
- Hyperliquid SDK (@nktkas/hyperliquid v0.16)
- viem (multi-chain RPC)
- Vitest (testing)
- Docker (deployment)

---

## Archivos de referencia

| Documento | Contenido |
|-----------|-----------|
| `docs/REQUIREMENTS.md` | Requerimientos originales R1-R9 (V1) |
| `docs/REQUIREMENTS_V2.md` | Requerimientos nuevos R10-R12 + preguntas abiertas |
| `docs/PRODUCTION_READINESS.md` | 8 pasos de producción ya implementados |
| `docs/BUDGET.md` | Este documento |
| `docs/COSTOS_OPERATIVOS.md` | Costos de correr el bot en producción (hosting, nodo, fees HL, latencia) |
| `docs/PRICING_DESARROLLO.md` | Cómo calcular el precio del desarrollo (horas, rates, modelos de cobro) |
| `docs/TESTNET_GUIDE.md` | Guía de testing en testnet HL |
| `CLAUDE.md` | Referencia técnica del proyecto |
