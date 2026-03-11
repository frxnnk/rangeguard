# Análisis Técnico: Cobertura de IL con Futuros Perpetuos en Uniswap V3

> Documento interno de análisis de puntos débiles, limitaciones matemáticas y viabilidad de la estrategia de hedging implementada en el bot.

---

## 1. Qué hace realmente el bot

El bot **no hedgea el IL como curva matemática**. Lo que hace es un **hedge de posición**: cuando el precio sale del rango, neutraliza la exposición delta completa del LP.

```
Precio sale por abajo → LP tiene 100% ETH → SHORT por el monto total → delta neutral
Precio sale por arriba → LP tiene 100% USDC → LONG por el monto total → captura upside
```

La fórmula actual:

```
hedgeSize = poolAmountUSD / currentPrice
```

Esto convierte el valor total del LP a unidades del activo y abre un perpetuo por esa cantidad.

---

## 2. Matemáticas de Uniswap V3 Concentrado

### Fórmulas exactas de una posición LP

Para una posición con liquidez `L` en rango `[Pa, Pb]` a precio actual `P`:

#### Cantidades de tokens

| Precio P | Token X (riesgoso) | Token Y (estable) |
|----------|-------------------|-------------------|
| P ≤ Pa | `L × (1/√Pa - 1/√Pb)` | 0 |
| Pa < P < Pb | `L × (1/√P - 1/√Pb)` | `L × (√P - √Pa)` |
| P ≥ Pb | 0 | `L × (√Pb - √Pa)` |

#### Valor de la posición V(P) (denominado en token Y)

| Precio P | V(P) |
|----------|------|
| P ≤ Pa | `L × (1/√Pa - 1/√Pb) × P` — **lineal en P** |
| Pa < P < Pb | `L × (2√P - P/√Pb - √Pa)` — **cóncava** |
| P ≥ Pb | `L × (√Pb - √Pa)` — **constante** |

#### Delta: dV/dP (sensibilidad al precio)

| Precio P | Delta |
|----------|-------|
| P ≤ Pa | `L × (1/√Pa - 1/√Pb)` — constante (exposición fija a token X) |
| Pa < P < Pb | `L × (1/√P - 1/√Pb)` = x(P) — **decrece con P** |
| P ≥ Pb | 0 — sin exposición al precio |

#### Gamma: d²V/dP² (curvatura / convexidad)

| Precio P | Gamma |
|----------|-------|
| P ≤ Pa | 0 |
| Pa < P < Pb | `-L / (2 × P^(3/2))` — **siempre negativo** (short gamma) |
| P ≥ Pb | 0 |

> **Gamma negativo** = la posición LP se comporta como una opción vendida. Pierde más a medida que el precio se mueve, independientemente de la dirección.

### Fórmula exacta del IL

Para una posición que entró a precio P0 (dentro del rango), el IL a precio P es:

```
IL(P) = -L/√P0 × (√P - √P0)²
```

- Siempre ≤ 0 (es una pérdida)
- = 0 cuando P = P0
- Crece cuadráticamente en `(√P - √P0)`
- Es **no lineal** — este es el punto clave

### IL concentrado vs. IL full-range (V2)

Para V2 (rango completo):
```
IL_V2(k) = 2√k / (1+k) - 1     donde k = P/P0
```

Para V3 concentrado con factor de rango `n = √(Pb/Pa)`:
```
IL_V3 ≈ n × IL_V2     (aproximación para rangos estrechos)
```

| Movimiento de precio | IL full-range (V2) | IL concentrado (~4x) | Sobre $10,000 |
|---------------------|-------------------|---------------------|---------------|
| 5% | 0.06% | ~0.25% | ~$25 |
| 10% | 0.25% | ~1.0% | ~$100 |
| 20% | 1.0% | ~4.0% | ~$400 |
| 50% | 5.7% | ~23% | ~$2,300 |

---

## 3. Nuestro bot vs. hedge óptimo teórico

| | Nuestro bot | Hedge óptimo teórico |
|---|---|---|
| **Cuándo hedgea** | Solo al salir del rango | Continuamente dentro del rango |
| **Tamaño** | `poolAmountUSD / price` (100% de la posición) | `x(P) = L(1/√P - 1/√Pb)` (delta real, varía) |
| **Rebalanceo** | Nunca (abre y cierra una vez) | Continuo (gamma hedging) |
| **Qué cubre** | Exposición total post-exit | IL incremental momento a momento |
| **Gamma residual** | No cubierto | Parcialmente cubierto |

### El hedge óptimo con perps

El ratio de hedge instantáneo delta-neutral sería:

```
Hedge_size(P) = -x(P) = -L × (1/√P - 1/√Pb)     para Pa < P < Pb
```

En dólares como fracción del valor de la posición:
```
hedge_fraction(P) = x(P) × P / V(P)
```

Esto varía continuamente — requiere rebalanceo constante, incurriendo en fees cada vez.

### El residuo no hedgeable (con perps)

Un instrumento lineal (perpetuo) no puede cubrir un payoff no-lineal (LP). El residuo por cada movimiento discreto de precio es:

```
Residuo = ½ × |Gamma| × (ΔP)² = L × (ΔP)² / (4 × P^(3/2))
```

---

## 4. Punto débil #1: Pool amount manual

### El problema

```typescript
// hedge-calculator.ts línea 40
const sizeInAsset = poolAmountUsd / currentPrice;
```

`poolAmountUsd` es un número ingresado a mano. Puede divergir del valor real por:

1. **IL acumulado dentro del rango** redujo el valor real
2. **Fees acumulados** aumentaron el valor real
3. **Liquidez agregada/removida** sin actualizar config
4. **Cambio de precio** desde la configuración

### Impacto cuantificado

Si el pool real vale $8,000 pero el config dice $10,000:
- Hedge size = $10,000 / $1795 = 5.57 ETH
- Exposición real = $8,000 / $1795 = 4.46 ETH
- **Sobre-cobertura de 1.11 ETH = $2,000 de posición direccional no deseada**

### Solución posible

Leer la posición on-chain vía NFT Position Manager de Uniswap V3:
```
nonfungiblePositionManager.positions(tokenId)
→ liquidity, tickLower, tickUpper
→ calcular x(P), y(P) con fórmulas de V3
→ value = x(P) × price + y(P)
```

**Complejidad**: Media-alta. Necesitás el tokenId del NFT (configuración única).

**Severidad**: Alta — si el pool amount está mal, todo el hedge está mal.

---

## 5. Punto débil #2: False breakouts

### Fórmula de costo exacta

```
C_false = (V / P_open) × [ |P_open - P_close| + 0.00035 × (P_open + P_close) ]
```

Donde:
- V = pool value en USD
- P_open = precio al abrir hedge (después de debounce)
- P_close = precio al cerrar hedge (después de debounce de retorno)
- 0.00035 = taker fee de Hyperliquid (0.035%)

### Tabla de costos para pool $10,000 ETH/USDC

| Gap entre open y close | PnL del hedge | Fees (round trip) | Total perdido |
|----------------------|-------------|-------------------|--------------|
| $2 (mínimo teórico) | -$11.12 | $7.00 | **$18.12** |
| $5 | -$27.78 | $7.00 | **$34.78** |
| $10 | -$55.71 | $7.00 | **$62.73** |
| $20 | -$111.42 | $7.00 | **$118.42** |

### Costo mínimo posible (fees only)

```
C_min = 2 × V × f = 2 × $10,000 × 0.035% = $7.00
```

### Break-even: cuántos false breakouts aguanta el LP

```
N_max = (V × APR_LP) / C_false
```

| LP APR | Ingreso anual | FB a $18/c.u. | FB a $63/c.u. |
|--------|-------------|----------|----------|
| 10% | $1,000 | 55/año (4.6/mes) | 16/año (1.3/mes) |
| 20% | $2,000 | 110/año (9.2/mes) | 32/año (2.6/mes) |
| 30% | $3,000 | 166/año (13.8/mes) | 48/año (4/mes) |

> **Si el pool tiene más de 3 false breakouts por mes con gap de $10+, necesitás >20% APR solo para cubrir los costos de hedge.**

### Efectividad del cooldown de 5 minutos

| Período de oscilación | Sin cooldown | Con cooldown 5min | Ahorro |
|-----------------------|-------------|-------------------|--------|
| 2 min (whipsaw rápido) | 30 hedges/hr | ~10 hedges/hr | **68%** |
| 5 min | 12 hedges/hr | ~8 hedges/hr | **33%** |
| 10 min | 6 hedges/hr | ~6 hedges/hr | **~0%** |

El cooldown protege contra whipsaws rápidos pero no hace nada contra oscilaciones >10 min.

### Mejoras posibles

- Cooldown dinámico basado en ATR del activo
- Backoff exponencial después de false breakouts consecutivos
- Incrementar debounce count en alta volatilidad

---

## 6. Punto débil #3: Debounce gap (latencia)

### La ventana ciega

```
Tick 1 (t=0s):    precio cruza Pa → pendingState, count = 1
Tick 2 (t=5s):    sigue afuera → count = 2
Tick 3 (t=10s):   sigue afuera → count = 3 → CONFIRMA EXIT
Ejecución (t=12-13s): orden llega a HL
```

**Mínimo 12-13 segundos** entre cruce real y ejecución del hedge.

### Cuánto se mueve ETH en 15 segundos

Con volatilidad anualizada de 70%:

```
σ por tick de 5s = 0.70 × √(5 / 31,557,600) = 0.028%
```

| Escenario | Gap esperado | Costo en pool $10k |
|-----------|-------------|-------------------|
| Mercado calmado | ~$0.87 | ~$5/ciclo |
| Volatilidad normal | ~$2.50 | ~$14/ciclo |
| Breakout fuerte | $5+ | ~$28/ciclo |

### Mejora posible

Con WebSocket directo al nodo (Arbitrum bloques cada ~250ms):
- Debounce = 3 × 0.25s = 0.75s en vez de 15s
- Requiere nodo dedicado o servicio premium (Alchemy Growth+)

---

## 7. Punto débil #4: IL dentro del rango NO cubierto

### El problema

Mientras el precio oscila dentro de [Pa, Pb], el LP sufre IL y el bot no hace nada. Para un pool ETH/USDC $10,000 con rango $1800–$2200:

| Movimiento dentro del rango | IL acumulado |
|---------------------------|-------------|
| ±5% | ~$25 |
| ±10% | ~$100 |
| ±15% | ~$225 |

### Por qué no se puede cubrir rentablemente

El hedge dinámico dentro del rango (gamma hedging) requiere:
1. Rebalancear el perp cada vez que el delta cambia significativamente
2. Cada rebalanceo cuesta 0.035% en fees (taker)
3. Para un pool de $10,000 con rebalanceo cada 4 horas: ~$7/día en fees solo de rebalanceo
4. En 30 días: $210 en fees — comparable al IL que intentás cubrir

**Resultado**: El costo del gamma hedging continuo ≥ el IL que evitás, para posiciones <$100,000.

Referencia académica: Khakhar & Chen (arXiv:2208.03318) modelan delta hedging de V3 LP con perps y encuentran que solo es rentable con posiciones grandes y fees de maker.

### Veredicto

**NO SOLUCIONABLE** de forma rentable con la infraestructura actual. Es el costo fundamental de ser LP en V3 concentrado.

---

## 8. Punto débil #5: Instrumento lineal vs. payoff no-lineal

### El problema teórico

La posición LP tiene gamma negativo (curvatura). Un perpetuo es lineal (delta constante). No existe un hedge perfecto de IL usando solo perpetuos.

```
Residuo no cubierto = ½ × |Gamma| × (ΔP)²
                    = L × (ΔP)² / (4 × P^(3/2))
```

### Alternativas teóricas (y su estado real en 2026)

| Instrumento | Cubriría gamma? | Estado del mercado (marzo 2026) |
|------------|----------------|--------------------------------|
| Opciones (puts/calls en strip, Deribit) | Sí — residuo <2.5 bps | Solo ETH/BTC. Costo: 15-25% APR. Viable para posiciones >$100k |
| Power perpetuals (squeeth) | Sí | **MUERTO** — Opyn cerró nov 2024 (CFTC). Deri Protocol tiene liquidez mínima |
| Rebalanceo continuo del perp | Parcialmente | Gyroscope demostró 134% APY, pero el costo converge al realized variance = IL |
| Protocolos nativos (Panoptic, GammaSwap) | Sí | TVL combinado <$15M. No son viables a escala |
| OrBit Markets (CeFi, opciones exóticas) | Sí | IL Protection Options a 3.6% anualizado. Solo institucional |

### Veredicto

**NO SOLUCIONABLE a bajo costo** con la infraestructura actual. Las opciones en Deribit funcionan pero cuestan 15-25% APR. Los protocolos DeFi nativos tienen liquidez insignificante. El gamma hedging continuo con perps funciona pero no reduce costos — solo los hace más predecibles.

---

## 9. Funding rate: La buena noticia

Hiperliquid cobra funding cada **1 hora** (1/8 del rate de 8h por hora).

**Los shorts reciben funding ~92% del tiempo.** Rate promedio: +0.01% cada 8h.

### Impacto en posición de $10,000

| Duración del hedge | Funding recibido (promedio) | Fees + slippage | **Neto** |
|-------------------|---------------------------|----------------|---------|
| 1 día | +$3 | -$17 | **-$14** |
| 3 días | +$9 | -$17 | **-$8** |
| 7 días | +$21 | -$17 | **+$4** |
| 14 días | +$42 | -$17 | **+$25** |
| 30 días | +$90 | -$17 | **+$73** |

> **Un hedge de 7+ días es gratis o rentable por funding.** Los hedges cortos (false breakouts) son los que cuestan.

### Peor caso (funding negativo sostenido, ~8% del tiempo)

A -0.03% por 8h durante 7 días: -$63 de funding. Más fees: **-$80 total** (0.8% de la posición).

### Datos de referencia por exchange

| Exchange | Settlement | BTC 8h rate promedio | ETH 8h rate promedio |
|----------|-----------|---------------------|---------------------|
| Hyperliquid | Cada 1h | 0.0097% | 0.0131% |
| Binance | Cada 8h | 0.0100% | 0.0100% |
| dYdX | Cada 1h | 0.0095% | 0.0120% |

Fuentes: BitmEX Q3 2025 derivatives report, CoinGlass, Coinalyze.

---

## 10. Resumen de debilidades por severidad

| # | Debilidad | Severidad | ¿Solucionable? | Esfuerzo |
|---|-----------|----------|----------------|----------|
| 1 | **Pool amount manual** (puede estar stale) | Alta | Sí — lectura on-chain del NFT | Medio-alto |
| 2 | **No hedgea IL dentro del rango** | Alta | No — costo prohibitivo | N/A |
| 3 | **False breakouts erosionan rentabilidad** | Alta | Parcial — cooldown dinámico | Medio |
| 4 | **Instrumento lineal vs. payoff no-lineal** | Media | No — limitación de mercado | N/A |
| 5 | **Hedge de posición, no de IL** | Media | Sí — `hedgeRatio` configurable | Bajo |
| 6 | **Debounce gap costoso** | Media | Parcial — WS + RPC dedicado | Bajo-medio |
| 7 | **Funding rate no monitoreado** | Baja | Sí — API de HL disponible | Bajo |
| 8 | **Fees estimadas, no reales** | Baja | Sí — `getUserFills()` de HL | Bajo |
| 9 | **Riesgo de liquidación con leverage alto** | Baja* | Mitigable — leverage bajo + SL | Ya implementado |

*Baja con leverage ≤5x, alta con leverage ≥10x*

---

## 11. Evidencia empírica: qué dicen los backtests

### El dato más relevante: Gyroscope Protocol (2025)

Backtest de 8 meses con ETH/USDC delta-neutral usando perpetuos:

- **134% APY** sobre posición de $1M
- **87% win rate** en ventanas de 30 días
- **73% de horas** con PnL positivo
- Funding rate: efecto neto **negligible** a lo largo de meses
- **Rebalanceo cada 1 hora** (no solo post-exit como nuestro bot)

> **Dato crítico**: No existe ningún estudio publicado que backtestee nuestra estrategia específica (hedge solo post-range-exit). Todos los backtests exitosos usan hedge continuo desde el inicio.

### Otros backtests relevantes

| Estudio | Estrategia | Resultado |
|---------|-----------|-----------|
| TacitvsXI (GitHub) | Hedge 50% con Binance perps, trigger en IL >3% | Superó HODL y LP sin hedge durante rally 19.6x de ETH |
| IDEG/CTH institucional | Grid-based con Binance perps, $1M ETH/USDT | IL <1% si ETH se mueve entre -24.5% y +32.5% |
| Ethena ($14.3B USDe) | Delta-neutral con perps (la mayor implementación viva) | Funding promedio: 16% APY (2021), 0.6% (2022 bear), 9% (2023), 13% (2024) |

### El dato demoledor de Loesch et al.

Análisis de 17,000+ wallets en 17 pools de V3 (mayo-sept 2021):

- **$199.3M en fees ganados** vs **$260.1M en IL** → déficit neto de $60.8M
- **49.5% de LPs tuvieron retornos negativos** vs. simplemente holdear
- Posiciones de <1 semana: IL superó fees por 80%
- Solo pools de activos correlacionados (WBTC/WETH) dieron retorno positivo consistente

---

## 12. Ecosistema de protocolos de IL hedging (estado real, marzo 2026)

| Protocolo | Enfoque | TVL | Estado |
|-----------|---------|-----|--------|
| **Panoptic** | V3 LP = short options, permite comprar "puts protectoras" | ~$6,700 | V1.1 live (Base, Unichain, ETH). Sufrió vulnerabilidad en dic 2024. V2 beta en auditoría. $11.5M de Jane Street, Uniswap Labs, Coinbase |
| **GammaSwap** | Préstamo de LP tokens → payoff inverso ("impermanent gain") | ~$7.6M | Live en Arbitrum, Base, ETH. Yield tokens (60-80% APY backtested) aún no lanzados |
| **Smilee** | IL descompuesto en productos de volatilidad | ~$3.4M | Live en Berachain. Volumen acumulado: $335k. Sistema de epochs limita flexibilidad |
| **Itos Finance** | Two-Sided AMM con "Liquidity Taking" nativo | $0 | **No está live**. Sin auditorías, sin fecha de mainnet |
| **OrBit Markets** (CeFi) | Opciones exóticas de protección IL, premium fijo | N/A | Operativo. Backed por Matrixport + Brevan Howard. Pricing: 3.6% anualizado (V2, 7 días). Usado por MEV Capital ($32M AUM) |

**Conclusión del ecosistema**: TVL combinado de protocolos DeFi de IL hedging < $15M. No son alternativa viable para producción. OrBit Markets es la única solución madura pero es CeFi e institucional.

### Automated liquidity managers (no hedgean IL)

| Protocolo | TVL | Qué hace |
|-----------|-----|----------|
| Arrakis | ~$75M | Optimiza rangos y fee capture |
| Steer Protocol | ~$40M | Rebalanceo automático de rangos |
| Gamma Strategies | ~$10M | Gestión activa de rangos |

Estos reducen exposición a IL via rebalanceo pero **no cubren el riesgo fundamental de gamma**.

---

## 13. Mejoras recomendadas (post-research)

### Mejora 1: Hedge continuo intra-rango (impacto alto)

La evidencia de Gyroscope sugiere que hedgear continuamente desde el inicio (no solo post-exit) produce mejores resultados. Implementación:

```
Cada N minutos:
  delta_actual = x(P) = L × (1/√P - 1/√Pb)
  hedge_actual = posición abierta en HL
  diferencia = delta_actual - hedge_actual
  si |diferencia| > threshold: rebalancear
```

**Costo estimado**: ~$7/día en fees de rebalanceo para pool de $10k (con rebalanceo cada 4-8h). El funding compensa parcialmente.

**Trade-off**: Convierte IL incierto en costos de trading predecibles. No reduce el costo total — lo estabiliza.

**Requiere**: Lectura on-chain de la posición (punto débil #1) o al menos un cálculo teórico de x(P) basado en el rango configurado.

### Mejora 2: Strangle mensual en Deribit para gamma (solo ETH/BTC)

Comprar un OTM strangle mensual cubre el gamma residual:

- **Costo**: 3-5% mensual del nocional
- **Cobertura**: Tail moves que el perp no puede cubrir
- **Limitación**: Solo ETH y BTC tienen opciones líquidas en Deribit
- **Viabilidad**: Solo para posiciones >$50k (por los mínimos de Deribit)

### Mejora 3: `hedgeRatio` configurable (impacto medio, esfuerzo bajo)

Permitir al usuario elegir qué porcentaje de la posición hedgear:

- `1.0` = hedge completo (actual, protección total)
- `0.5` = hedge del IL delta (más eficiente en capital)
- `0.0` = sin hedge (solo monitoreo)

Cambio mínimo en `hedge-calculator.ts`:
```typescript
const sizeInAsset = (poolAmountUsd * hedgeRatio) / currentPrice;
```

### Mejora 4: Monitorear GammaSwap yield tokens y Panoptic V2

Cuando estos protocolos superen $50M TVL, podrían ofrecer gamma hedging nativo más barato que opciones de Deribit. No accionable hoy pero vale rastrear.

---

## 14. Conclusión honesta

### Lo que sí hace bien

- Protege contra movimientos sostenidos fuera del rango (el caso más costoso)
- El funding rate es favorable para shorts (~92% del tiempo recibís, no pagás)
- El debounce + cooldown + backup SL forman un sistema de defensa robusto
- Para un hedge de 7+ días, el costo neto es ~0 o positivo

### Lo que no hace

- No cubre IL dentro del rango (1-4% de pérdida silenciosa)
- No rebalancea dinámicamente (hedge estático, no gamma-neutral)
- El sizing depende de un input manual que puede ser incorrecto

### Cómo se compara con el estado del arte

| Enfoque | Nuestro bot | Gyroscope (mejor backtest) | Teórico óptimo |
|---------|------------|--------------------------|----------------|
| Delta hedge | Solo post-exit | Continuo (cada 1h) | Continuo + opciones |
| Gamma hedge | No | No | Sí (options strip o squeeth) |
| APY reportado | No backtested | 134% | Depende de pool |
| Complejidad | Baja | Media | Alta |
| Costo operativo | ~$7/ciclo | ~$7/día | ~15-25% APR |

### Realidad del mercado

No existe hoy un producto que haga hedge perfecto de IL en V3 de forma rentable para posiciones <$100k. Los protocolos DeFi dedicados tienen <$15M de TVL combinado. Squeeth está muerto. Las opciones en Deribit funcionan pero cuestan 15-25% APR y solo para ETH/BTC. Nuestro enfoque es pragmático: acepta el IL intra-rango como costo y protege contra el escenario catastrófico (salida sostenida del rango).

El dato más accionable del research: **la evolución natural de nuestro bot sería pasar de hedge post-exit a hedge continuo intra-rango**, como hace Gyroscope. Esto requiere calcular delta en tiempo real y rebalancear periódicamente — un cambio de arquitectura significativo pero con evidencia empírica que lo respalda.

### La pregunta clave para el LP

```
¿Fees del LP > IL intra-rango + costos de hedge (false breakouts + fees)?
```

Si la respuesta es sí, la estrategia es rentable. Si no, no hay hedge que salve — el pool simplemente no da suficiente yield.

> "The key risk isn't the hedge itself — it's selecting the wrong pool, the wrong range width, or operating during a prolonged low-volume regime where fees fail to cover even minimal hedging friction."

---

## 15. Conclusiones ejecutivas

### A. Qué es realmente el bot (y qué no es)

El bot es un **seguro de posición post-range-exit**, no un "IL hedger" en sentido matemático. Dentro del rango no protege nada (el LP pierde 1-4% silenciosamente). Fuera del rango, neutraliza la exposición completa y funciona bien. Para el cliente esto puede no importar — quiere proteger su posición y eso sí lo hace. Pero ante revisión técnica (como ya pasó en Telegram), la diferencia queda expuesta. Hay que ser transparentes con la terminología.

### B. El riesgo #1 no es el bot — es la selección de pool

El 49.5% de LPs en V3 pierden plata (Loesch et al., 17,000 wallets). Si el pool no genera suficiente yield, no hay hedge que salve:

```
Si: Fees LP < IL intra-rango + false breakouts + fees de HL → el usuario pierde plata
```

El bot puede funcionar perfectamente y el usuario igual pierde porque eligió mal el pool, un rango demasiado estrecho, o entró en un régimen de bajo volumen. Esto debería estar explícito como disclaimer.

### C. Los false breakouts son el costo operativo dominante

No el funding (favorable), no las fees de HL (bajas). Cada false breakout cuesta $18-63 en un pool de $10k. Con 3+ por mes a $63, necesitás >20% APR solo para empatar. El cooldown de 5min reduce 68% los whipsaws rápidos pero no afecta oscilaciones >10min. Es el punto más accionable de mejora.

### D. No existe backtest publicado de nuestra estrategia exacta

Gyroscope probó hedge continuo (134% APY). Otros probaron hedge con trigger por IL%. Nadie publicó resultados de "hedge solo cuando sale del rango V3". Necesitamos hacer nuestro propio backtest con datos históricos para validar con números, no con teoría.

### E. La evolución natural: hedge continuo intra-rango

Toda la evidencia apunta a que el hedge continuo (rebalanceo cada 1-8h) supera al hedge post-exit. No reduce el costo total (converge al realized variance = IL) pero lo hace predecible. Sería un cambio de arquitectura significativo — el V3 del bot.

### F. No hay competencia real

TVL combinado de protocolos de IL hedging < $15M. Squeeth muerto. Panoptic con $6,700 de TVL. Para posiciones <$100k, nuestro bot es pragmáticamente una de las mejores opciones disponibles hoy — con todas sus limitaciones.

### G. El pool amount manual es la cadena más débil

Todo el hedge depende de un número que el usuario tipea a mano. Si está mal, el hedge está mal (sobre-cobertura = trading direccional, sub-cobertura = protección incompleta). Es el punto más débil y el más factible de resolver con lectura on-chain del NFT.

### H. Roadmap de mejoras por prioridad

| Prioridad | Mejora | Impacto | Esfuerzo | Justificación |
|-----------|--------|---------|----------|---------------|
| 1 | **Backtest propio** con datos históricos | Crítico | Medio | Única forma de validar la estrategia con números reales |
| 2 | **Cooldown dinámico** (ATR + backoff exponencial) | Alto | Medio | Ataca el costo operativo dominante (false breakouts) |
| 3 | **`hedgeRatio` configurable** | Medio | Bajo | Una línea de código, da flexibilidad real al usuario |
| 4 | **Lectura on-chain del pool amount** (NFT Position Manager) | Alto | Medio-alto | Elimina el punto más débil del sistema |
| 5 | **Monitoreo de funding rate** | Bajo | Bajo | Ya es favorable, pero datos reales mejoran transparencia |
| 6 | **Hedge continuo intra-rango** | Alto | Alto | Evolución natural, respaldada por evidencia (Gyroscope) |

---

## 16. ¿Transformar esto en un protocolo?

### Tres modelos posibles

#### Modelo A: Vault hedgeado (tipo Arrakis + perps)

```
Usuario deposita ETH/USDC en un vault
→ El vault provee liquidez en Uniswap V3
→ Un keeper bot (nuestro bot) abre/cierra hedges en HL
→ El usuario recibe fees del LP - costos del hedge
→ Yield neto: LP APR - IL - costos operativos
```

**Es lo más natural.** Básicamente lo que hacen Arrakis/Gamma Strategies (gestión de rangos) pero sumándole el hedge con perps que ninguno hace. La ventaja competitiva es real: nadie ofrece esto hoy.

**Problema**: HL no tiene smart contract wallets — opera con EOAs firmando EIP-712. Opciones:
- Custodiar las claves (centralizado, riesgo regulatorio)
- Firmas delegadas via agent wallets de HL (semi-descentralizado)
- Esperar vaults nativos de HL (en roadmap, sin fecha)

#### Modelo B: IL Insurance on-chain (tipo OrBit Markets descentralizado)

```
LPs compran protección pagando una prima
→ Underwriters depositan colateral y cobran la prima
→ Si IL supera threshold, el LP cobra del pool de underwriters
→ Si no hay IL significativo, underwriters se quedan con la prima
```

**Problema**: necesitás underwriters dispuestos a tomar el otro lado. Con 49.5% de LPs perdiendo plata, el pricing tiene que ser preciso o los underwriters se funden. Lipton/Sepp recién formalizaron el pricing en 2025 — es ciencia nueva.

#### Modelo C: SaaS non-custodial (más realista como primer paso)

```
Usuarios se suscriben
→ Conectan su wallet de HL via agent wallets (non-custodial)
→ Configuran su posición LP
→ Nuestro bot hedgea por ellos
→ Fee de performance (% del IL evitado) o suscripción fija
```

**Lo más fácil de construir** desde donde estamos. No requiere smart contracts. El modelo de negocio es claro. El usuario mantiene custodia de sus fondos.

### Viabilidad según la evidencia

| Factor | A favor | En contra |
|--------|---------|-----------|
| **Mercado** | 49.5% de LPs pierden → demanda real | LPs grandes ya tienen soluciones propias |
| **Competencia** | <$15M TVL combinado, espacio vacío | Puede significar demanda insuficiente |
| **Tecnología** | Core funcionando, testnet verificado | Falta backtest, hedge continuo, lectura on-chain |
| **Funding** | Favorable para shorts (92% positivo) | En bear market puede invertirse |
| **Regulación** | DeFi-native, sin custodia (Modelo C) | HL semi-centralizado, CFTC ya mató Squeeth |
| **Escalabilidad** | Bot escala a N pools/wallets | Cada pool necesita colateral propio en HL |

### Qué falta para ser protocolo

1. **Backtest con datos reales** — sin números no se convence a nadie de depositar
2. **Hedge continuo intra-rango** — el post-exit-only no es competitivo si revisan Gyroscope
3. **Lectura on-chain automática** — un vault necesita saber el valor real, no un input manual
4. **Track record** — meses de operación real con resultados publicados
5. **Auditorías** — obligatorio antes de manejar fondos de terceros

### Camino recomendado

```
Fase 1: Bot self-hosted (HOY)
  → Backtest + mejoras (cooldown, hedgeRatio, on-chain read)
  → Generar track record con operación real

Fase 2: SaaS non-custodial (Modelo C)
  → Agent wallets de HL, multi-usuario
  → Fee de performance o suscripción
  → 6+ meses de datos publicados

Fase 3: Vault protocol (Modelo A)
  → Solo si Fase 2 demuestra rentabilidad consistente
  → Solo si HL lanza infraestructura de vaults o firma delegada madura
  → Auditorías + governance mínimo
```

**Lo que NO hacer**: saltar directo a "protocolo con token de governance" sin datos, sin backtest, sin track record. Panoptic y Smilee hicieron eso y tienen TVL ridículo. El mercado no premia el protocolo — premia los resultados.

### En una oración

**Primero SaaS que funcione y tenga números, después protocolo.** El espacio está vacío, el timing es bueno, pero necesitamos la evidencia que hoy no tenemos.

---

## Referencias

### Papers académicos

- **Uniswap V3 Whitepaper** (Adams et al., 2021) — Ecuaciones 6.29-6.30
- **"Liquidity Math in Uniswap V3"** — Atis Elsts — Derivación completa de fórmulas
- **"Impermanent Loss in Uniswap v3"** — Loesch et al. (arXiv:2111.09192) — IL con factor de leverage, estudio de 17,000 wallets
- **"Delta Hedging Liquidity Positions on AMMs"** — Khakhar & Chen (arXiv:2208.03318) — Algoritmo de delta-hedging con perps
- **"Unified Approach for Hedging IL"** — Lipton, Lucic, Sepp (arXiv:2407.05146, Digital Finance 2025) — Hedging estático y dinámico, referencia a HL/Deribit
- **"Static Replication of IL"** — Deng, Zong, Wang (arXiv:2205.12043, Operations Research Letters) — Replicación con opciones, error <2.5 bps
- **"Super-hedging with variance swaps"** — Fukasawa, Maire, Wunsch (Applied Mathematical Finance, 2025) — Model-free pero instrumentos no tradeables
- **Alexander & Hilling (2023)** — Quantitative Finance — Rebalanceo cada 8h reduce error significativamente
- **Guillaume Lambert** — LP como opciones perpetuas, análisis de gamma (Medium series)

### Backtests y datos empíricos

- **Gyroscope Protocol** (2025) — Delta-neutral E-CLP backtest, 134% APY, 87% win rate 30d
- **TacitvsXI** — GitHub, hedge V2 con Binance perps
- **IDEG/CTH** — Grid-based hedging institucional
- **Ethena USDe** ($14.3B) — Mayor estrategia delta-neutral viva, datos de funding 2021-2024
- **BitmEX Q3 2025** — Derivatives report, funding >92% positivo
- **CoinGlass, Coinalyze** — Datos históricos de funding rates

### Protocolos

- **Panoptic** — panoptic.xyz — V3 LP como opciones
- **GammaSwap** — gammaswap.com — Préstamo de LP tokens
- **Smilee** — smilee.finance — Productos de volatilidad
- **Itos Finance** — itos.fi — Two-Sided AMM (no live)
- **OrBit Markets** — orbitmarkets.io — Opciones exóticas de IL (CeFi)
- **Arrakis, Gamma Strategies, Steer** — Automated liquidity managers (no hedgean IL)
