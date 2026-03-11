# Pricing del Desarrollo — RangeGuard

Guía para calcular cuánto cobrar por el desarrollo de V1 y V2.

---

## Métricas del proyecto V1 (entregado)

### Volumen de código

| Paquete | Líneas de código | Descripción |
|---------|-----------------|-------------|
| `packages/dashboard` | 5,221 | Frontend Next.js 15, React 19, shadcn/ui, 17 componentes |
| `packages/db` | 2,362 | SQLite, 7 tablas, repositorios, migraciones, tests |
| `packages/hedging-engine` | 1,722 | Cliente Hyperliquid, calculador, executor, SL manager, wallet monitor |
| `packages/pool-monitor` | 800 | Watchers multi-chain, range detector, state machine |
| `packages/common` | 567 | Types, constantes, utilidades (logger, tick-math, retry, webhook) |
| `apps/bot` | 541 | Bootstrap, event bus, config, graceful shutdown |
| `packages/security` | 276 | Vault AES-256-GCM, scrypt KDF, key manager |
| Scripts, config, docs | ~600 | Dockerfile, CI/CD, demo-seed, setup-keys, docs |
| **Total** | **~12,100 LOC** | 125 archivos TypeScript/TSX |

### Complejidad técnica

| Aspecto | Detalle |
|---------|---------|
| **Arquitectura** | Monorepo 7 paquetes, event-driven, strategy pattern |
| **Blockchain** | viem multi-chain (4 redes), WebSocket + polling, Uniswap V3 tick math |
| **DeFi/Trading** | Hyperliquid SDK perpetuos, IOC orders, trigger orders (SL), funding, leverage |
| **Seguridad** | Vault encriptado AES-256-GCM + scrypt, auth middleware, crash recovery |
| **Frontend** | Next.js 15 App Router, 10 páginas, 25+ componentes, TanStack Query, Recharts |
| **Infra** | Docker multi-stage, CI/CD GitHub Actions, Railway deploy, health checks |
| **Testing** | 116 tests Vitest, Vitest workspace, test DB in-memory |
| **Producción** | Auth, alertas Discord/Telegram, liquidation detection, DB cleanup, Docker hardening |

### Requerimientos implementados

| Req | Feature | Complejidad |
|-----|---------|-------------|
| R1 | Pool monitoring multi-chain + WebSocket | Alta |
| R2 | Pool config CRUD + dashboard | Media |
| R3 | Hedge execution (open/close/SL) en Hyperliquid | Muy Alta |
| R4 | Multi-wallet (1 por pool) | Media |
| R5 | Profit wallet (replica trades) | Media |
| R6 | Vault encriptado para private keys | Alta |
| R7 | Dashboard completo (PnL, charts, historial, status) | Alta |
| R8 | Anti-false-breakout (debounce + cooldown) | Media |
| R9 | Docker + CI/CD + VPS-ready | Media |
| Extras | Auth, crash recovery, alertas, liquidation detect, DB cleanup, Docker hardening | Alta |

---

## Estimación de horas invertidas (V1)

### Desglose por fase

| Fase | Horas estimadas | Incluye |
|------|----------------|---------|
| **Diseño de arquitectura** | 15-20 | Definición de paquetes, event bus, strategy pattern, DB schema |
| **packages/common** | 8-10 | Types, constantes de chains/pairs, tick-math, logger, retry utils |
| **packages/security** | 10-15 | Vault AES-256-GCM, scrypt KDF, key manager, CLI setup-keys |
| **packages/db** | 25-30 | Schema, migraciones, 6 repositorios, 34 tests, test utils |
| **packages/pool-monitor** | 25-30 | viem clients, pool watcher, Swap events WS, range detector state machine, 15 tests |
| **packages/hedging-engine** | 40-50 | HL client (SDK integration), calculator, executor, SL manager, wallet monitor, 24 tests |
| **packages/dashboard** | 50-60 | 10 páginas, 25+ componentes, API routes, shadcn/ui setup, charts, auth |
| **apps/bot** | 15-20 | Bootstrap, event wiring, config loader, graceful shutdown, sync |
| **Production hardening** | 20-25 | Auth, crash recovery, SL persistence, alertas, liquidation detect, DB cleanup, Docker hardening |
| **Testing E2E** | 10-15 | Testnet setup, wallets, ciclo completo, debugging SDK, documentación |
| **Infra & DevOps** | 10-15 | Docker multi-stage, CI/CD, Railway config, health checks, env validation |
| **Documentación** | 5-8 | CLAUDE.md, REQUIREMENTS.md, TESTNET_GUIDE.md, PRODUCTION_READINESS.md |
| **Total V1** | **235-300 horas** | |

---

## Cómo calcular el precio

### Opción A: Por hora (time & materials)

| Rate/hora | Total (235-300 hs) | Perfil |
|-----------|--------------------|----|
| $25/hr | $5,875 - $7,500 | Junior crypto dev (Latam) |
| $40/hr | $9,400 - $12,000 | Mid-level full-stack + crypto (Latam) |
| $60/hr | $14,100 - $18,000 | Senior full-stack + crypto (Latam/remoto) |
| $80/hr | $18,800 - $24,000 | Senior especializado DeFi (mercado global) |
| $120/hr | $28,200 - $36,000 | Consultor senior DeFi (mercado US/EU) |

### Opción B: Precio fijo por proyecto

Precio fijo = Horas estimadas × Rate × Multiplicador de riesgo (1.2-1.5x)

| Rate base | Horas × Rate | Con margen 30% | Precio final sugerido |
|-----------|-------------|----------------|----------------------|
| $40/hr | $10,000-12,000 | $13,000-15,600 | **$13,000-16,000** |
| $60/hr | $14,100-18,000 | $18,300-23,400 | **$18,000-23,000** |
| $80/hr | $18,800-24,000 | $24,400-31,200 | **$25,000-30,000** |

### Opción C: Basado en valor (value-based pricing)

En vez de cobrar por hora, cobrar en base al valor que el bot genera:

- Un pool de $100K con IL del 5% = $5,000 de pérdida evitada por evento
- Si el bot previene 10 eventos/año = **$50,000/año de valor para el cliente**
- El desarrollo a $15,000-25,000 se paga solo en 3-6 meses de operación

**Argumento de valor**: "Este bot protege X dólares en liquidez. Sin él, cada movimiento fuerte del mercado puede costar Y% del pool. El desarrollo se paga solo con el primer mes de protección."

---

## Análisis de valor: ¿cuánto vale este bot para el cliente?

### Next Best Alternative (¿qué haría el cliente sin este bot?)

| Alternativa | Costo | Limitaciones |
|---|---|---|
| **Hedgear manualmente** | Gratis (pero requiere estar 24/7 mirando) | Imposible en la práctica. Latencia humana = 30s-5min. Pierde oportunidades de noche. |
| **Usar un servicio de hedging existente** | No existe para esta combinación (Uni V3 + HL) | El nicho Uni V3 concentrada + HL perpetuos no tiene solución comercial conocida |
| **No hedgear (asumir el IL)** | 5-20% del pool por evento en rango estrecho | Con pool de $100K y 5 eventos/año → $25,000-100,000/año en IL sin protección |
| **Contratar a otro dev** | $15,000-40,000 (estimado, ver abajo) | Pocos devs dominan Uni V3 tick math + HL SDK. Tiempo de desarrollo: 2-4 meses. |

**Conclusión**: No hay alternativa directa. El bot es la única opción automatizada para este caso de uso específico.

### Cálculo de ROI para el cliente

```
Supuestos conservadores:
- 10 pools × $20K promedio = $200K de liquidez total
- 6 eventos de range-exit por año (rango medio)
- IL promedio por evento sin hedge: 5% del pool = $1,000 por pool
- IL evitado con hedge: ~80% (el 20% restante es la ventana de detección)

Ahorro anual:  10 pools × 6 eventos × $1,000 × 80% = $48,000/año
Costo del bot: $15,000 (desarrollo) + $3,600/año (operativo a $300/mes)
                                                    ─────────────
ROI primer año: ($48,000 - $15,000 - $3,600) / $18,600 = 158%
ROI año 2+:     ($48,000 - $3,600) / $3,600 = 1,233%
```

> **Nota**: Este cálculo es ilustrativo. El ahorro real depende de la volatilidad del mercado, el ancho de los rangos, y el capital deployado. Pero el orden de magnitud es correcto: el bot se paga con 1-3 eventos de protección exitosa.

### Factores que justifican precio premium

1. **Sin competencia directa**: No existe una solución comercial para hedgear IL de Uni V3 concentrada via HL perpetuos.
2. **Nicho especializado**: DeFi + trading bots = pocos desarrolladores saben hacer esto. No es un CRUD genérico.
3. **Conocimiento de dominio**: Uniswap V3 tick math, Hyperliquid SDK (documentación escasa), perpetuos, funding rates, liquidaciones.
4. **Riesgo financiero**: Bugs en bots de trading = pérdida de dinero real. La calidad del código tiene impacto directo en el capital del cliente.
5. **Seguridad**: Manejo de private keys, vault encriptado, auth. Un error = fondos robados.
6. **Production-ready**: No es un MVP — tiene 116 tests, CI/CD, Docker, alertas, crash recovery, SL persistence.
7. **Full-stack**: Backend (Node.js), blockchain (viem), trading (HL SDK), frontend (Next.js/React), infra (Docker/CI).

---

## Pricing sugerido para V1

### Mercado Latam (Argentina)

| Nivel | Precio | Justificación |
|-------|--------|---------------|
| Piso | **$8,000-10,000** | Rate competitivo (~$35/hr), cliente conocido, posibilidad de V2 |
| Medio | **$13,000-18,000** | Rate justo (~$50-60/hr) para especialización DeFi |
| Premium | **$20,000-25,000** | Value-based, incluye soporte post-entrega |

### Mercado global (US/EU)

| Nivel | Precio | Justificación |
|-------|--------|---------------|
| Piso | **$18,000-22,000** | Rate ~$75/hr, competitivo para crypto |
| Medio | **$25,000-35,000** | Rate $100/hr estándar DeFi |
| Premium | **$40,000-50,000** | Agency rate, incluye garantías y soporte |

---

## Pricing para V2 (nuevas features)

Basado en el presupuesto de `docs/BUDGET.md`:

| Feature | Horas | Rate $50/hr | Rate $70/hr |
|---------|-------|-------------|-------------|
| R10 — Range Trading Bot | 60-80 + margen = 80-100 | $4,000-5,000 | $5,600-7,000 |
| R11 — Costos/historial | 16-24 + margen = 20-30 | $1,000-1,500 | $1,400-2,100 |
| R12 — UI español | 8-12 + margen = 10-16 | $500-800 | $700-1,120 |
| **Total V2** | **110-146 hs** | **$5,500-7,300** | **$7,700-10,220** |

### Paquete completo V1 + V2

| Escenario | V1 | V2 | **Total** |
|-----------|----|----|-----------|
| Latam piso | $10,000 | $5,500 | **$15,500** |
| Latam medio | $15,000 | $7,000 | **$22,000** |
| Global medio | $30,000 | $10,000 | **$40,000** |

---

## Recomendación: qué modelo usar

### Para este proyecto específico (cliente Latam, DeFi, relación existente):

**Modelo recomendado: Precio fijo por fases + mantenimiento mensual opcional**

Razones:
1. **El cliente ya pidió margen** ("calculá de más por las dudas") → acepta precio fijo con buffer
2. **Proyecto ya entregado (V1)** → el cliente conoce la calidad, hay confianza
3. **V2 tiene preguntas abiertas** → mejor cotizar por fases que un precio total que luego cambie
4. **Revenue share es complejo** → requiere auditoría del PnL, genera fricción, no recomendado salvo mucha confianza
5. **Por hora no conviene** → al cliente le genera incertidumbre, a vos te penaliza si sos eficiente

### Propuesta concreta sugerida

```
V1 (entregado):
  Precio: $[elegir rango según relación con el cliente]
  Condición: 50% al entregar, 50% a 30 días

V2 Fase 1 — R12 (español) + R11 (costos/historial):
  Precio: $2,500-4,000
  Plazo: 2-3 semanas
  Pago: 50% al iniciar, 50% al entregar

V2 Fase 2 — R10 (range trading bot):
  Precio: $5,000-8,000 (a definir después de responder preguntas abiertas)
  Plazo: 4-6 semanas
  Pago: 30% al iniciar, 40% al entregar MVP funcional, 30% al aprobar E2E

Mantenimiento (opcional):
  $300-500/mes — bug fixes, actualizaciones de SDK, soporte por WhatsApp/Telegram
  SLA: respuesta en 24h hábiles, fix en 48h para issues críticos

Garantía:
  Bug fixes gratis por 60 días post-entrega de cada fase
```

> **Tip**: Si el cliente duda, usar el argumento de ROI: "Con un pool de $20K, el bot se paga con el primer hedge exitoso. Después, todo es ganancia neta."

---

## Modelos de cobro alternativos

### 1. Precio fijo + mantenimiento mensual
- V1: $12,000-15,000 (una vez)
- Mantenimiento: $500-1,000/mes (soporte, updates, fixes)
- V2 features: cotizar por separado

### 2. Revenue share / porcentaje del PnL
- Desarrollo a precio reducido ($8,000-10,000)
- + 5-10% del PnL positivo generado por el bot mensualmente
- Requiere confianza y transparencia en los reportes

### 3. Licencia + soporte
- V1: $15,000 (licencia perpetua)
- V2: $8,000 (upgrade)
- Soporte: $800/mes (SLA 24h response, fixes prioritarios)

### 4. Por fases con hitos
- Fase 1 (arquitectura + core): 30% al iniciar
- Fase 2 (engine + monitor): 30% al entregar MVP funcional
- Fase 3 (dashboard + producción): 30% al entregar completo
- Fase 4 (testing + deploy): 10% al aprobar E2E

---

## Qué incluir en la propuesta al cliente

1. **Resumen ejecutivo**: Qué hace el bot, por qué lo necesita
2. **Scope detallado**: Lista de features (tabla R1-R9)
3. **Entregables**: Código fuente, documentación, deploy asistido, walkthrough
4. **Métricas de calidad**: 116 tests, 0 errores, Docker, CI/CD
5. **Costos operativos**: Referir a `COSTOS_OPERATIVOS.md`
6. **Precio y condiciones de pago**: Hitos, plazo, qué incluye soporte
7. **Exclusiones**: Qué NO incluye (hosting, RPC, capital para trading, soporte 24/7)
8. **Garantía**: Bug fixes por X meses post-entrega
