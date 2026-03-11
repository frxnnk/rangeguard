# Requerimientos V2 — Feedback del Cliente

## Contexto

Devolución del cliente tras ver el demo del bot de hedging (R1–R9) y el dashboard.
El cliente valida el enfoque actual ("práctico y visual") y pide 3 nuevas funcionalidades + 1 aclaración.

---

## Aclaración: Seguridad de claves privadas (R6 — ya implementado)

> "¿Qué encriptado tendría la clave de la billetera privada?"

**Respuesta**: Ya implementado en R6:
- **AES-256-GCM** (cifrado simétrico de grado militar, mismo estándar que usan bancos)
- **scrypt KDF** (N=2¹⁷, r=8, p=1) para derivar la clave de cifrado a partir de un password
- Las claves privadas **nunca** se guardan en la base de datos — solo en un archivo vault cifrado (`~/.trading-bot-cgr/vault.enc`)
- Se cargan a memoria al iniciar el bot y se limpian al apagar
- Cada wallet tiene su propia entrada en el vault

**Acción**: Comunicar esto al cliente en lenguaje simple. No requiere desarrollo adicional.

---

## R10. Bot de Trading dentro del Rango (Range Trading Bot)

### Descripción

Nuevo bot que opera **dentro** del rango del pool de liquidez. A diferencia del bot de hedging (que protege cuando el precio **sale** del rango), este bot **tradea activamente** mientras el precio está **dentro** del rango.

### Lógica de trading

- **Zona baja del rango** (precio cerca del límite inferior) → abrir **long** en Hyperliquid
- **Zona alta del rango** (precio cerca del límite superior) → abrir **short** en Hyperliquid
- El bot busca capturar el movimiento del precio dentro del rango como ganancia adicional al yield del pool

### Parámetros configurables desde el dashboard

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| Stop Loss (SL) | Precio fijo de cierre por pérdida | -2% del entry |
| Trailing Stop (TS) | SL dinámico que sigue al precio cuando va a favor | Trail de 1.5% |
| Apalancamiento | Multiplicador de la posición | x5, x10, x20 |
| Tamaño de posición | Monto a operar por trade | $50, $100 |
| Zona de entrada (%) | Qué porcentaje del rango se considera "zona baja" vs "zona alta" | 25% inferior = long zone, 25% superior = short zone |

### Sub-requerimientos

- **R10.1**: Configuración del bot de trading por pool (separada de la config de hedging). Un pool puede tener hedge + trading, solo hedge, solo trading, o ambos desactivados.
- **R10.2**: Stop Loss fijo — se coloca como orden trigger en HL al abrir la posición. Configurable en % o precio absoluto.
- **R10.3**: Trailing Stop — el bot monitorea el precio y ajusta el SL dinámicamente. Cuando el precio se mueve a favor, el SL se arrastra. Cuando el precio revierte y toca el trailing SL, cierra la posición.
- **R10.4**: Apalancamiento configurable por pool (independiente del apalancamiento del hedge).
- **R10.5**: Reutilizar la misma infraestructura de monitoreo de pools (R1) y wallets (R4). El trading bot puede compartir la wallet del pool o usar una wallet dedicada (a definir).
- **R10.6**: Registro de cada trade en la base de datos con: entry price, exit price, PnL, fees, tipo (long/short), timestamps, motivo de cierre (SL/TS/manual/señal contraria).
- **R10.7**: El dashboard debe mostrar los trades del bot de trading separados de los hedges, con su propio historial y métricas.

### Consideraciones técnicas

- **Wallet compartida vs dedicada**: Si el trading bot usa la misma wallet que el hedge, hay riesgo de que un long del trading cancele un short del hedge. **Recomendación**: wallet dedicada para trading, o bloquear trading cuando hay hedge activo.
- **Trailing stop**: No se puede implementar como orden en HL (HL no soporta trailing stop nativo). El bot debe monitorear el precio continuamente y mover el SL manualmente. Requiere lógica de estado en memoria + persistencia.
- **Señales de entrada**: Definir con más detalle cuándo exactamente se entra. ¿Al cruzar la zona? ¿Con confirmación (debounce)? ¿Una sola posición a la vez o múltiples?

### Preguntas abiertas para el cliente

1. ¿El bot de trading opera con una sola posición a la vez por pool, o puede tener múltiples posiciones abiertas?
2. ¿El trailing stop se mide en % desde el máximo alcanzado, o en valor absoluto?
3. ¿Qué pasa si el precio sale del rango mientras hay una posición de trading abierta? ¿Se cierra automáticamente y entra el hedge?
4. ¿Se usa la misma wallet del pool o una wallet dedicada para trading?
5. ¿Hay un máximo de trades por día o algún cooldown entre operaciones?
6. ¿La zona de entrada (zona baja / zona alta) es configurable o se usa un valor fijo (ej: 25%/25%)?

---

## R11. Costos detallados por Pool + Historial con limpieza manual

### Descripción

Mostrar un desglose completo de costos y trades dentro de cada pool. Los datos se agregan a un historial general que el usuario puede borrar manualmente para liberar espacio.

### Sub-requerimientos

- **R11.1**: Vista de costos por pool — dentro de la página de detalle de cada pool (`/pools/[id]`), agregar una sección que muestre:
  - Total de fees pagados en HL (comisiones de apertura + cierre)
  - Número de trades realizados (hedges + trading)
  - PnL neto del pool (ganancias - pérdidas - fees)
  - Desglose por trade individual: fecha, tipo, entry/exit, PnL, fee

- **R11.2**: Historial general — página `/history` o sección en Overview que consolide todos los trades de todos los pools:
  - Filtrable por pool, por fecha, por tipo (hedge/trading)
  - Totales acumulados: PnL total, fees totales, número de trades
  - Exportable (CSV o similar — opcional)

- **R11.3**: Limpieza manual del historial:
  - Botón para borrar historial de un pool específico
  - Botón para borrar todo el historial general
  - Confirmación antes de borrar ("¿Estás seguro? Esta acción no se puede deshacer")
  - Los datos de config del pool NO se borran, solo el historial de trades

### Datos necesarios

La mayoría de los datos ya existen en las tablas `hedge_trades` y `trade_log`. Lo que falta:
- **Fees reales**: Actualmente se estiman al 0.05% (taker fee de HL). Para datos exactos, se podría llamar a `getUserFills()` de la API de HL. Decisión: ¿estimado o exacto?
- **Agregación por pool**: Queries SQL de agregación (SUM, COUNT, GROUP BY pool_config_id)
- **Endpoint de borrado**: `DELETE /api/history/:poolId` y `DELETE /api/history`

---

## R12. Interfaz en Español

### Descripción

Traducir toda la interfaz del dashboard al español.

### Sub-requerimientos

- **R12.1**: Traducir todos los textos visibles del dashboard:
  - Navegación (sidebar, breadcrumbs)
  - Títulos de páginas y secciones
  - Labels de formularios (pools, wallets, configuración)
  - Mensajes de estado (bot activo, hedge abierto, etc.)
  - Tablas (headers, estados, acciones)
  - Botones y tooltips
  - Mensajes de error y confirmación

- **R12.2**: Decisión de implementación:
  - **Opción A — Solo español**: Reemplazar todos los textos hardcodeados por español. Simple, rápido, sin framework de i18n.
  - **Opción B — i18n con español por defecto**: Usar un framework (next-intl o similar) con archivos de traducción. Permite agregar inglés u otros idiomas en el futuro.
  - **Recomendación**: Opción A si el cliente solo necesita español. Opción B si hay posibilidad de usuarios en inglés.

- **R12.3**: Formatos localizados:
  - Fechas en formato dd/mm/yyyy (no mm/dd/yyyy)
  - Números con separador de miles punto y decimal coma (1.234,56) — o mantener formato americano si el cliente lo prefiere
  - Montos en USD con símbolo $ (universal)

---

## Estimación de Complejidad

| Req | Feature | Complejidad | Estimación relativa | Notas |
|-----|---------|-------------|---------------------|-------|
| R10 | Range Trading Bot | **ALTA** | ~60-70% del esfuerzo del bot original | Nuevo motor de trading completo, trailing stop, state machine, UI de configuración, tests |
| R10.2 | Stop Loss configurable | Media | Incluido en R10 | Similar al SL backup actual pero configurable por UI |
| R10.3 | Trailing Stop | **Alta** | Incluido en R10 | No nativo en HL, requiere monitoreo continuo + persistencia |
| R10.4 | Apalancamiento config | Baja | Incluido en R10 | Ya existe la lógica, solo exponer en UI |
| R11 | Costos por pool + historial | **MEDIA** | ~15-20% del esfuerzo del bot original | Queries SQL, nuevos endpoints API, UI de detalle y listado |
| R11.3 | Limpieza manual | Baja | Incluido en R11 | DELETE endpoints + confirmación UI |
| R12 | UI en español | **MEDIA-BAJA** | ~10-15% del esfuerzo del bot original | Traducción de ~100-150 strings, formateo de fechas/números |

### Resumen de esfuerzo

| Componente | % del total V2 |
|------------|----------------|
| R10 — Range Trading Bot | ~70% |
| R11 — Costos + Historial | ~20% |
| R12 — Español | ~10% |

### Dependencias

```
R10 depende de: R1 (monitoreo), R4 (wallets), R6 (vault)
R11 depende de: R3 + R10 (datos de trades de ambos bots)
R12 independiente (se puede hacer en cualquier momento)
```

### Orden de implementación sugerido

1. **R12** — Español (rápido, el cliente lo ve inmediatamente, mejora percepción)
2. **R11** — Costos por pool (usa datos existentes, mejora el dashboard actual)
3. **R10** — Range Trading Bot (feature grande, requiere más definición con el cliente antes de arrancar)

---

## Notas para presupuesto

- El cliente menciona "calculá de más por las dudas" → incluir margen del 20-30% sobre la estimación.
- El cliente anticipa agregar más bots en el futuro → considerar la arquitectura para que sea extensible (plugin/strategy pattern para distintos tipos de bots).
- R10 es la feature más grande y la que más preguntas abiertas tiene. **Recomendación**: hacer una fase de definición antes de presupuestar el desarrollo completo.
