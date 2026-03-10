# Requerimientos del Proyecto

## Objetivo

Bot de cobertura automática contra impermanent loss para pools de liquidez concentrada (Uniswap V3). Cuando el precio del activo sale del rango en el que se provee liquidez, el bot ejecuta un short en Hyperliquid DEX para compensar la pérdida.

---

## R1. Monitoreo de pools de liquidez

- Monitorear pools en múltiples redes (Arbitrum, Ethereum, Base, Polygon).
- Detectar en tiempo real cuando el precio del activo (ETH, BTC, etc.) sale del rango configurado del pool.
- La menor latencia posible entre la detección y la ejecución. Soporte para nodo dedicado y WebSocket si se dispone.

## R2. Configuración manual de pools

- No es necesario escanear pools on-chain. El usuario configura manualmente cada pool desde el dashboard.
- Campos configurables: red, par de tokens, dirección del pool, rango de precio (inferior y superior), monto del pool, asset a hedgear, apalancamiento.
- Opción para activar o desactivar la protección de cada pool individualmente.
- Redes predeterminadas disponibles en lista desplegable.

## R3. Ejecución de hedge en Hyperliquid

- Cuando el precio sale del rango → abrir short apalancado (x10 o x20) en Hyperliquid por el monto total del pool.
- Cuando el precio vuelve al rango → cerrar el short automáticamente.
- Órdenes de mercado (IOC limit con slippage) para ejecución inmediata.
- Stop-loss de respaldo automático en cada hedge abierto.
- Operación vía API de Hyperliquid usando futuros perpetuos.

## R4. Múltiples wallets — una por pool

- Cada pool debe operar con su propia wallet de Hyperliquid (wallet de protección).
- Motivo: los pools pueden tener rangos y direcciones distintas. Si dos hedges van en direcciones opuestas en la misma wallet, los perpetuos se cancelan entre sí.
- Soporte para N wallets simultáneas.

## R5. Wallet de ganancia (profit)

- Además de la wallet de protección, asociar opcionalmente una segunda wallet global que replique el mismo short.
- Propósito: si el precio no vuelve al rango, la wallet de protección cubre el IL y la wallet de profit genera ganancia neta.
- Una sola wallet de profit compartida entre todos los pools.

## R6. Seguridad de claves privadas

- Las claves privadas de las wallets deben estar encriptadas con un nivel alto de seguridad.
- Vault encriptado con AES-256-GCM y derivación de clave con scrypt.
- Las claves nunca se almacenan en la base de datos — solo en el archivo de vault cifrado.
- Se cargan en memoria al iniciar y se limpian al apagar.

## R7. Dashboard de monitoreo

El dashboard debe mostrar:

- **Ganancia del short**: PnL realizado y no realizado por hedge.
- **Comisiones pagadas**: fees de cada operación de cobertura, desglosadas por pool.
- **Pérdidas por falsas rupturas**: trades que se abren porque el precio sale del rango pero vuelve rápidamente (false breakout → stop-loss o range return).
- **Monto del pool**: configuración actual de cada pool.
- **Saldo de wallets**: cuánta plata tiene cada wallet de cobertura en Hyperliquid, para cargar antes de que se quede sin fondos.
- **Estado del bot**: indicador en tiempo real de si el bot está corriendo o no.
- **Gráficos**: evolución del PnL y del precio del activo.
- **Historial de trades**: lista completa de hedges abiertos y cerrados.

## R8. Detección de falsas rupturas

- Implementar debounce: no abrir hedge inmediatamente al salir del rango, sino esperar confirmación (N lecturas consecutivas fuera de rango).
- Cooldown post-cierre: no reabrir hedge inmediatamente después de cerrar uno por range return.
- Registrar y contabilizar los trades que resultaron ser falsas rupturas.

## R9. Infraestructura y latencia

- El bot debe poder correr en un servidor dedicado (VPS).
- Soporte para nodo RPC dedicado (Alchemy, QuickNode, o nodo propio) para mínima latencia.
- Variables de entorno para configurar endpoints WebSocket por red.
- Containerización con Docker para deploy simple.

---

## Requerimientos no funcionales

| Área | Requerimiento |
|------|---------------|
| Lenguaje | TypeScript (monorepo) |
| Base de datos | Ligera, embebida (SQLite) |
| Dashboard | Web, accesible desde navegador |
| Seguridad | Claves encriptadas, auth en dashboard |
| Resiliencia | Recuperación de crashes, persistencia de estado |
| Alertas | Notificaciones externas (Discord / Telegram) |
| Observabilidad | Logs estructurados, indicador de status |
| Escalabilidad | N pools × N wallets simultáneas |
