# Preguntas para el cliente — Bot de Trading dentro del Rango (R10)

Necesitamos definir estos puntos antes de cerrar el desarrollo. Mientras tanto arrancamos con defaults razonables que se ajustan después.

---

## 1. ¿Una posición a la vez o múltiples?

Cuando el precio está en la zona baja del rango y el bot abre un long, ¿puede abrir otro long si el precio baja más? ¿O solo opera con una posición abierta por pool?

**Opciones:**
- A) Una sola posición por pool (más simple, menos riesgo)
- B) Múltiples posiciones (tipo grid, más complejo)

**Default si no contesta:** Opción A — una sola posición a la vez.

---

## 2. ¿Trailing stop en porcentaje o valor fijo?

Cuando el precio se mueve a favor y el trailing stop se arrastra, ¿cómo se mide la distancia?

**Opciones:**
- A) Porcentaje desde el máximo alcanzado (ej: 1.5% de trail)
- B) Valor fijo en USD (ej: $30 de trail)
- C) Ambos configurables, el usuario elige

**Default si no contesta:** Opción A — porcentaje.

---

## 3. ¿Qué pasa si el precio sale del rango con una posición de trading abierta?

Ejemplo: el bot tiene un long abierto en la zona baja, y el precio rompe el rango hacia abajo. Ahí el bot de hedge quiere abrir un short.

**Opciones:**
- A) Se cierra automáticamente la posición de trading y entra el hedge
- B) Conviven ambas posiciones (requiere wallets separadas)
- C) El trading se pausa cuando hay hedge activo

**Default si no contesta:** Opción A — se cierra el trade y entra el hedge.

---

## 4. ¿Wallet compartida o wallet dedicada para el bot de trading?

Si el trading usa la misma wallet que el hedge, un long del trading puede cancelar un short del hedge (los perpetuos se netean en la misma wallet).

**Opciones:**
- A) Wallet dedicada para trading (requiere fondear una wallet extra por pool)
- B) Wallet compartida, pero el bot nunca opera ambos al mismo tiempo
- C) Wallet compartida sin restricciones (riesgo de cancelación)

**Default si no contesta:** Opción B — wallet compartida con bloqueo mutuo.

---

## 5. ¿Hay un límite de trades por día o cooldown entre operaciones?

Para evitar que el bot haga muchas operaciones chicas donde las comisiones se comen la ganancia.

**Opciones:**
- A) Sin límite, el bot opera cada vez que detecta una zona de entrada
- B) Cooldown configurable entre trades (ej: esperar 5 minutos después de cerrar)
- C) Máximo de trades por día (ej: máximo 10 trades/día)
- D) Cooldown + máximo combinado

**Default si no contesta:** Opción B — cooldown configurable, default 5 minutos.

---

## 6. ¿La zona de entrada es configurable?

El rango del pool se divide en zonas. ¿El usuario puede configurar qué porcentaje del rango es "zona baja" (para abrir longs) y "zona alta" (para abrir shorts)?

**Ejemplo con rango $2000-$2500:**
- Zona baja 25% = $2000-$2125 → abre long
- Zona alta 25% = $2375-$2500 → abre short
- Zona media 50% = no opera

**Opciones:**
- A) Configurable por pool (el usuario elige el %)
- B) Fijo al 25%/25%
- C) El usuario define precios exactos de entrada (no porcentaje del rango)

**Default si no contesta:** Opción A — configurable, default 25%.
