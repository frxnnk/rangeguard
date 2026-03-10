export default function AboutPage() {
  return (
    <div className="max-w-2xl space-y-8 text-sm text-muted-foreground leading-relaxed">
      <header>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">trading-bot-cgr</h1>
        <p className="mt-1">
          Cobertura automática de impermanent loss para Uniswap V3 via Hyperliquid.
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

      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Quick start</h2>
        <pre className="bg-muted rounded-lg p-4 text-xs font-mono text-foreground overflow-x-auto">
          {`git clone <repo> && cd trading-bot-cgr
pnpm install
pnpm testnet-seed        # datos de prueba
pnpm setup-keys          # vault encriptado + claves
pnpm dev:dashboard       # localhost:3000
pnpm dev:bot             # arrancar bot`}
        </pre>
        <p>
          Después: Wallets → agregar wallets, Pools → Add Pool (red, par, rango, monto, leverage,
          wallet), activar toggle de protección, listo.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Arquitectura</h2>
        <pre className="bg-muted rounded-lg p-4 text-xs font-mono text-foreground overflow-x-auto">
          {`apps/bot               bootstrap, event bus, shutdown
packages/pool-monitor  precio on-chain via viem (WS + polling)
packages/hedging-engine  HL SDK, calculador, executor, SL manager
packages/dashboard     Next.js 15, shadcn/ui, monitoreo
packages/db            SQLite WAL, 6 tablas, repos
packages/security      vault AES-256-GCM para private keys
packages/common        types, constantes, utils`}
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Features</h2>
        <ul className="space-y-1.5">
          <Li done>Hedge automático cuando precio sale del rango</Li>
          <Li done>Config manual de pools desde el dashboard</Li>
          <Li done>Multi-wallet (1 protección por pool + 1 profit global)</Li>
          <Li done>Vault encriptado (AES-256-GCM + scrypt KDF)</Li>
          <Li done>Dashboard con stats, gráficos, historial de trades</Li>
          <Li done>Stop-loss de respaldo automático en HL</Li>
          <Li done>Detección de falsas rupturas (debounce + cooldown)</Li>
          <Li done>SL orders persistidas en DB (crash recovery)</Li>
          <Li done>Detección automática de liquidaciones en HL</Li>
          <Li done>DB cleanup automático (price_cache 7d, snapshots 90d)</Li>
          <Li partial>WebSocket para precio real-time (polling como fallback)</Li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Latencia</h2>
        <p>
          Con RPC público: ~500ms-2s. Con nodo dedicado + WebSocket: ~50-200ms. Para cobertura de IL
          (no HFT) cualquiera de las dos es suficiente.
        </p>
        <p>
          Para mínima latencia: nodo RPC dedicado (Alchemy/QuickNode ~$49/mes o nodo propio), VPS en
          la misma región (~$20-50/mes), y variables{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs">
            WS_ARBITRUM
          </code>
          {' / '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs">
            WS_ETHEREUM
          </code>{' '}
          en el .env.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Mejoras pendientes</h2>
        <ul className="space-y-1">
          <Li>Lectura automática de posiciones LP on-chain</Li>
          <Li done>Alertas via webhook (Discord / Telegram)</Li>
          <Li>Multi-DEX hedging (dYdX, GMX)</Li>
          <Li>Backtesting con datos históricos</Li>
          <Li>Auto-rebalance del hedge si cambia el monto</Li>
          <Li>Trailing stop-loss dinámico</Li>
          <Li>Métricas avanzadas (Sharpe, drawdown, win rate)</Li>
          <Li done>Auth API key para el dashboard</Li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-foreground font-semibold">Stack</h2>
        <p>
          TypeScript · Node.js 22+ · Next.js 15 · React 19 · Tailwind CSS 4 · shadcn/ui · SQLite WAL
          · Vitest (62 tests) · Docker · GitHub Actions · viem · @nktkas/hyperliquid
        </p>
      </section>

      <footer className="border-t border-border pt-6 text-xs text-muted-foreground/60">
        E2E testeado en HL testnet (2026-03-10). 62 tests, 0 errores de typecheck.
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
