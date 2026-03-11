# Deploy en Railway

Guia paso a paso para desplegar tu propia instancia del trading bot en [Railway](https://railway.com).

Railway corre el bot y el dashboard en un solo servicio usando el target `combined` del Dockerfile. El script `start-railway.sh` arranca ambos procesos.

---

## Prerequisitos

- Cuenta en [Railway](https://railway.com) (free tier disponible, $5/mes hobby plan recomendado)
- [Railway CLI](https://docs.railway.com/guides/cli) instalado: `npm install -g @railway/cli`
- Repo clonado localmente

---

## 1. Crear proyecto en Railway

```bash
cd trading-bot-cgr
railway login
railway init -n mi-trading-bot
```

Esto crea un proyecto nuevo en tu cuenta de Railway y lo linkea al directorio local.

---

## 2. Configurar variables de entorno

Desde el dashboard de Railway o via CLI:

```bash
# Minimo para precios reales (Nivel 2)
railway variables set RPC_ARBITRUM=https://arb-mainnet.g.alchemy.com/v2/TU_KEY

# Para hedging real en testnet (Nivel 3) — agregar tambien:
railway variables set VAULT_PASSWORD=tu-password-seguro
railway variables set HL_API_URL=https://api.hyperliquid-testnet.xyz
railway variables set WALLET_KEYS=pool-eth-arb:protection:0xTU_PRIVATE_KEY,profit-global:profit:0xTU_PRIVATE_KEY

# Opcional: seedear data de ejemplo en el primer deploy
railway variables set DEMO_SEED=true
```

> **Nota sobre WALLET_KEYS**: En Railway no se puede correr `setup-keys` interactivo. `WALLET_KEYS` permite importar private keys al vault automaticamente en el primer deploy. El script deriva las direcciones ETH y crea las wallets en la DB. Solo se ejecuta si el vault no existe todavia.

### Variables por nivel

| Variable | Nivel 2 (precios) | Nivel 3 (hedging) | Descripcion |
|---|---|---|---|
| `RPC_ARBITRUM` | Requerido | Requerido | URL HTTP del nodo RPC |
| `VAULT_PASSWORD` | - | Requerido | Password del vault de private keys |
| `WALLET_KEYS` | - | Requerido | Private keys en formato `alias:tipo:0xkey,...` |
| `HL_API_URL` | - | Opcional | Default: testnet. Cambiar a `https://api.hyperliquid.xyz` para mainnet |
| `DEMO_SEED` | Opcional | Opcional | `true` para seedear data de ejemplo en el primer deploy |
| `LOG_LEVEL` | Opcional | Opcional | Default: `info`. Usar `debug` para troubleshooting |

---

## 3. Deploy

```bash
railway up
```

Railway detecta el `Dockerfile` y `railway.toml`, buildea el target `combined`, y despliega.

El primer deploy tarda ~3-5 minutos (compilacion de `better-sqlite3` nativo).

---

## 4. Generar dominio publico

```bash
railway domain
```

Esto genera una URL tipo `mi-trading-bot-production.up.railway.app`. El dashboard queda accesible en esa URL.

---

## 5. Verificar

- Abrir el dominio en el browser — deberia cargar el dashboard
- `GET /api/bot-status` — deberia retornar `{ "online": true }` si el bot esta corriendo
- Si seteaste `DEMO_SEED=true`, vas a ver pools y hedges de ejemplo

---

## Auto-deploy desde GitHub (opcional)

1. En el dashboard de Railway, ir a Settings del servicio
2. Conectar el repo de GitHub
3. Seleccionar la branch (`master` o `main`)
4. Cada push a esa branch triggerea un redeploy automatico

---

## Deploy como demo en testnet

Si queres que tu instancia de Railway funcione como demo con hedging real en Hyperliquid testnet:

### 1. Tener wallets fondeadas en HL testnet

Si ya tenes wallets de testnet (de correr `pnpm setup-testnet` localmente), usa esas private keys. Si no, genera nuevas localmente:

```bash
pnpm setup-testnet
# Copiar las private keys que imprime
```

Fondear las wallets en https://app.hyperliquid-testnet.xyz (faucet USDC).

### 2. Configurar Railway

```bash
railway variables set RPC_ARBITRUM=https://arb-mainnet.g.alchemy.com/v2/TU_KEY
railway variables set VAULT_PASSWORD=un-password-seguro
railway variables set HL_API_URL=https://api.hyperliquid-testnet.xyz
railway variables set WALLET_KEYS=pool-eth-arb:protection:0xTU_KEY_PROTECCION,profit-global:profit:0xTU_KEY_PROFIT
```

### 3. Deploy

```bash
railway up
```

En el primer arranque:
1. Se crean las tablas de la DB (migraciones)
2. Se crea el vault encriptado con las private keys
3. Se registran las wallets en la DB con las direcciones derivadas
4. El bot arranca, monitorea precios reales de ETH/USDC on-chain
5. Cuando el precio sale del rango configurado, abre hedge en HL testnet

### 4. Configurar pool desde el dashboard

Abrir el dominio de Railway y crear un pool:
- **Pool address**: `0xC6962004f452bE9203591991D15f6b388e09E8D0` (ETH/USDC 0.05% Arbitrum)
- **Rango**: elegir un rango estrecho cerca del precio actual para que se active rapido en la demo
- **Wallet**: seleccionar `pool-eth-arb`
- **Activar proteccion**: on

El bot empieza a monitorear y hedgear automaticamente.

---

## Notas

### Sobre demo data

- `DEMO_SEED=true` seedea wallets, pools, hedges cerrados y un hedge abierto — util para demos y verificar que todo funciona
- Sin `DEMO_SEED`, se crean solo las tablas vacias — configuras todo desde el dashboard
- El seed solo corre en el primer deploy (si no existe `/app/data/bot.db`). Si queres re-seedear, elimina el volumen desde Railway

### Volumenes

Railway maneja el storage automaticamente. La DB se persiste en `/app/data/bot.db` entre deploys. Si necesitas resetear la DB, elimina el volumen desde el dashboard de Railway.

### Healthcheck

El `railway.toml` configura un healthcheck en `/api/bot-status` con timeout de 60s. Si el bot tarda mas en arrancar, Railway lo reinicia hasta 3 veces.

### Costos

- **Free tier**: 500 horas/mes, suficiente para testing
- **Hobby plan** ($5/mes): sin limites de horas, ideal para correr 24/7
- El bot usa ~100-200MB de RAM y CPU minimo (polling cada 5s)
