# Guia E2E: Testing en Hyperliquid Testnet

Guia paso a paso para probar el ciclo completo de hedging en Hyperliquid testnet. Probado y verificado el 2026-03-10.

---

## Resumen del flujo

```
1. Setup: generar wallets → vault → DB
2. Fondear wallets en HL testnet
3. Arrancar bot + dashboard
4. Bot detecta precio fuera de rango → abre hedge (short/long)
5. Precio vuelve al rango → bot cierra hedge → registra PnL
```

---

## Prerequisitos

| Herramienta      | Version | Para que                                          |
| ---------------- | ------- | ------------------------------------------------- |
| Node.js          | 22+     | Runtime (usa `import.meta.dirname`)               |
| pnpm             | 9+      | Package manager del monorepo                      |
| Rabby o MetaMask | -       | Importar private keys, firmar transacciones en HL |
| ETH en Arbitrum  | ~$2     | Gas para depositar USDC en HL mainnet             |

> **Importante**: Hyperliquid testnet requiere un deposito en **mainnet** antes de poder reclamar mock USDC del faucet. Necesitas ETH en Arbitrum L2 para pagar gas.

---

## Paso 1: Instalar y configurar

```bash
git clone https://github.com/frxnnk/trading-bot-cgr.git
cd trading-bot-cgr
pnpm install
```

Crear el archivo `.env` en la raiz del monorepo:

```bash
cp .env.example .env
```

Editar `.env` con estos valores minimos:

```env
# Password para el vault (elegir algo seguro)
VAULT_PASSWORD=<choose-a-strong-password>

# RPC de Arbitrum (el publico funciona bien para testing)
RPC_ARBITRUM=https://arb1.arbitrum.io/rpc

# Hyperliquid testnet (estos son los defaults)
HL_API_URL=https://api.hyperliquid-testnet.xyz
HL_WS_URL=wss://api.hyperliquid-testnet.xyz/ws
```

---

## Paso 2: Generar wallets y seedear la DB

```bash
pnpm setup-testnet
```

Este script:

1. Genera 2 pares de claves secp256k1 (protection + profit)
2. Encripta las private keys en el vault (`~/.trading-bot-cgr/vault.enc`)
3. Crea las wallets en la DB con sus addresses reales
4. Crea un pool ETH/USDC Arbitrum de prueba

**Salida esperada:**

```
=== Trading Bot Testnet Setup ===

Storing private keys in vault...
  -> pool-eth-arb -> 0x769b...
  -> profit-global -> 0xc091...

Vault contains 2 keys: pool-eth-arb, profit-global

Seeding database...
  -> Wallets created in DB
  -> Pool config created

=== Setup Complete ===

Wallets generated (SAVE THESE - needed to fund on HL testnet):
======================================================================
  pool-eth-arb (protection)
    Address:     0x769b1202df5275cf15365108bddba4754eb83847
    Private Key: 0x<TESTNET_PRIVATE_KEY_REDACTED>

  profit-global (profit)
    Address:     0xc09107ac7fc4e35d297bc920d2f18a3720fb0c66
    Private Key: 0x<TESTNET_PRIVATE_KEY_REDACTED>
======================================================================
```

> **IMPORTANTE**: Copiar las private keys. Las necesitas para importar en Rabby/MetaMask y para fondear en HL testnet.

---

## Paso 3: Importar wallet en Rabby/MetaMask

1. Abrir Rabby (o MetaMask)
2. Agregar cuenta → Importar Private Key
3. Pegar la private key de `pool-eth-arb` (sin el prefijo `0x` si Rabby lo rechaza)
4. Verificar que la address coincide con la que mostro el script

> Solo necesitas importar `pool-eth-arb` (la wallet de proteccion). La wallet de profit es opcional para testing.

---

## Paso 4: Fondear la wallet en Hyperliquid testnet

### 4.1: Depositar en HL mainnet primero

Hyperliquid testnet requiere que la wallet exista en mainnet antes de poder reclamar mock USDC.

1. Ir a https://app.hyperliquid.xyz
2. Conectar la wallet `pool-eth-arb` via Rabby/MetaMask
3. Cambiar a red **Arbitrum** en tu wallet
4. Depositar **minimo 5 USDC** desde Arbitrum
   - Necesitas USDC (ERC-20) en Arbitrum
   - Necesitas ETH en Arbitrum para gas (~$0.10)
5. Confirmar la transaccion

> **Nota**: Si no tenes USDC en Arbitrum, podes enviar ETH a Arbitrum via bridge y swapear a USDC en un DEX (Uniswap, 1inch).

### 4.2: Reclamar mock USDC en testnet

1. Ir a https://app.hyperliquid-testnet.xyz
2. Conectar la misma wallet
3. Click en **"Click to claim drip"** (da 1000 mock USDC)
4. Los fondos aparecen en la seccion Spot

### 4.3: Transferir fondos a Perps

En testnet con "Unified Accounts", los fondos estan en Spot. Para operar perpetuos:

1. En la pagina de testnet, ir a **Portfolio** → **Balances**
2. Click en **"Transfer"** junto a USDC
3. Transferir de **Spot → Perps** el monto deseado (ej: 100 USDC)

> **Alternativa**: Si la UI muestra "Unified" mode, los fondos de Spot se comparten automaticamente con Perps. El bot detecta esto y usa el balance de Spot como fallback.

### 4.4: Habilitar trading (si es necesario)

Si es la primera vez usando la wallet en HL:

1. Ir a https://app.hyperliquid-testnet.xyz/trade/ETH
2. Intentar colocar una orden minima
3. Firmar la transaccion de "Enable Trading" que aparece

---

## Paso 5: Configurar el pool para testing

El script `setup-testnet` crea un pool con rango 2000-2500. Para forzar un test inmediato, podes ajustar el rango para que el precio actual este fuera:

```bash
# Ver precio actual de ETH/USDC
# (el bot lo muestra en los logs, o mirar en https://app.hyperliquid-testnet.xyz/trade/ETH)

# Si ETH esta a ~$2070, setear rango arriba del precio para forzar "out-of-range-below":
node --no-warnings --import tsx -e "
import { getDatabase, closeDatabase } from './packages/db/src/connection.js';
import { resolve } from 'path';
const db = getDatabase(resolve('data', 'bot.db'));
db.prepare('UPDATE pool_configs SET range_lower = 2200, range_upper = 2600, pool_amount = ?').run('20');
console.log('Pool range set to 2200-2600, pool_amount=20 USD');
closeDatabase();
"
```

> **pool_amount**: Con 20 USD y leverage 5x, el margen requerido es ~$4. Ajustar segun los fondos disponibles.

---

## Paso 6: Arrancar el bot

```bash
# Terminal 1: Bot
pnpm dev:bot

# Terminal 2: Dashboard (opcional pero recomendado)
pnpm dev:dashboard
```

### Logs esperados al arrancar

```
INFO (bot): Starting Trading Bot...
INFO (bot): Database initialized
INFO (key-manager): Loaded keys into memory  count=2
INFO (hl-client): Wallet client initialized  alias="pool-eth-arb" address="0x769b..."
INFO (hl-client): Wallet client initialized  alias="profit-global" address="0xc091..."
INFO (range-detector): Pool registered for range detection
INFO (pool-watcher): Polling started  intervalMs=5000
INFO (bot): Active pools loaded  count=1
INFO (bot): Bot is running. Press Ctrl+C to stop.
```

---

## Paso 7: Observar apertura de hedge

Con el rango en 2200-2600 y ETH a ~$2070, el bot:

1. **Polls slot0** cada 5s del pool Uniswap V3
2. **Debounce**: 3 polls consecutivos fuera de rango (~15s)
3. **Transicion confirmada**: `in-range → out-of-range-below`
4. **HedgeCalculator**: `size = poolAmount / price = 20 / 2070 = 0.0097 ETH`
5. **Ordena short** en HL testnet con 5x leverage
6. **Stop-loss** de backup colocado automaticamente

### Logs esperados

```
INFO (range-detector): Range state transition  from="in-range" to="out-of-range-below" price=2071.74
INFO (hl-client): Leverage set  asset="ETH" leverage=5
INFO (hl-client): Order filled  side="short" size="0.0097" avgPrice="2062.9" latencyMs=2400
INFO (position-tracker): Hedge trade opened  side="short" size="0.0097"
INFO (stop-loss): Backup SL placed  triggerPrice="2244" orderId=344653409100
INFO (bot): Hedge opened event  walletType="protection" side="short" size="0.0097"
```

### Verificar en HL testnet

1. Ir a https://app.hyperliquid-testnet.xyz/trade/ETH
2. Deberia verse la posicion short en la seccion **Positions**
3. En **Orders** deberia verse el stop-loss trigger order

---

## Paso 8: Forzar cierre del hedge (range return)

Para probar el cierre sin esperar que el precio suba a $2200+, cambiar el rango en la DB para que incluya el precio actual:

```bash
# Si ETH esta a ~$2070, poner rango 2000-2200
node --no-warnings --import tsx -e "
import { getDatabase, closeDatabase } from './packages/db/src/connection.js';
import { resolve } from 'path';
const db = getDatabase(resolve('data', 'bot.db'));
db.prepare('UPDATE pool_configs SET range_lower = 2000, range_upper = 2200').run();
console.log('Pool range updated to 2000-2200');
closeDatabase();
"
```

> **Alternativa**: Editar el rango desde el dashboard en `/pools/:id/edit`.

El bot detecta el cambio en ~30s (`syncPools` corre cada 30s). Despues necesita 3 polls mas (~15s) para confirmar la transicion.

### Logs esperados

```
INFO (bot): Range parameters updated from DB  rangeLower=2000 rangeUpper=2200
INFO (range-detector): Range state transition  from="out-of-range-below" to="in-range" price=2072.34
INFO (stop-loss): Primary SL triggered: range return detected
INFO (order-executor): Closing protection hedge  asset="ETH"
INFO (bot): Hedge closed event  pnl="-0.09" closeReason="range_return"
INFO (position-tracker): Hedge trade closed  realizedPnl="-0.09" isFalseBreakout=true
INFO (engine): All hedges closed on range return  closedCount=1
```

### Verificar en DB

```bash
node --no-warnings --import tsx -e "
import { getDatabase, closeDatabase } from './packages/db/src/connection.js';
import { resolve } from 'path';
const db = getDatabase(resolve('data', 'bot.db'));

const hedge = db.prepare('SELECT side, size, entry_price, exit_price, realized_pnl, status, close_reason FROM hedge_trades ORDER BY closed_at DESC LIMIT 1').get();
console.log('Last closed hedge:', hedge);

closeDatabase();
"
```

Salida esperada:

```json
{
  "side": "short",
  "size": "0.0097",
  "entry_price": "2062.9",
  "exit_price": "2072.34",
  "realized_pnl": "-0.09",
  "status": "closed",
  "close_reason": "range_return"
}
```

---

## Paso 9: Restaurar el pool y repetir

Despues de probar, restaurar un rango razonable:

```bash
node --no-warnings --import tsx -e "
import { getDatabase, closeDatabase } from './packages/db/src/connection.js';
import { resolve } from 'path';
const db = getDatabase(resolve('data', 'bot.db'));
db.prepare('UPDATE pool_configs SET range_lower = 2000, range_upper = 2500, status = ?').run('in-range');
console.log('Pool range restored to 2000-2500');
closeDatabase();
"
```

Para repetir el ciclo, el bot detectara automaticamente la siguiente salida de rango.

---

## Troubleshooting

### "User or API Wallet 0x... does not exist"

La wallet no existe en Hyperliquid. Soluciones:

- Ir a https://app.hyperliquid-testnet.xyz con la wallet conectada
- Hacer un deposito (aunque sea 5 USDC) en mainnet primero
- Reclamar el drip en testnet

### "Insufficient margin to place order"

No hay suficiente margen para el hedge. Soluciones:

- Reducir `pool_amount` en la DB (ej: 20 USD con 5x leverage requiere ~$4 de margen)
- Transferir mas USDC de Spot a Perps
- Verificar el balance en la UI de HL testnet

### "Already has open hedge, skipping"

El bot ya tiene un hedge abierto para ese pool. No abre duplicados. Soluciones:

- Esperar el range-return automatico
- Cerrar manualmente desde el dashboard (`/hedges` → Close)
- Limpiar hedges huerfanos en DB:
  ```sql
  DELETE FROM hedge_trades WHERE status = 'open';
  ```

### "No VAULT_PASSWORD set"

El bot no encuentra el archivo `.env`. Verificar:

- Que `.env` existe en la raiz del monorepo (no en `apps/bot/`)
- Que `VAULT_PASSWORD` esta seteado en `.env`

### "No key found in vault for wallet"

La wallet existe en DB pero no en el vault. Soluciones:

- Correr `pnpm setup-testnet` de nuevo (regenera todo)
- O agregar la key manualmente: `pnpm setup-keys`

### El bot no detecta el cambio de rango

El `syncPools` corre cada 30s. Esperar hasta 30s despues de editar la DB. Logs a buscar:

```
INFO (bot): Range parameters updated from DB
```

### Gas insuficiente para depositar en HL

Necesitas ETH en **Arbitrum L2**, no en Ethereum mainnet. Opciones:

- Bridge ETH desde mainnet: https://bridge.arbitrum.io
- Comprar ETH directamente en Arbitrum via exchange

### El precio no se actualiza

1. Verificar que `RPC_ARBITRUM` esta seteado en `.env`
2. El RPC publico (`arb1.arbitrum.io/rpc`) funciona pero puede tener rate limits
3. Para mejor experiencia, usar un API key gratuito de [Alchemy](https://www.alchemy.com) o [Infura](https://www.infura.io)

---

## Anatomia de un ciclo E2E completo

```
Tiempo  Evento                                              Donde verificar
─────   ──────                                              ────────────────
 0s     Bot arranca, carga vault (2 keys), registra pool    Logs: "Bot is running"
 5s     Primer poll de precio (slot0)                       Logs: "Price update"
15s     3 polls fuera de rango → transicion confirmada      Logs: "Range state transition"
15s     HedgeCalculator calcula size                        Logs: implícito
16s     Leverage seteado en HL (5x cross)                   Logs: "Leverage set"
18s     IOC order filled (short/long)                       Logs: "Order filled"
18s     Hedge registrado en DB                              DB: hedge_trades.status = 'open'
19s     Stop-loss de backup colocado                        Logs: "Backup SL placed"
19s     Evento hedge-opened emitido                         Dashboard: /hedges
 ...    (precio vuelve al rango)
 +0s    syncPools detecta cambio de rango                   Logs: "Range parameters updated"
+15s    3 polls in-range → transicion confirmada            Logs: "Range state transition"
+15s    SL cancelado + posicion cerrada en HL               Logs: "Closing protection hedge"
+17s    PnL calculado, hedge marcado closed en DB           DB: hedge_trades.status = 'closed'
+17s    Evento hedge-closed emitido                         Dashboard: /history
```

---

## Verificaciones post-test

```bash
# 1. Ver hedge cerrado en DB
node --no-warnings --import tsx -e "
import { getDatabase, closeDatabase } from './packages/db/src/connection.js';
import { resolve } from 'path';
const db = getDatabase(resolve('data', 'bot.db'));
const h = db.prepare('SELECT * FROM hedge_trades ORDER BY closed_at DESC LIMIT 1').get();
console.log(JSON.stringify(h, null, 2));
closeDatabase();
"

# 2. Ver trade log (audit trail de requests a HL)
node --no-warnings --import tsx -e "
import { getDatabase, closeDatabase } from './packages/db/src/connection.js';
import { resolve } from 'path';
const db = getDatabase(resolve('data', 'bot.db'));
const trades = db.prepare('SELECT action, success, latency_ms FROM trade_log ORDER BY created_at DESC LIMIT 5').all();
console.table(trades);
closeDatabase();
"

# 3. Verificar que no quedan posiciones abiertas en HL testnet
# Ir a https://app.hyperliquid-testnet.xyz → Portfolio → Positions
```

---

## Tips para testing efectivo

1. **pool_amount bajo**: Usar 20-50 USD para minimizar margen necesario
2. **Rango estrecho**: Un rango donde el precio actual este justo en el borde permite testing rapido
3. **Logs en debug**: Setear `LOG_LEVEL=debug` en `.env` para ver el debounce acumulando
4. **Dashboard simultaneo**: `pnpm dev:dashboard` en otra terminal para ver cambios en tiempo real
5. **Reset rapido**: Para empezar de cero, borrar `data/bot.db` y correr `pnpm setup-testnet` de nuevo
6. **Wallet de profit**: Es opcional. El bot funciona sin ella (muestra warning pero continua)
