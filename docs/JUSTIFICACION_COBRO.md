# Justificación de Cobro — RangeGuard

> Documento interno para evaluación de pricing con colega. NO compartir con el cliente.

---

## 1. Desglose de horas por componente

| Componente | Horas estimadas | Notas |
|---|---|---|
| R1 — Monitoreo multi-chain | 40-50h | viem, WebSocket, polling fallback, 4 chains |
| R2 — Config de pools | 20-25h | CRUD completo, dashboard form, validación |
| R3 — Hedge automático | 60-80h | HL SDK, IOC orders, SL backup, PnL tracking, E2E |
| R4 — Multi-wallet | 15-20h | Vault, key manager, per-pool isolation |
| R5 — Wallet de profit | 15-20h | Trade replication, parallel execution |
| R6 — Seguridad | 20-25h | AES-256-GCM, scrypt KDF, key rotation |
| R7 — Dashboard | 60-80h | Next.js 15, 10 páginas, shadcn/ui, gráficos, SSR, API routes |
| R8 — Anti false breakout | 15-20h | State machine, debounce 3x, cooldown configurable |
| R9 — Infraestructura | 20-30h | Docker multi-stage, CI/CD, Railway, health checks |
| Producción (6 features) | 30-40h | Auth, alertas, crash recovery, liquidación, cleanup, hardening |
| R10 — Range trading | 40-50h | Engine, trailing stop, entry detector, mutual exclusion |
| R11 — Costos por pool | 15-20h | Stats queries, cleanup endpoints, UI |
| R12 — Español | 10-15h | ~200 strings, locale formats es-AR |
| Backtest | 20-25h | CLI, Binance loader, analyzer, reporter, parameter sweep |
| Testing | 25-30h | 140 tests across 8 packages (Vitest) |
| **TOTAL** | **385-530 horas** | |

---

## 2. Comparación de mercado

### Tarifas de referencia (freelance senior TypeScript + DeFi)

| Fuente | Rango por hora |
|---|---|
| Toptal / Arc.dev (senior TS) | $100-180/h |
| Freelance DeFi specialist | $120-200/h |
| Precio conservador (senior TS) | $80-100/h |

### Cálculo a precio de mercado

| Escenario | Tarifa | Horas | Total |
|---|---|---|---|
| Piso (tarifa baja, horas mínimas) | $80/h | 385h | **$30,800** |
| Medio | $100/h | 460h | **$46,000** |
| Alto (tarifa DeFi, horas completas) | $150/h | 530h | **$79,500** |

### Descuento implícito

| Precio propuesto | vs. Piso ($30,800) | vs. Medio ($46,000) |
|---|---|---|
| $8,000 | 74% de descuento | 83% de descuento |
| $10,000 | 68% de descuento | 78% de descuento |
| $12,000 | 61% de descuento | 74% de descuento |

**Justificación del descuento:** Uso extensivo de AI-assisted development (Claude Code) redujo significativamente las horas efectivas de trabajo manual. Las horas estimadas reflejan el esfuerzo total (diseño + implementación + testing + debugging + documentación), pero la velocidad de desarrollo fue ~3-5x mayor que sin AI.

---

## 3. ROI para el cliente

### Escenario base

- 10 pools × $20,000 promedio = $200,000 en liquidez
- 5% IL promedio por range-exit × 6 eventos/año = ~$60,000 en IL potencial
- Con hedge: ~80% cubierto = **$48,000 ahorrado por año**

### Costos operativos anuales

| Concepto | Costo anual |
|---|---|
| Hosting (Railway) | $240 |
| Nodo RPC (Alchemy Growth) | $588 |
| Fees HL (~20 ciclos × $14) | $280 |
| Funding rate (neto) | ~$0 (shorts cobran funding) |
| Mantenimiento (si aplica) | $3,600-6,000 |
| **Total sin mantenimiento** | **~$1,100/año** |
| **Total con mantenimiento** | **~$4,700-7,100/año** |

### Payback period

| Precio del proyecto | Payback (sin mantenimiento) | Payback (con mantenimiento) |
|---|---|---|
| $8,000 | ~2 meses | ~3 meses |
| $10,000 | ~2.5 meses | ~4 meses |
| $12,000 | ~3 meses | ~4.5 meses |

**El proyecto se paga en 2-4 meses de operación.** El ahorro anual neto es de $41,000-47,000.

---

## 4. Opciones de pricing sugeridas

### Para discutir con colega

| Opción | Precio | Mantenimiento | Cuándo elegir |
|---|---|---|---|
| **A — Relación** | $8,000 | $300/mes | Cliente con potencial a largo plazo, posibles bots adicionales |
| **B — Punto medio** | $10,000 | $400/mes | Refleja valor entregado, precio justo para ambas partes |
| **C — Ceiling** | $12,000 | $500/mes | Justificable por complejidad DeFi + seguridad + E2E verificado |

### Mantenimiento incluye
- Bug fixes
- Actualizaciones de SDK/dependencias
- Soporte por mensaje
- Hasta 8 horas/mes
- SLA: respuesta 24h, fix 48h para issues críticos

---

## 5. Factores a considerar en la negociación

### A favor de un precio mayor
- El proyecto **ya está terminado** → cero riesgo de scope creep para el cliente
- **E2E verificado** en testnet → evidencia concreta de que funciona
- Seguridad robusta (AES-256-GCM, vault) → no hay shortcuts
- 140 tests → el código es mantenible a largo plazo
- Incluye 3 sistemas: hedge bot + range trading bot + backtesting
- Dashboard completo en español → no es un script, es un producto

### A favor de un precio menor
- El cliente necesita **capital propio** en HL para operar (colateral)
- Es un **primer proyecto** con este cliente → la relación tiene valor
- El mercado crypto/DeFi es volátil → el cliente puede no usar el bot si el mercado baja
- AI-assisted development → el esfuerzo real fue menor al estimado

### Oportunidad futura
- Bots adicionales costarían **~40-50% menos** (infraestructura reutilizable)
- Mantenimiento mensual es ingreso recurrente
- Si funciona bien, el cliente probablemente escale (más pools, más capital)

---

## 6. Recomendación

**Opción B ($10,000)** es el punto más defensible:
- Es ~78% menos que precio de mercado → el cliente está recibiendo un deal excelente
- El ROI es claro: se paga en ~3 meses
- Deja espacio para negociar hasta $8,000 si es necesario
- El mantenimiento a $400/mes es razonable y genera ingreso recurrente

Si el colega sugiere ir más bajo, el piso absoluto debería ser **$8,000** — por debajo de eso no refleja el valor entregado.

---

*Documento preparado: marzo 2026*
