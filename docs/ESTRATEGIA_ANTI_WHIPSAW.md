# Estrategia Anti-Whipsaw

## 1. El Problema

Cuando el precio de un par oscila cerca del borde del rango LP (liquidity pool), el bot detecta falsas salidas y reentradas al rango, ejecutando hedges innecesarios. Cada ciclo de apertura/cierre tiene un costo real:

- **Slippage**: diferencia entre precio esperado y precio de ejecucion (IOC limit con 1% tolerancia)
- **Fees**: 0.035% taker en Hyperliquid por cada operacion (apertura + cierre = 0.07% del nocional)
- **Latencia**: ~2-3s entre deteccion y fill, durante los cuales el precio puede revertir

### Ejemplo real

Un pool ETH/USDC con rango 1800-2200 durante un dia de volatilidad moderada:

| # | Tipo | Precio | Resultado | Costo fees |
|---|------|--------|-----------|------------|
| 1 | Exit + Return | $1798 -> $1805 | False breakout | $0.35 |
| 2 | Exit + Return | $1799 -> $1810 | False breakout | $0.35 |
| 3 | Exit + Return | $1797 -> $1803 | False breakout | $0.35 |
| 4 | Exit + Return | $1795 -> $1808 | False breakout | $0.35 |
| 5 | Exit + Return | $1796 -> $1815 | False breakout | $0.35 |
| 6 | Exit + Return | $1798 -> $1804 | False breakout | $0.35 |
| 7 | Exit + Return | $1794 -> $1812 | False breakout | $0.35 |
| 8 | Exit + Return | $1799 -> $1806 | False breakout | $0.35 |
| 9 | Exit + Return | $1793 -> $1820 | False breakout | $0.35 |
| 10 | Exit + Return | $1797 -> $1809 | False breakout | $0.35 |
| 11 | Exit (real) | $1785 -> sostenido | Hedge real | $0.35 |

**Total**: 11 trades, 10 false breakouts, perdida por PnL: -$7.31, fees: $3.85. La mayoria de las perdidas fueron evitables.

## 2. Parametros Anti-Whipsaw

RangeGuard implementa tres mecanismos complementarios, configurables por pool desde el dashboard.

### 2.1 `rangeBufferPercent` - Buffer de Rango (Histeresis)

**Que hace**: Crea una zona muerta alrededor de los bordes del rango para evitar que oscilaciones minimas disparen transiciones.

**Como funciona**: Aplica un buffer asimetrico segun el estado actual:

- **Para salir del rango** (estado actual: in-range): el precio debe superar el borde en un X% adicional.
  - Borde inferior: `precio < rangeLower * (1 - buffer)`
  - Borde superior: `precio > rangeUpper * (1 + buffer)`
- **Para volver al rango** (estado actual: out-of-range): el precio debe entrar un X% dentro del borde.
  - Retorno: `precio > rangeLower * (1 + buffer) AND precio < rangeUpper * (1 - buffer)`
- **Zona muerta**: si el precio esta entre el borde y el buffer, mantiene el estado actual sin cambios.

**Ejemplo** con rango 1800-2200 y buffer 0.5%:
- Para salir por abajo: precio debe bajar a `1800 * 0.995 = $1791`
- Para volver: precio debe subir a `1800 * 1.005 = $1809`
- Zona muerta: $1791 - $1809 (rango de $18 donde no ocurre ninguna transicion)

| Valor | Efecto |
|-------|--------|
| 0% | Sin buffer, detecta cada tick (maximo whipsaw) |
| 0.2% | Buffer minimo, reduce ruido leve |
| **0.5%** (default) | Buen balance para la mayoria de pools |
| 1.0% | Agresivo, puede perder breakouts reales rapidos |

### 2.2 `debounceCount` - Debounce Ponderado

**Que hace**: Requiere multiples confirmaciones consecutivas antes de ejecutar una transicion de estado. Las confirmaciones se acumulan con peso adaptivo.

**Como funciona**: Cada price update que observa un estado diferente al actual acumula `signalStrength`. Cuando `signalStrength >= debounceCount`, se confirma la transicion. Si un update contradice la tendencia, el contador se reinicia.

Con WebSocket, los price updates llegan cada 2-10 segundos. Con un debounce de 3, una transicion toma minimo 6-30 segundos. Con debounce de 8, toma 16-80 segundos.

**Peso adaptivo** (Adaptive Signal Weight): Las senales se ponderan segun la distancia del precio al borde del rango, como proporcion del ancho del rango:

| Desviacion | Peso | Ticks para debounce=3 | Interpretacion |
|-----------|------|------------------------|----------------|
| > 2% del ancho del rango | 1.5 | ~2 ticks | Senal fuerte: el precio se alejo significativamente |
| 0.5% - 2% | 1.0 | 3 ticks | Senal normal: movimiento moderado |
| < 0.5% | 0.75 | ~4 ticks | Senal debil: precio muy cerca del borde, mas confirmacion |

**Ejemplo**: rango 1800-2200 (ancho = $400), precio en $1790 (10 por debajo = 2.5% del ancho):
- Peso = 1.5 (senal fuerte)
- Con debounce=3: se confirma en ~2 updates

Mismo rango, precio en $1798 ($2 por debajo = 0.5% del ancho):
- Peso = 0.75 (senal debil)
- Con debounce=3: se confirma en ~4 updates

| Valor | Latencia tipica (WS) | Uso |
|-------|----------------------|-----|
| 1-2 | 2-20s | Respuesta muy rapida, alto riesgo de false breakouts |
| **3** (default) | 6-30s | Balance conservador |
| 5-8 (recomendado) | 10-80s | Buena filtracion de ruido |
| 10+ | 20-100s | Muy conservador, puede perder breakouts reales |

### 2.3 `hedgeCooldownSeconds` - Cooldown Post-Cierre

**Que hace**: Despues de que el precio vuelve al rango y se cierra un hedge, impone un periodo de espera antes de permitir un nuevo hedge para ese pool.

**Como funciona**: Cuando ocurre un range return, se registra `cooldownUntil = now + cooldownMs`. Cualquier range exit detectado antes de ese timestamp se ignora (el estado se revierte internamente).

Esto previene el escenario mas costoso: el precio sale, vuelve, sale de nuevo en cuestion de minutos, generando 2-3 ciclos de hedge en rapida sucesion.

| Valor | Uso |
|-------|-----|
| 60s (1min) | Minimo, solo previene rebotes inmediatos |
| **300s** (5min, default) | Balance basico |
| 600s (10min, recomendado) | Buena proteccion contra series rapidas |
| 900s (15min) | Conservador, ideal para pools con fees altos |
| 1800s (30min) | Muy conservador, solo para escenarios de alta volatilidad |

### 2.4 Adaptive Signal Weight (automatico)

Este mecanismo ya esta implementado dentro del debounce (seccion 2.2) y **no es configurable por separado**. Su funcion es que las senales debiles (precio apenas cruzando el borde) necesiten mas confirmaciones que las senales fuertes (precio claramente fuera del rango).

La logica calcula la desviacion del precio respecto al borde mas cercano, como fraccion del ancho total del rango, y asigna un peso de 0.75, 1.0 o 1.5 a cada tick. Esto hace que el debounce sea efectivamente adaptivo sin necesidad de configuracion manual.

## 3. Como Interactuan

Los tres mecanismos forman un pipeline secuencial. Cada precio recibido pasa por todas las etapas:

```
Price Update
    |
    v
[1. Buffer Check] --> Precio en zona muerta? --> IGNORAR (mantener estado actual)
    |
    | (precio fuera de zona muerta)
    v
[2. Signal Weight] --> Calcular peso segun distancia al borde (0.75 / 1.0 / 1.5)
    |
    v
[3. Debounce] --> signalStrength += peso
    |             signalStrength < debounceCount? --> ESPERAR (acumular mas ticks)
    |
    | (signalStrength >= debounceCount)
    v
[4. Cooldown Check] --> Es un range EXIT y estamos en cooldown? --> IGNORAR (revertir estado)
    |
    | (no hay cooldown activo, o es un range RETURN)
    v
[5. Ejecutar Transicion]
    |
    +--> Range Exit: abrir hedge
    +--> Range Return: cerrar hedge + activar cooldown
```

**Nota**: el cooldown solo aplica a range exits (apertura de hedge). Los range returns (cierre de hedge) siempre se ejecutan inmediatamente al pasar el debounce, ya que retrasar el cierre incrementaria la exposicion.

## 4. Configuracion Recomendada

| Parametro | Conservador | Balanceado | Agresivo |
|-----------|-------------|------------|----------|
| `rangeBufferPercent` | 0.8% | 0.5% | 0.2% |
| `debounceCount` | 8 | 5 | 3 |
| `hedgeCooldownSeconds` | 900s (15min) | 600s (10min) | 300s (5min) |
| **Latencia apertura** | ~30-80s | ~15-50s | ~6-30s |
| **False breakouts filtrados** | ~90-95% | ~75-85% | ~50-60% |
| **Riesgo de perder exit real** | Medio | Bajo | Muy bajo |

**Cuando usar cada perfil**:

- **Conservador**: Pools con rangos estrechos, pares de alta volatilidad (ETH/USDC rango < 10%), o cuando el costo por trade es alto relativo al pool.
- **Balanceado**: La mayoria de pools. Buen punto de partida.
- **Agresivo**: Pools grandes donde el costo por trade es despreciable, o rangos amplios donde los false breakouts son raros.

## 5. Ejemplo con Datos Reales

Tomando los 11 trades del ejemplo de la seccion 1, veamos como los filtraria el perfil **Balanceado** (buffer 0.5%, debounce 5, cooldown 600s):

| # | Precio exit | Pasa buffer? (< $1791) | Pasa debounce? | En cooldown? | Resultado |
|---|-------------|------------------------|----------------|--------------|-----------|
| 1 | $1798 | NO ($1798 > $1791) | - | - | FILTRADO por buffer |
| 2 | $1799 | NO | - | - | FILTRADO por buffer |
| 3 | $1797 | NO | - | - | FILTRADO por buffer |
| 4 | $1795 | NO | - | - | FILTRADO por buffer |
| 5 | $1796 | NO | - | - | FILTRADO por buffer |
| 6 | $1798 | NO | - | - | FILTRADO por buffer |
| 7 | $1794 | NO | - | - | FILTRADO por buffer |
| 8 | $1799 | NO | - | - | FILTRADO por buffer |
| 9 | $1793 | NO | - | - | FILTRADO por buffer |
| 10 | $1797 | NO | - | - | FILTRADO por buffer |
| 11 | $1785 | SI ($1785 < $1791) | SI (sostenido) | NO | EJECUTADO |

**Resultado**: 1 trade en vez de 11. Ahorro: ~$10.81 (PnL false breakouts + fees evitados). Solo se ejecuto el hedge real cuando el precio cayo definitivamente a $1785.

En este caso, el buffer solo fue suficiente para filtrar todos los false breakouts porque ninguno supero el $1791. En escenarios donde los false breakouts son mas profundos, el debounce y el cooldown actuan como capas adicionales de proteccion.

## 6. Como Ajustar

### Hay muchos false breakouts (demasiados trades)

1. **Subir `rangeBufferPercent`** a 0.8-1.0%. Esta es la primera linea de defensa y la mas efectiva.
2. **Subir `hedgeCooldownSeconds`** a 600-900s. Evita series rapidas post-cierre.
3. **Subir `debounceCount`** a 6-8. Requiere mas confirmaciones.

### El hedge tarda demasiado en abrirse

1. **Bajar `debounceCount`** a 3. Menos ticks de confirmacion.
2. No bajar `rangeBufferPercent` por debajo de 0.2% — genera demasiado ruido.
3. El cooldown no afecta al primer hedge del dia, solo a hedges consecutivos.

### La volatilidad esta alta (ej. noticias macro, merge)

1. **Subir `rangeBufferPercent`** temporalmente a 1.0%.
2. **Subir `hedgeCooldownSeconds`** a 900-1800s.
3. Considerar pausar el pool desde el dashboard si la volatilidad es extrema.

### La volatilidad esta baja (mercado lateral)

1. **Bajar `rangeBufferPercent`** a 0.2-0.3%.
2. **Bajar `debounceCount`** a 3-4.
3. En mercados muy laterales, el precio rara vez sale del rango, asi que los parametros importan menos.

### Regla general

El costo de un false breakout es fijo (~0.07% del nocional en fees + slippage). El costo de perder un breakout real es variable (depende de cuanto se mueva el precio antes de que el hedge se abra). Ajustar hacia la prevencion de false breakouts cuando:

- El pool es pequeno (fees fijos pesan mas)
- El rango es estrecho (mas probabilidad de whipsaw)
- La frecuencia de trades es alta (> 3/dia)

Ajustar hacia la velocidad de reaccion cuando:

- El pool es grande (fees son despreciables)
- El rango es amplio (breakouts son infrecuentes pero significativos)
- El historico muestra pocos false breakouts
