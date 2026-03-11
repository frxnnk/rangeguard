# Costos Operativos — RangeGuard V1

Análisis detallado del costo de correr el bot en producción a máxima capacidad.

---

## Definición de "máxima capacidad"

| Parámetro | Valor máximo práctico | Notas |
|-----------|----------------------|-------|
| Pools monitoreados | 20-50 | Límite práctico por rate-limit de RPCs |
| Cadenas simultáneas | 4 (Arbitrum, Ethereum, Base, Polygon) | Cada una requiere su propio RPC |
| Wallets de protección | 1 por pool (20-50) | Cada pool necesita su propia wallet |
| Wallet de profit | 1 (global, compartida) | Opcional, replica trades de todas las pools |
| Apalancamiento | Hasta 50x por pool | Default: 10x |
| Polling de precios | Cada 5 segundos por pool | Configurable vía `POLLING_INTERVAL_MS` |
| Chequeo de wallets | Cada 30 segundos | 2 API calls por wallet (balance + posiciones), secuencial |

---

## 1. Hosting (servidor)

El bot es un proceso Node.js liviano (100-200 MB RAM) + dashboard Next.js.

| Opción | Costo mensual | Pros | Contras |
|--------|--------------|------|---------|
| **Railway Hobby** | **$5/mes** | Deploy simple, auto-deploy desde GitHub, SSL gratis | Almacenamiento limitado, sin SSH |
| **Railway Pro** | **$20/mes** | Más RAM/CPU, mejores SLAs | — |
| **VPS básico** (Hetzner, DigitalOcean) | **$5-12/mes** | Control total, SSH, 1-2 GB RAM sobra | Setup manual, mantener Docker |
| **VPS dedicado** (para baja latencia) | **$20-50/mes** | Más potencia, región cercana a RPCs | Overkill para este uso |

**Recomendación**: Railway Hobby ($5/mes) o VPS básico ($6/mes). El bot no necesita mucho poder.

**Estimación**: **$5-20/mes**

---

## 2. Proveedores RPC (nodos blockchain)

El bot necesita leer precios de los pools en cadena. Hace ~720 llamadas RPC/hora por cada pool único monitoreado (polling cada 5s). Con WebSocket, las llamadas bajan drásticamente.

### Consumo estimado por escenario

| Escenario | Pools | Cadenas | Calls RPC/día | Calls RPC/mes |
|-----------|-------|---------|---------------|---------------|
| Básico | 5 | 1 (Arbitrum) | ~86,400 | ~2.6M |
| Medio | 15 | 2 (Arb + ETH) | ~259,200 | ~7.8M |
| Máximo | 50 | 4 (todas) | ~864,000 | ~26M |

> **Nota**: Pools en la misma cadena y misma dirección comparten watcher (1 watcher = 1 timer de polling). Si tenés 3 configs para el mismo pool ETH/USDC en Arbitrum, es 1 sola serie de calls, no 3.

### Proveedores RPC y costos

| Proveedor | Plan gratuito | Plan pago | WebSocket | Notas |
|-----------|---------------|-----------|-----------|-------|
| **Alchemy** | 300M CUs/mes (~11M calls `eth_call`) | Growth $49/mes (1.2B CUs) | Sí (incluido) | Mejor opción calidad/precio |
| **Infura** | 100K req/día (~3M/mes) | $50/mes (100K/día + extras) | Sí (plan pago) | Confiable pero más caro |
| **QuickNode** | 50M API credits/mes | $49/mes (300M) | Sí | Buen performance |
| **Ankr** | 30M req/mes (gratuito) | $49/mes premium | Sí | Más económico |
| **Public RPCs** | Gratis, ilimitado | — | No | Rate-limited, no confiable para producción |

### Costo según escenario

| Escenario | Sin WebSocket | Con WebSocket | Notas |
|-----------|---------------|---------------|-------|
| Básico (5 pools, 1 chain) | **Gratis** (Alchemy free tier sobra) | **Gratis** | 2.6M calls caben fácil en 11M del free tier |
| Medio (15 pools, 2 chains) | **Gratis** (7.8M < 11M free tier) | **Gratis** | Free tier alcanza incluso sin WS |
| Máximo (50 pools, 4 chains) | **$0-49/mes** (26M > 11M free, puede necesitar Growth) | **$0-49/mes** | Con Growth (1.2B CUs) sobra ampliamente |

> **Nota sobre WebSocket y calls RPC**: WS **no elimina** el polling de `slot0()` — el polling sigue corriendo como fallback incluso con WS activo. Lo que WS aporta es **detección más rápida** (eventos push en vez de esperar al próximo poll). El ahorro en calls RPC es mínimo; el beneficio real es la latencia.

**Estimación**: **$0-49/mes** (con WebSocket: probablemente gratis)

---

## 2b. Latencia y Nodo Dedicado (R1 + R9)

El cliente pidió explícitamente **"la menor latencia posible"** y **"soporte para nodo RPC dedicado"**. Esta sección explica exactamente qué impacto tiene, cuánto cuesta, y qué opciones hay.

### Cadena de latencia: desde el movimiento de precio hasta el hedge ejecutado

Cuando el precio de un activo se mueve en la blockchain, el bot pasa por esta cadena:

```
PASO 1: Precio cambia on-chain (swap en Uniswap)
   ↓
PASO 2: El bot detecta el cambio
   ↓  → Con WebSocket: ~100-500ms (evento push en tiempo real)
   ↓  → Con polling HTTP: 0-5,000ms (depende del timing del poll)
   ↓
PASO 3: Range detector confirma la salida del rango (debounce)
   ↓  → 3 observaciones consecutivas requeridas
   ↓  → Con WS:  ~300-1,500ms (3 eventos rápidos)
   ↓  → Con polling: ~10,000-15,000ms (3 polls × 5s)
   ↓
PASO 4: Orden enviada a Hyperliquid
   ↓  → Resolver asset index: ~50-200ms (cacheado después del primero)
   ↓  → Setear leverage: ~100-300ms
   ↓  → Colocar orden IOC: ~50-200ms
   ↓  → Total ejecución: ~200-700ms
   ↓
PASO 5: Orden filled + SL backup colocado
   ↓  → SL backup: ~200-700ms adicionales
   ↓
PASO 6: DB actualizada + alerta enviada
   ↓  → <10ms (SQLite local)
   ↓
═══════════════════════════════════════════
LATENCIA TOTAL:
  Con WebSocket + nodo dedicado:  0.6 - 2.5 segundos
  Con polling HTTP público:       10 - 20 segundos
═══════════════════════════════════════════
```

**Dato real (testnet E2E, 10 marzo 2026)**: Hedge abierto en **2.4 segundos** desde la detección hasta el fill en Hyperliquid.

### ¿Por qué importa la latencia?

La latencia NO causa impermanent loss directamente — el IL es función del movimiento de precio, no del tiempo. Lo que la latencia causa es **exposición sin cobertura**: mientras el bot detecta y ejecuta el hedge, el precio puede seguir moviéndose y esa ventana queda sin protección.

**Ejemplo concreto**: ETH a $2,000, pool de $10K con rango ±3%.

1. ETH baja a $1,940 (sale del rango por abajo) → IL comienza a acumularse
2. **Con WS (2s)**: El bot detecta y abre short en ~2s. ETH bajó a ~$1,939 cuando el hedge abre. Exposición sin hedge: ~$0.50 de movimiento adicional.
3. **Con polling (15s)**: El bot detecta y abre short en ~15s. ETH bajó a ~$1,935 cuando el hedge abre. Exposición sin hedge: ~$2.50 de movimiento adicional.

La diferencia real depende de la **velocidad de caída del precio** en ese momento:

| Velocidad del movimiento | Exposición extra sin hedge (15s vs 2s) | Impacto en pool de $10K |
|--------------------------|---------------------------------------|------------------------|
| Movimiento lento (ETH baja $1/s) | ~$13 de precio sin cubrir | ~$3-6 de IL extra |
| Movimiento medio ($5/s) | ~$65 de precio sin cubrir | ~$15-30 de IL extra |
| Crash rápido ($20/s) | ~$260 de precio sin cubrir | ~$60-130 de IL extra |

> **Importante**: Estos números son aproximaciones. El IL real en LP concentrada depende del ancho del rango, la distribución de liquidez, y el volumen de trading en el pool. Rangos más estrechos = IL más agresivo por unidad de movimiento de precio.
>
> En condiciones normales de mercado, la diferencia entre 2s y 15s es marginal. **En crashes o movimientos violentos es donde la latencia se paga.**

### Modos de operación: Polling vs WebSocket

| Característica | Polling HTTP (default) | WebSocket (nodo dedicado) |
|---|---|---|
| **Cómo funciona** | El bot pregunta el precio cada 5s | El nodo le avisa al bot cuando hay un swap |
| **Latencia de detección** | 0-5,000ms (promedio 2,500ms) | 100-500ms |
| **Latencia total con debounce** | 10-15 segundos | 0.6-2.5 segundos |
| **Calls RPC/hora (10 pools)** | ~7,200 | ~7,200 (polling sigue activo como fallback) |
| **RPCs públicos gratis** | Sí, pero rate-limited | No soportan WebSocket |
| **Nodo dedicado requerido** | No (funciona con RPCs públicos) | **Sí** |
| **Costo** | $0 (gratis) | $29-199/mes según proveedor |

### Opciones de nodo dedicado con costos

#### Opción 1: Proveedor RPC con WebSocket (recomendado)

Servicio hosted — no requiere mantener infraestructura propia.

| Proveedor | Plan con WebSocket | Costo/mes | Chains incluidas | Latencia típica |
|-----------|-------------------|-----------|-----------------|----------------|
| **Alchemy Growth** | 1.2B CUs, WS incluido | **$49/mes** | Todas (Arb, ETH, Base, Polygon) | 50-150ms |
| **Alchemy Scale** | 5B CUs, WS dedicado | **$199/mes** | Todas + SLA garantizado | 20-80ms |
| **QuickNode Build** | 300M API credits, WS | **$49/mes** | 1 endpoint (1 chain) | 30-100ms |
| **QuickNode Scale** | Custom, multi-chain | **$299+/mes** | Multi-chain | 20-60ms |
| **Infura Growth** | WS add-on | **$50/mes** | Ethereum, Arbitrum, Polygon | 50-200ms |
| **dRPC** | Pay-per-use, WS | **$10-30/mes** | Todas | 50-150ms |

**Recomendación**: **Alchemy Growth ($49/mes)** — cubre todas las chains, incluye WebSocket, y el free tier sirve como fallback.

> **Disclaimer**: Precios de proveedores verificados a marzo 2026. Consultar sitios oficiales para precios actualizados: [alchemy.com/pricing](https://www.alchemy.com/pricing), [quicknode.com/pricing](https://www.quicknode.com/pricing), [infura.io/pricing](https://www.infura.io/pricing). QuickNode cobra por endpoint (1 chain por plan base) — para 4 chains serían ~$196/mes.

#### Opción 2: Nodo propio (self-hosted)

Correr tu propio nodo Ethereum/Arbitrum. Máxima velocidad, máximo control, máximo esfuerzo.

| Tipo de nodo | Costo/mes | Setup | Latencia | Notas |
|-------------|-----------|-------|----------|-------|
| **Arbitrum Nitro full node** | $80-150/mes (VPS 1-2TB NVMe, 16GB RAM) | 2-5 días sync | <10ms | Solo Arbitrum. Requiere mantenimiento y podado periódico. |
| **Ethereum full node (geth)** | $150-300/mes (VPS 2TB+ NVMe, 32GB RAM) | 5-14 días sync | <10ms | Solo Ethereum. Disco crece ~1GB/día con podado. |
| **Multi-chain (4 nodos)** | $500-1,000/mes | 2-4 semanas | <10ms | Costoso y complejo de mantener. Requiere sysadmin dedicado. |

> **No recomendado** para este proyecto salvo que el cliente tenga infraestructura existente. Un proveedor como Alchemy ofrece el 95% del beneficio por una fracción del costo y esfuerzo.

#### Opción 3: Modo híbrido (recomendado para producción)

```
Chains principales (Arbitrum, Ethereum):
  → WebSocket via Alchemy Growth ($49/mes)
  → Latencia: 100-500ms
  → El 90% de los pools probablemente están en Arbitrum

Chains secundarias (Base, Polygon):
  → Polling HTTP via RPCs públicos (gratis)
  → Latencia: 5-15 segundos
  → Aceptable si hay menos pools y rangos más amplios

Fallback:
  → Si WS se desconecta → automáticamente cae a polling HTTP
  → El bot no se detiene, solo pierde velocidad temporalmente
```

**Costo del modo híbrido: $49/mes** — Mejor relación latencia/costo.

### Configuración en el bot

El soporte para nodo dedicado ya está implementado. Solo requiere configurar variables de entorno:

```bash
# Nodo dedicado para Arbitrum (WebSocket + HTTP fallback)
WS_ARBITRUM=wss://arb-mainnet.g.alchemy.com/v2/TU_API_KEY
RPC_ARBITRUM=https://arb-mainnet.g.alchemy.com/v2/TU_API_KEY

# Nodo dedicado para Ethereum
WS_ETHEREUM=wss://eth-mainnet.g.alchemy.com/v2/TU_API_KEY
RPC_ETHEREUM=https://eth-mainnet.g.alchemy.com/v2/TU_API_KEY

# Base y Polygon con RPCs públicos (o también dedicados)
# RPC_BASE=https://base-mainnet.g.alchemy.com/v2/TU_API_KEY
# RPC_POLYGON=https://polygon-mainnet.g.alchemy.com/v2/TU_API_KEY
```

El bot detecta automáticamente si hay WS disponible → usa WebSocket. Si no → cae a polling HTTP. **No requiere cambios de código.**

### Parámetros de tuning de latencia

| Parámetro | Default | Para mínima latencia | Trade-off |
|-----------|---------|---------------------|-----------|
| `POLLING_INTERVAL_MS` | 5,000ms | 2,000ms | Más calls RPC, más caro |
| `DEBOUNCE_COUNT` | 3 | 2 | Más sensible a falsos positivos |
| `COOLDOWN_MINUTES` | 5 | 2-3 | Puede reabrir hedges muy rápido |

### Optimización avanzada: Co-locación del servidor

Para exprimir el último bit de latencia, el servidor (VPS) debería estar geográficamente cerca del nodo RPC y de Hyperliquid:

| Proveedor hosting | Región | Latencia estimada a RPCs | Costo/mes |
|---|---|---|---|
| **Railway** (auto) | US-West | ~20-50ms | $5-20 |
| **Hetzner** (Falkenstein, DE) | EU | ~30-80ms | $5-10 |
| **DigitalOcean** (NYC) | US-East | ~10-30ms | $6-12 |
| **AWS Lightsail** (us-east-1) | US-East | ~5-20ms | $10-20 |

> La co-locación ahorra 20-100ms por operación. Es un nice-to-have, no un requisito.
>
> **Nota**: Las latencias a Hyperliquid no están incluidas porque la ubicación de sus servidores no es pública. En nuestro test E2E (testnet, marzo 2026), la latencia total de envío + fill de orden fue de ~2.4s, que incluye tanto el roundtrip de red como el procesamiento de HL.

### Resumen de costos de latencia

| Configuración | Latencia total | Costo mensual | Recomendado para |
|---|---|---|---|
| **Polling HTTP + RPC público** | 10-20 segundos | $0 | Testing, demo, pools con rangos amplios |
| **WS + Alchemy Growth** | 0.6-2.5 segundos | **$49/mes** | Producción estándar (mayoría de casos) |
| **WS + Alchemy Scale + VPS optimizado** | 0.3-1.5 segundos | **$220-250/mes** | Pools de alto valor, rangos muy estrechos |
| **Nodo propio + VPS co-locado** | <0.5 segundos | **$350-600/mes** | Operaciones institucionales |

> **Para el 95% de los casos, Alchemy Growth ($49/mes) es suficiente.** La diferencia entre 1.5s y 0.5s rara vez justifica 5x el costo.

---

## 3. Comisiones de Hyperliquid (trading fees)

**Este es el costo operativo principal del bot.** Cada vez que se abre o cierra un hedge, HL cobra comisión.

### Estructura de fees de Hyperliquid

| Tipo | Fee | Cuándo aplica |
|------|-----|---------------|
| **Taker** (IOC market) | **0.035%** | Apertura y cierre de hedge |
| **Maker** (limit resting) | 0.01% (o rebate) | No se usa en el bot (IOC siempre) |
| **SL trigger** | 0.035% | Solo si se ejecuta el stop-loss |
| **Cancelación de orden** | $0 | Gratis — cancelar SL no cuesta nada |
| **Funding rate** | Variable (~0.01%/8h) | Se paga/cobra cada 8h si hay posición abierta |

### Costo por ciclo de hedge (open → close)

Un ciclo completo de hedge tiene estos eventos de fee:

```
1. Abrir hedge (short/long)     → 0.035% taker fee
2. Colocar SL backup            → $0 (orden pendiente, no ejecutada)
3. Cerrar hedge (range return)  → 0.035% taker fee
4. Cancelar SL backup           → $0 (cancelación gratis)
                                 ─────────────────────
                Total por ciclo: 0.07% del valor nocional
```

Si el SL se ejecuta en vez del cierre normal:
```
1. Abrir hedge                  → 0.035%
2. SL se ejecuta (en vez de 3+4)→ 0.035%
                                 ─────────────
                Total por ciclo: 0.07% (igual)
```

### Ejemplos de costo por tamaño de pool

| Pool (USD) | Leverage | Nocional | Fee apertura | Fee cierre | **Total por ciclo** |
|-----------|----------|----------|-------------|------------|---------------------|
| $1,000 | 10x | $1,000 | $0.35 | $0.35 | **$0.70** |
| $5,000 | 10x | $5,000 | $1.75 | $1.75 | **$3.50** |
| $10,000 | 10x | $10,000 | $3.50 | $3.50 | **$7.00** |
| $50,000 | 10x | $50,000 | $17.50 | $17.50 | **$35.00** |
| $100,000 | 10x | $100,000 | $35.00 | $35.00 | **$70.00** |
| $10,000 | 50x | $10,000 | $3.50 | $3.50 | **$7.00** |

> **Importante**: El fee se calcula sobre el tamaño de la posición (en USD), no sobre el colateral. Un pool de $10,000 a 10x apalancamiento → posición de $10,000 nocional → fee sobre $10,000.

### Wallet de profit (duplica los fees)

Si la wallet de profit está habilitada, **cada trade se replica** en la wallet de profit:
- Apertura: 2 órdenes (protección + profit) → 2x fee
- Cierre: 2 órdenes → 2x fee
- **Total con profit wallet: 0.14% por ciclo**

### Frecuencia estimada de hedges

La frecuencia depende de la volatilidad del mercado y del ancho del rango configurado:

| Rango | Frecuencia estimada | Hedges/mes |
|-------|--------------------|----|
| **Muy estrecho** (±1-2%) | Varios por día | 30-90 |
| **Estrecho** (±3-5%) | 1-3 por semana | 4-12 |
| **Medio** (±5-10%) | 1-2 por mes | 1-2 |
| **Amplio** (±10-20%) | Raro | 0-1 |

### Costo mensual de fees por escenario

#### Escenario conservador: 5 pools × $10K, rango medio, sin profit wallet
```
Fee por ciclo: $10K × 0.07% = $7.00 (solo wallet de protección)
5 pools × 2 hedges/mes × $7.00 = $70/mes
```

#### Escenario medio: 15 pools × $20K, rango estrecho, con profit wallet
```
Fee por ciclo por wallet: $20K × 0.07% = $14.00
Con profit wallet: $14.00 × 2 wallets = $28.00 por ciclo total
15 pools × 8 hedges/mes × $28.00 = $3,360/mes
```

#### Escenario máximo: 50 pools × $50K, rango estrecho, con profit wallet
```
Fee por ciclo por wallet: $50K × 0.07% = $35.00
Con profit wallet: $35.00 × 2 wallets = $70.00 por ciclo total
50 pools × 8 hedges/mes × $70.00 = $28,000/mes
```

> **Nota**: En escenarios de alto volumen, HL ofrece descuentos por volumen (VIP tiers). A partir de $5M de volumen mensual, el fee baja a 0.03% y sigue bajando.

**Estimación realista (10-20 pools, rango medio)**: **$100-500/mes en fees**

---

## 4. Funding Rate (costo de mantener posición abierta)

Hyperliquid cobra/paga **funding rate cada 8 horas** a posiciones abiertas. Es un costo variable que depende del mercado.

| Situación | Funding rate típico | Costo/día por $10K nocional |
|-----------|--------------------|----|
| Mercado neutral | ±0.005%/8h | ~$1.50/día |
| Mercado alcista (shorts pagan) | +0.01-0.05%/8h | $3-15/día |
| Mercado bajista (shorts cobran) | -0.01%/8h | -$3/día (te pagan) |

**Duración promedio de un hedge**: depende del rango. Si el precio vuelve al rango en horas, el funding es mínimo. Si queda fuera días/semanas, puede ser significativo.

**Estimación mensual (10 pools, hedges activos ~20% del tiempo)**:
- Caso normal: **$50-200/mes**
- Caso extremo (mercado muy alcista, shorts caros): **$500-2,000/mes**

---

## 5. Colateral necesario en wallets (capital requerido)

Esto NO es un "costo" mensual, sino el capital que el cliente necesita tener depositado en Hyperliquid para operar.

### Colateral mínimo por pool

```
Colateral = Tamaño del pool (USD) / Apalancamiento
```

| Pool (USD) | Leverage 10x | Leverage 20x | Leverage 50x |
|-----------|-------------|-------------|-------------|
| $1,000 | $100 | $50 | $20 |
| $5,000 | $500 | $250 | $100 |
| $10,000 | $1,000 | $500 | $200 |
| $50,000 | $5,000 | $2,500 | $1,000 |
| $100,000 | $10,000 | $5,000 | $2,000 |

> **Recomendación**: Depositar 2-3x el mínimo para absorber fluctuaciones y funding. Si el mínimo es $1,000, depositar $2,000-3,000.

### Ejemplo: 10 pools de $10K a 10x leverage

```
10 wallets de protección × $2,000 (2x buffer) = $20,000
1 wallet de profit × $2,000                   = $2,000
                                                ────────
                              Capital necesario: $22,000
```

### Ejemplo máximo: 50 pools de $50K a 10x leverage

```
50 wallets × $10,000 (2x buffer) = $500,000
1 wallet profit × $10,000        = $10,000
                                   ────────
                  Capital necesario: $510,000
```

---

## 6. Otros costos menores

| Concepto | Costo | Notas |
|----------|-------|-------|
| Dominio personalizado | $10-15/año | Opcional, Railway da subdominio gratis |
| SSL/TLS | $0 | Incluido en Railway/Let's Encrypt |
| Discord webhook (alertas) | $0 | Gratis |
| Telegram bot (alertas) | $0 | Gratis |
| Monitoreo externo (UptimeRobot) | $0 | Plan gratis suficiente |
| Backups DB | $0-5/mes | Opcional, cron job que copia el .db |

---

## Resumen: Costo operativo mensual

### Escenario 1 — Operación básica (5 pools, 1 chain, sin nodo dedicado)

| Concepto | Costo mensual | Latencia |
|----------|---------------|----------|
| Hosting (Railway Hobby) | $5 | — |
| RPC (públicos, polling HTTP) | $0 | 10-20s detección |
| HL trading fees (~10 hedges) | $35-70 | — |
| Funding rate | $10-50 | — |
| **Total** | **$50-125/mes** | **10-20s** |
| Capital requerido en HL | ~$5,000-10,000 | — |

### Escenario 2 — Operación media (15 pools, 2 chains, nodo dedicado WS)

| Concepto | Costo mensual | Latencia |
|----------|---------------|----------|
| Hosting (VPS) | $10-20 | — |
| **Nodo dedicado WS (Alchemy Growth)** | **$49** | **0.6-2.5s detección** |
| HL trading fees (~120 hedges) | $200-500 | — |
| Funding rate | $50-300 | — |
| **Total** | **$310-870/mes** | **0.6-2.5s** |
| Capital requerido en HL | ~$30,000-50,000 | — |

### Escenario 3 — Operación máxima (50 pools, 4 chains, profit wallet, nodo premium)

| Concepto | Costo mensual | Latencia |
|----------|---------------|----------|
| Hosting (VPS co-locado US-East) | $20-50 | — |
| **Nodo dedicado WS (Alchemy Scale)** | **$199** | **0.3-1.5s detección** |
| HL trading fees (~400 hedges × 2) | $2,000-5,000 | — |
| Funding rate | $200-2,000 | — |
| **Total** | **$2,420-7,250/mes** | **0.3-1.5s** |
| Capital requerido en HL | ~$200,000-500,000 | — |

### Comparativa rápida: con y sin nodo dedicado

| | Sin nodo dedicado | Con nodo dedicado (WS) |
|---|---|---|
| Costo extra mensual | $0 | $49-199 |
| Latencia de detección | 10-20 segundos | **0.6-2.5 segundos** |
| Mejora | — | **~8-10x más rápido** |
| IL evitado extra (por evento) | — | $40-200+ por pool (ver sección 2b) |
| ¿Se paga solo? | — | **Sí, con 1-2 hedges exitosos por mes** |

---

## Nota sobre el retorno

Los costos operativos deben compararse contra el **impermanent loss evitado**. En pools de liquidez concentrada (Uniswap V3), el IL es significativamente mayor que en pools de rango completo (V2) porque la liquidez está concentrada en un rango estrecho.

**Cómo funciona la protección:**
1. El precio sale del rango → el bot abre un short en HL
2. Si el precio sigue cayendo → el IL del pool crece, pero el short genera ganancia que lo compensa
3. Si el precio vuelve al rango → el IL se revierte, el short se cierra (con ganancia o pérdida mínima)

**Ejemplo ilustrativo** (simplificado):
- Pool de $10,000 en ETH/USDC, rango de $1,900-$2,100
- ETH cae de $2,000 a $1,800 (10% de caída, sale del rango)
- Sin hedge: IL puede ser **$500-1,500+** dependiendo de la concentración de liquidez
- Con hedge: el short captura ~$970 de ganancia (0.5 ETH × $200 de movimiento × leverage), compensando el IL
- Costo del hedge: $7-14 en fees de HL

> **Importante**: El IL real en LP concentrada depende del ancho del rango relativo al movimiento de precio. No es un porcentaje fijo. Rangos más estrechos = mayor rendimiento en fees pero mayor IL por unidad de movimiento. El bot no elimina el IL, lo **compensa** con la ganancia del short.

---

## Parámetros técnicos de referencia

| Parámetro | Valor | Dónde se configura |
|-----------|-------|--------------------|
| Polling de precios | 5,000 ms | `POLLING_INTERVAL_MS` en .env |
| Debounce (confirmaciones) | 3 lecturas | `DEBOUNCE_COUNT` en .env (global, aplica a todos los pools) |
| Cooldown post-cierre | 5 min | `COOLDOWN_MINUTES` en .env (global, aplica a todos los pools) |
| Slippage IOC | 1% (100 bps) | Constante `HL_SLIPPAGE_BPS` en `hyperliquid.ts` |
| SL buffer | 2% del rango (default) | Parámetro en `stop-loss-manager.ts` |
| Chequeo de wallets | 30s | `WALLET_CHECK_INTERVAL_MS` en .env |
| Calls HL por chequeo | 2 por wallet (balance + posiciones) | Secuencial en `wallet-monitor.ts` |
| Heartbeat del bot | 10s | Hardcodeado en `main.ts` |
| Cleanup de DB | Cada 1 hora | Hardcodeado (price_cache: 7d, pnl: 90d) |
| Leverage máximo | 50x | Constante `HL_MAX_LEVERAGE` en `hyperliquid.ts` |
