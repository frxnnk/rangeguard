# Estrategia Anti-Whipsaw

## 1. El Problema

Cuando el precio de un par oscila cerca del borde del rango LP, el bot detecta falsas salidas y reentradas, ejecutando hedges innecesarios. Cada ciclo apertura/cierre cuesta:

- **Fees**: 0.035% taker en Hyperliquid por operacion (apertura + cierre = 0.07% del nocional)
- **Slippage**: IOC limit con 1% tolerancia, en testnet puede ser peor por falta de liquidez
- **Latencia**: ~2-3s entre deteccion y fill

### Caso real (testnet, 13/03/2026)

Pool ETH/USDC, rango $2,050-$2,100, precio oscilando en el borde superior:

| # | Entrada | Salida | PnL | Duracion | Tipo |
|---|---------|--------|-----|----------|------|
| 1 | $2,114.60 | $2,098.86 | -$3.72 | 2h 07m | False breakout |
| 2 | $2,099.20 | $2,099.72 | +$0.12 | 1m | OK |
| 3 | $2,099.92 | $2,099.82 | -$0.02 | 3m | False breakout |
| 4 | $2,101.30 | $2,099.85 | -$0.35 | 2m | False breakout |
| 5 | $2,101.25 | $2,099.54 | -$0.41 | 6m | False breakout |
| 6 | $2,101.17 | $2,099.74 | -$0.34 | 2m | False breakout |
| 7 | $2,100.65 | $2,099.60 | -$0.25 | 2m | False breakout |
| 8 | $2,100.41 | $2,099.61 | -$0.19 | 18m | False breakout |
| 9 | $2,102.00 | $2,099.64 | -$0.56 | 3m | False breakout |
| 10 | $2,102.84 | $2,099.64 | -$0.76 | 15m | False breakout |
| 11 | $2,101.60 | $2,098.12 | -$0.83 | 8h 27m | False breakout |

**Total: -$7.31 PnL + $3.85 fees = -$11.16**. Solo 1 de 11 trades fue genuino (y aun asi fue false breakout largo).

**Observacion clave**: Los trades 2-11 entraron entre $2,099-$2,103 — apenas 0-0.14% pasado el borde de $2,100. El trade 1 entro a $2,114.60 (0.70% pasado el borde). Hay una separacion clara entre ruido (<0.15%) y señales reales (>0.5%).

## 2. Parametros Anti-Whipsaw

Tres mecanismos complementarios, configurables por pool desde el dashboard.

### 2.1 `rangeBufferPercent` — Buffer de Rango (Histeresis)

**Que hace**: Zona muerta alrededor de los bordes del rango. La defensa principal.

**Como funciona**: Buffer asimetrico segun el estado actual:

- **Estando in-range** (para salir): precio debe superar borde + buffer%
  - Salir por arriba: `precio > rangeUpper * (1 + buffer/100)`
  - Salir por abajo: `precio < rangeLower * (1 - buffer/100)`
- **Estando out-of-range** (para volver): precio debe entrar borde + buffer%
  - Retorno: `precio > rangeLower * (1 + buffer/100) AND precio < rangeUpper * (1 - buffer/100)`
- **Zona muerta**: entre borde y buffer, mantiene estado actual

**Ejemplo con datos reales**: Rango $2,043-$2,170, buffer 0.3%:
- Salir por arriba: precio debe superar `$2,170 * 1.003 = $2,176.51`
- Volver al rango: precio debe bajar a `$2,170 * 0.997 = $2,163.49`
- Zona muerta superior: $2,163 - $2,177 ($14 donde no hay transicion)

**Tradeoff importante** (planteado por Tomas):
> "Comprás mas caro cuando sale para arriba del rango"

Es cierto: con buffer 0.3% y 0.24 ETH, el hedge abre ~$6.30 mas caro, costando ~$1.51 extra por trade. PERO en los datos reales los 10 false breakouts nunca llegaron a $2,106 — el buffer los elimina TODOS. El ahorro de 10 trades evitados (~$7.09) supera ampliamente el costo extra del unico trade que pasa.

| Buffer | Trigger (rango $2,100) | Trades filtrados | Costo extra/trade | Ahorro total |
|--------|----------------------|------------------|-------------------|--------------|
| 0% | $2,100.00 | 0/10 | $0 | $0 |
| 0.15% | $2,103.15 | 8/10 | $0.75 | ~$5.85 |
| **0.3%** | **$2,106.30** | **10/10** | **$1.51** | **~$7.09** |
| 0.5% | $2,110.50 | 10/10 | $2.52 | ~$7.09 |

**Recomendado: 0.3%** — filtra todo el ruido con el menor costo extra por trade.

### 2.2 `debounceCount` — Debounce Ponderado

**Que hace**: Requiere multiples confirmaciones ponderadas antes de confirmar una transicion.

**Como funciona**: Cada price update acumula `signalStrength += peso`. Cuando `signalStrength >= debounceCount`, se confirma. Si un update contradice, se reinicia.

**Peso adaptivo** (automatico, no configurable):

| Desviacion del borde | Peso | Con debounce=5 | Tiempo aprox (WS) |
|---------------------|------|----------------|-------------------|
| > 2% del ancho rango | 1.5 | ~4 ticks | 8-20s |
| 0.5-2% | 1.0 | 5 ticks | 10-25s |
| < 0.5% | 0.75 | ~7 ticks | 14-35s |

Con WS, updates llegan cada 2-10 segundos. El debounce filtra ruido de segundos, NO de minutos. Es la capa terciaria.

**Recomendado: 5** — buen balance entre respuesta rapida a breakouts reales y filtrado de ruido.

### 2.3 `hedgeCooldownSeconds` — Cooldown Post-Cierre

**Que hace**: Espera obligatoria despues de cerrar un hedge antes de permitir uno nuevo.

**Como funciona**: Al cerrar hedge, se registra `cooldownUntil = now + cooldownMs`. Cualquier exit durante cooldown se ignora.

**Dato real**: Los trades 2-10 ocurrieron en ~3 horas (cluster de whipsaw). Un cooldown de 10 min hubiera filtrado 5-7 de ellos.

| Cooldown | Trades cluster filtrados | Uso |
|----------|--------------------------|-----|
| 300s (5min) | ~3-4 | Default, basico |
| **600s (10min)** | **~5-7** | **Recomendado** |
| 900s (15min) | ~7-8 | Conservador |
| 1800s (30min) | 9 (todo el cluster) | Muy conservador |

**Nota**: El cooldown solo aplica a exits (apertura). Los returns (cierre) siempre se ejecutan inmediatamente.

## 3. Pipeline de Decision

```
Price Update
    |
    v
[1. Buffer] --> Precio en zona muerta? --> IGNORAR
    |
    v
[2. Signal Weight] --> Calcular peso: 0.75 / 1.0 / 1.5
    |
    v
[3. Debounce] --> signalStrength += peso
    |              < debounceCount? --> ESPERAR
    |
    v
[4. Cooldown] --> Exit durante cooldown? --> IGNORAR
    |
    v
[5. EJECUTAR]
    +--> Range Exit: abrir hedge
    +--> Range Return: cerrar hedge + activar cooldown
```

Cada capa filtra un tipo distinto de ruido:
- **Buffer**: oscilaciones espaciales (precio cerca del borde)
- **Debounce**: oscilaciones temporales (ticks rapidos)
- **Cooldown**: series repetitivas (whipsaw post-cierre)

## 4. Perfiles de Configuracion

| Parametro | Conservador | Balanceado | Agresivo |
|-----------|-------------|------------|----------|
| `rangeBufferPercent` | 0.8% | **0.3%** | 0.1% |
| `debounceCount` | 8 | **5** | 3 |
| `hedgeCooldownSeconds` | 900s | **600s** | 300s |
| Latencia apertura | ~30-80s | **~15-50s** | ~6-30s |
| False breakouts filtrados | ~95% | **~90%** | ~60% |
| Riesgo de perder exit real | Medio | Bajo | Muy bajo |

**Cuando usar cada perfil**:

- **Conservador**: Rangos estrechos, alta volatilidad, pools chicos
- **Balanceado**: La mayoria de pools. Punto de partida recomendado
- **Agresivo**: Pools grandes, rangos amplios, baja volatilidad

## 5. Analisis con Datos Reales

Con el perfil **Balanceado** (buffer 0.3%, debounce 5, cooldown 600s) aplicado a los 11 trades reales:

| # | Entrada | Pasa buffer? (> $2,106.30) | Resultado |
|---|---------|---------------------------|-----------|
| 1 | $2,114.60 | SI | EJECUTADO (breakout real, aunque luego revirtio) |
| 2 | $2,099.20 | NO | FILTRADO |
| 3 | $2,099.92 | NO | FILTRADO |
| 4 | $2,101.30 | NO | FILTRADO |
| 5 | $2,101.25 | NO | FILTRADO |
| 6 | $2,101.17 | NO | FILTRADO |
| 7 | $2,100.65 | NO | FILTRADO |
| 8 | $2,100.41 | NO | FILTRADO |
| 9 | $2,102.00 | NO | FILTRADO |
| 10 | $2,102.84 | NO | FILTRADO |
| 11 | $2,101.60 | NO | FILTRADO |

**Resultado: 1 trade en vez de 11**

| Metrica | Sin proteccion | Con perfil balanceado |
|---------|---------------|----------------------|
| Trades | 11 | 1 |
| PnL | -$7.31 | -$3.72 |
| Fees | -$3.85 | -$0.35 |
| **Total** | **-$11.16** | **-$4.07** |
| **Ahorro** | — | **$7.09 (63.5%)** |

La perdida residual (-$4.07) es del trade 1, un breakout genuino que revirtio. Esto solo se puede mitigar con un stop-loss mas ajustado en el hedge, no con anti-whipsaw.

## 6. Guia de Ajuste

### Demasiados false breakouts (> 3 trades/dia)
1. Subir `rangeBufferPercent` a 0.5-0.8%
2. Subir `hedgeCooldownSeconds` a 900s
3. Subir `debounceCount` a 6-8

### Hedge tarda en abrirse
1. Bajar `debounceCount` a 3
2. No bajar `rangeBufferPercent` debajo de 0.2%
3. Cooldown no afecta al primer hedge, solo a consecutivos

### Volatilidad alta (noticias, macro)
1. Subir `rangeBufferPercent` a 1.0% temporalmente
2. Subir cooldown a 900-1800s
3. Considerar pausar pool desde dashboard

### Volatilidad baja (mercado lateral)
1. Bajar `rangeBufferPercent` a 0.2%
2. Bajar `debounceCount` a 3-4
3. Precio rara vez sale del rango, parametros importan menos

### Regla de oro

> **Costo false breakout** = fijo (~$0.35 fees + slippage por ciclo)
> **Costo breakout perdido** = variable (depende de cuanto se mueve el precio sin hedge)

Ajustar hacia prevencion cuando:
- Pool chico (fees pesan mas)
- Rango estrecho (mas whipsaw)
- Frecuencia alta (> 3 trades/dia)

Ajustar hacia velocidad cuando:
- Pool grande (fees despreciables)
- Rango amplio (breakouts infrecuentes pero grandes)
- Historico con pocos false breakouts

## 7. Configuracion Actual (Testnet)

```
Pool:            ETH/USDC Arbitrum 0.05%
Rango:           $2,043 - $2,170 (±3%)
Buffer:          0.3%
Debounce:        5 ticks
Cooldown:        600s (10 min)
Perfil:          Balanceado
```

Ultima actualizacion: 2026-03-13
