export default function AboutPage() {
  return (
    <div className="max-w-2xl space-y-8 text-sm text-muted-foreground leading-relaxed">
      <header>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">RangeGuard</h1>
        <p className="mt-1">
          Cobertura automática de impermanent loss para pools Uniswap V3 usando perpetuos en
          Hyperliquid DEX.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Cómo funciona</h2>
        <p>
          Monitorea pools de Uniswap V3 en Arbitrum, Ethereum, Base y Polygon. Cuando el precio sale
          del rango configurado, abre un{' '}
          <strong className="text-foreground">short apalancado</strong> en Hyperliquid por el monto
          del pool. Cuando vuelve al rango, cierra la posición y registra el PnL.
        </p>
        <p>
          Usa una wallet de protección por pool (evita que shorts se cancelen entre sí) y una wallet
          de ganancia global que replica el short para profit si el precio no vuelve. Stop-loss de
          respaldo automático en cada hedge.
        </p>
      </section>

      {/* --- Seguridad --- */}
      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Seguridad</h2>
        <ul className="space-y-1.5">
          <Li done>
            Vault encriptado con <strong className="text-foreground">AES-256-GCM</strong> +{' '}
            <strong className="text-foreground">scrypt KDF</strong> (N=2¹⁷, r=8, p=1)
          </Li>
          <Li done>Private keys nunca almacenadas en la base de datos</Li>
          <Li done>Keys cargadas en memoria al inicio, borradas al apagar</Li>
          <Li done>Una wallet aislada por pool (aislamiento de riesgo)</Li>
          <Li done>Stop-loss de respaldo automático en cada hedge (crash recovery)</Li>
          <Li done>Órdenes SL persistidas en DB para recuperación ante caídas</Li>
          <Li done>Detección automática de liquidaciones en Hyperliquid</Li>
          <Li done>Auth API key para proteger el dashboard</Li>
        </ul>
      </section>

      {/* --- Funcionalidades implementadas --- */}
      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Implementado</h2>
        <h3 className="text-xs font-medium text-foreground/70 uppercase tracking-wider pt-1">
          Motor de cobertura (v1)
        </h3>
        <ul className="space-y-1.5">
          <Li done>Hedge automático cuando precio sale del rango</Li>
          <Li done>Cierre automático cuando precio vuelve al rango</Li>
          <Li done>Detección de falsas rupturas (debounce 3 confirmaciones + cooldown configurable)</Li>
          <Li done>hedgeRatio configurable por pool (0.1x – 2.0x)</Li>
          <Li done>Cooldown post-cierre configurable por pool</Li>
          <Li done>Multi-chain: Arbitrum, Ethereum, Base, Polygon</Li>
          <Li done>WebSocket para precio real-time (polling como fallback)</Li>
        </ul>

        <h3 className="text-xs font-medium text-foreground/70 uppercase tracking-wider pt-2">
          Trading dentro del rango (v2 — R10)
        </h3>
        <ul className="space-y-1.5">
          <Li done>Bot de mean-reversion dentro del rango del LP</Li>
          <Li done>Detector de zonas de entrada (estado máquina con debounce)</Li>
          <Li done>Trailing stop dinámico con persistencia en DB</Li>
          <Li done>
            Si el precio sale del rango con un trade abierto, el bot cierra el trade
            automáticamente y abre el hedge — la protección del pool siempre tiene prioridad
          </Li>
          <Li done>Wallet compartida entre trading y hedge (bloqueo mutuo, nunca operan al mismo tiempo)</Li>
          <Li done>7 parámetros configurables por pool (leverage, SL%, trailing%, zona de entrada, etc.)</Li>
        </ul>

        <h3 className="text-xs font-medium text-foreground/70 uppercase tracking-wider pt-2">
          Dashboard
        </h3>
        <ul className="space-y-1.5">
          <Li done>Gestión de pools y wallets desde la UI</Li>
          <Li done>Stats globales con PnL realizado y no realizado</Li>
          <Li done>Gráficos de PnL y precio (Recharts)</Li>
          <Li done>Historial de hedges y range trades</Li>
          <Li done>Cierre manual de hedges desde el dashboard</Li>
          <Li done>Indicador de estado del bot en tiempo real</Li>
          <Li done>Costos por pool (trades, PnL, fees, win/loss) — R11</Li>
          <Li done>Limpieza de historial por pool o global — R11</Li>
          <Li done>Interfaz completa en español — R12</Li>
        </ul>

        <h3 className="text-xs font-medium text-foreground/70 uppercase tracking-wider pt-2">
          Backtesting
        </h3>
        <ul className="space-y-1.5">
          <Li done>CLI para backtesting con datos de Binance o CSV</Li>
          <Li done>Métricas: PnL, Sharpe, max drawdown, win rate, curva de equity</Li>
          <Li done>Parameter sweep (hedgeRatio × debounce × cooldown)</Li>
          <Li done>Reportes en markdown con gráfico ASCII</Li>
        </ul>
      </section>

      {/* --- Roadmap --- */}
      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Roadmap</h2>
        <ul className="space-y-1.5">
          <Li>Lectura automática de posiciones LP on-chain</Li>
          <Li>Multi-DEX hedging (dYdX, GMX)</Li>
          <Li>Auto-rebalance del hedge si cambia el monto del pool</Li>
          <Li>Alertas vía webhook (Discord / Telegram)</Li>
          <Li>Panel de métricas avanzadas en el dashboard</Li>
        </ul>
      </section>

      {/* --- Changelog --- */}
      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Changelog</h2>
        <div className="space-y-4">
          <ChangelogEntry version="2.0" date="2026-03-11">
            R10 range trading bot, R11 costos por pool + limpieza de historial, R12 UI en español,
            sistema de backtesting, optimizaciones de performance (parallel wallets, adaptive
            debounce, leverage cache).
          </ChangelogEntry>
          <ChangelogEntry version="1.0" date="2026-03-10">
            Motor de cobertura completo, dashboard con shadcn/ui, vault de seguridad, stop-loss
            manager, detección de liquidaciones. E2E verificado en Hyperliquid testnet.
          </ChangelogEntry>
        </div>
      </section>

      <footer className="border-t border-border pt-6 text-xs text-muted-foreground/60">
        125 tests · 0 errores de typecheck · E2E verificado en HL testnet
      </footer>
    </div>
  );
}

function Li({
  children,
  done,
  partial,
}: {
  children: React.ReactNode;
  done?: boolean;
  partial?: boolean;
}) {
  const marker = done ? '✓' : partial ? '◐' : '·';
  const color = done ? 'text-green-400' : partial ? 'text-yellow-400' : 'text-muted-foreground/50';
  return (
    <li className="flex gap-2">
      <span className={`${color} shrink-0 w-4 text-center`}>{marker}</span>
      <span>{children}</span>
    </li>
  );
}

function ChangelogEntry({
  version,
  date,
  children,
}: {
  version: string;
  date: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 pt-0.5">
        <span className="inline-block bg-muted text-foreground text-xs font-mono px-2 py-0.5 rounded">
          v{version}
        </span>
      </div>
      <div>
        <span className="text-xs text-muted-foreground/60">{date}</span>
        <p className="mt-0.5">{children}</p>
      </div>
    </div>
  );
}
