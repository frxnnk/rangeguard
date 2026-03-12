'use client';

import { useState, type FormEvent } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Loader2,
  Zap,
  DollarSign,
  BarChartHorizontal,
  Activity,
  ShieldAlert,
  ChevronDown,
  Play,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
  CartesianGrid,
} from 'recharts';

/* ─── constants ─── */

const PAIRS = ['ETH/USDC', 'BTC/USDC', 'SOL/USDC', 'ARB/USDC', 'LINK/USDC'];
const PERIODS = [
  { value: '3d', label: '3 días' },
  { value: '1w', label: '1 semana' },
  { value: '2w', label: '2 semanas' },
];

const CHART_COLORS = {
  mutedForeground: '#a1a1aa',
  card: '#1c1c1e',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.1)',
  green: '#22c55e',
  red: '#ef4444',
  gridLine: 'rgba(255,255,255,0.04)',
};

/* ─── types ─── */

interface BacktestStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalFees: number;
  netPnl: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  falseBreakouts: number;
  falseBreakoutRate: number;
  avgHoldingTimeMs: number;
  equityCurve: Array<{ timestamp: number; equity: number }>;
}

interface Trade {
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  fees: number;
  entryTime: number;
  exitTime: number;
  closeReason: string;
  isFalseBreakout: boolean;
}

interface BacktestResult {
  config: Record<string, unknown>;
  hedgeStats: BacktestStats;
  rangeStats: BacktestStats;
  combinedStats: BacktestStats;
  hedgeTrades: Trade[];
  rangeTrades: Trade[];
  startTime: number;
  endTime: number;
  pricePoints: number;
  durationMs: number;
}

/* ─── formatters ─── */

function fmtUsd(n: number): string {
  const prefix = n >= 0 ? '+$' : '-$';
  return `${prefix}${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtUsdNeutral(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string {
  return n.toFixed(1) + '%';
}

function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function fmtDateLong(ts: number): string {
  return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/* ─── page ─── */

export default function BacktestPage() {
  const [pair, setPair] = useState('ETH/USDC');
  const [rangeLower, setRangeLower] = useState('');
  const [rangeUpper, setRangeUpper] = useState('');
  const [period, setPeriod] = useState('1w');
  const [poolAmountUsd, setPoolAmountUsd] = useState('10000');
  const [leverage, setLeverage] = useState('10');
  const [hedgeRatio, setHedgeRatio] = useState('1.0');
  const [debounceCount, setDebounceCount] = useState('3');
  const [cooldownSeconds, setCooldownSeconds] = useState('300');
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [tradingLeverage, setTradingLeverage] = useState('5');
  const [tradingStopLoss, setTradingStopLoss] = useState('2.0');
  const [tradingTrailing, setTradingTrailing] = useState('1.5');
  const [tradingEntryZone, setTradingEntryZone] = useState('25');
  const [tradingCooldown, setTradingCooldown] = useState('300');
  const [tradingMaxSize, setTradingMaxSize] = useState('1000');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair,
          rangeLower: Number(rangeLower),
          rangeUpper: Number(rangeUpper),
          period,
          poolAmountUsd: Number(poolAmountUsd),
          leverage: Number(leverage),
          hedgeRatio: Number(hedgeRatio),
          debounceCount: Number(debounceCount),
          cooldownSeconds: Number(cooldownSeconds),
          tradingEnabled,
          tradingLeverage: Number(tradingLeverage),
          tradingStopLossPercent: Number(tradingStopLoss),
          tradingTrailingPercent: Number(tradingTrailing),
          tradingEntryZonePercent: Number(tradingEntryZone),
          tradingCooldownSeconds: Number(tradingCooldown),
          tradingMaxSizeUsd: Number(tradingMaxSize),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error ejecutando backtest');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Backtest</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Simulá estrategias de cobertura contra datos históricos de Binance
        </p>
      </div>

      {/* ─── Config form ─── */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section: Mercado */}
            <div>
              <SectionLabel>Mercado</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 max-w-3xl">
                <FieldGroup label="Par">
                  <Select value={pair} onValueChange={setPair}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAIRS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Rango inferior">
                  <Input
                    type="number"
                    step="any"
                    placeholder="1800"
                    value={rangeLower}
                    onChange={(e) => setRangeLower(e.target.value)}
                    required
                    className="tabular-nums"
                  />
                </FieldGroup>
                <FieldGroup label="Rango superior">
                  <Input
                    type="number"
                    step="any"
                    placeholder="2200"
                    value={rangeUpper}
                    onChange={(e) => setRangeUpper(e.target.value)}
                    required
                    className="tabular-nums"
                  />
                </FieldGroup>
                <FieldGroup label="Período">
                  <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
              </div>
            </div>

            {/* Section: Parámetros */}
            <div>
              <SectionLabel>Parámetros</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3 max-w-3xl">
                <FieldGroup label="Monto pool (USD)">
                  <Input
                    type="number"
                    value={poolAmountUsd}
                    onChange={(e) => setPoolAmountUsd(e.target.value)}
                    className="tabular-nums"
                  />
                </FieldGroup>
                <FieldGroup label="Apalancamiento">
                  <Input
                    type="number"
                    value={leverage}
                    onChange={(e) => setLeverage(e.target.value)}
                    className="tabular-nums"
                  />
                </FieldGroup>
                <FieldGroup label="Ratio de cobertura">
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="2.0"
                    value={hedgeRatio}
                    onChange={(e) => setHedgeRatio(e.target.value)}
                    className="tabular-nums"
                  />
                </FieldGroup>
              </div>
            </div>

            {/* Collapsible: Advanced */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown
                  className={`size-3.5 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
                />
                Ajuste fino
              </button>
              {showAdvanced && (
                <div className="grid grid-cols-2 gap-4 mt-3 max-w-md">
                  <FieldGroup label="Debounce (señales)">
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={debounceCount}
                      onChange={(e) => setDebounceCount(e.target.value)}
                      className="tabular-nums"
                    />
                  </FieldGroup>
                  <FieldGroup label="Cooldown (seg)">
                    <Input
                      type="number"
                      min="0"
                      value={cooldownSeconds}
                      onChange={(e) => setCooldownSeconds(e.target.value)}
                      className="tabular-nums"
                    />
                  </FieldGroup>
                </div>
              )}
            </div>

            <Separator />

            {/* Trading toggle */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={tradingEnabled} onCheckedChange={setTradingEnabled} />
                <div>
                  <Label
                    className="cursor-pointer text-sm"
                    onClick={() => setTradingEnabled(!tradingEnabled)}
                  >
                    Trading dentro del rango
                  </Label>
                  <p className="text-[11px] text-muted-foreground/60">
                    Habilita operaciones de mean-reversion dentro del rango LP
                  </p>
                </div>
              </div>

              {tradingEnabled && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pl-0 md:pl-10 max-w-3xl">
                  <FieldGroup label="Leverage">
                    <Input
                      type="number"
                      value={tradingLeverage}
                      onChange={(e) => setTradingLeverage(e.target.value)}
                      className="tabular-nums"
                    />
                  </FieldGroup>
                  <FieldGroup label="Stop Loss %">
                    <Input
                      type="number"
                      step="0.1"
                      value={tradingStopLoss}
                      onChange={(e) => setTradingStopLoss(e.target.value)}
                      className="tabular-nums"
                    />
                  </FieldGroup>
                  <FieldGroup label="Trailing %">
                    <Input
                      type="number"
                      step="0.1"
                      value={tradingTrailing}
                      onChange={(e) => setTradingTrailing(e.target.value)}
                      className="tabular-nums"
                    />
                  </FieldGroup>
                  <FieldGroup label="Zona entrada %">
                    <Input
                      type="number"
                      value={tradingEntryZone}
                      onChange={(e) => setTradingEntryZone(e.target.value)}
                      className="tabular-nums"
                    />
                  </FieldGroup>
                  <FieldGroup label="Cooldown (seg)">
                    <Input
                      type="number"
                      value={tradingCooldown}
                      onChange={(e) => setTradingCooldown(e.target.value)}
                      className="tabular-nums"
                    />
                  </FieldGroup>
                  <FieldGroup label="Max size (USD)">
                    <Input
                      type="number"
                      value={tradingMaxSize}
                      onChange={(e) => setTradingMaxSize(e.target.value)}
                      className="tabular-nums"
                    />
                  </FieldGroup>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-lg">
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <Button type="submit" disabled={loading} size="lg">
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Ejecutando...
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Ejecutar Backtest
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Loading state ─── */}
      {loading && <LoadingCard />}

      {/* ─── Results ─── */}
      {result && <BacktestResults result={result} tradingEnabled={tradingEnabled} />}
    </div>
  );
}

/* ─── sub-components: form ─── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function LoadingCard() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="py-16 text-center relative">
        {/* Animated background pulse */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-muted/30 to-transparent animate-pulse" />
        <div className="relative">
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-2 rounded-full bg-muted-foreground/40"
                style={{
                  animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            Descargando datos de Binance y ejecutando simulación
          </p>
          <p className="text-xs text-muted-foreground/50 mt-1.5">
            Puede tardar entre 10s y 2 minutos dependiendo del período
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── sub-components: results ─── */

function BacktestResults({
  result,
  tradingEnabled,
}: {
  result: BacktestResult;
  tradingEnabled: boolean;
}) {
  const { combinedStats, hedgeStats, rangeStats, hedgeTrades, rangeTrades } = result;
  const hedgeSet = new Set(hedgeTrades.map((t) => `${t.entryTime}-${t.side}-${t.size}`));
  const allTrades = [...hedgeTrades, ...rangeTrades].sort((a, b) => a.entryTime - b.entryTime);
  const isProfit = combinedStats.netPnl >= 0;

  return (
    <div className="space-y-6">
      {/* ─── Result banner ─── */}
      <div
        className={`rounded-xl border px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${
          isProfit
            ? 'border-green-500/20 bg-green-500/5'
            : 'border-red-500/20 bg-red-500/5'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`size-10 rounded-lg flex items-center justify-center ${
              isProfit ? 'bg-green-500/15' : 'bg-red-500/15'
            }`}
          >
            {isProfit ? (
              <TrendingUp className="size-5 text-green-400" />
            ) : (
              <TrendingDown className="size-5 text-red-400" />
            )}
          </div>
          <div>
            <p className={`text-xl font-bold tabular-nums ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
              {fmtUsd(combinedStats.netPnl)}
            </p>
            <p className="text-xs text-muted-foreground">
              PnL neto en {combinedStats.totalTrades} trades
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px] tabular-nums border-border/50">
            {result.pricePoints.toLocaleString()} velas
          </Badge>
          <Badge variant="outline" className="text-[10px] tabular-nums border-border/50">
            {fmtDateLong(result.startTime)} — {fmtDateLong(result.endTime)}
          </Badge>
          <Badge variant="outline" className="text-[10px] tabular-nums border-border/50">
            {(result.durationMs / 1000).toFixed(1)}s simulación
          </Badge>
        </div>
      </div>

      {/* ─── Stats grid ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Total Trades"
          value={combinedStats.totalTrades.toString()}
          icon={Activity}
          accent="text-muted-foreground"
        />
        <MetricCard
          label="Tasa de Acierto"
          value={fmtPct(combinedStats.winRate)}
          sub={`${combinedStats.wins}G / ${combinedStats.losses}P`}
          icon={Target}
          accent={combinedStats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}
        />
        <MetricCard
          label="Fees Totales"
          value={fmtUsdNeutral(combinedStats.totalFees)}
          icon={DollarSign}
          accent="text-muted-foreground"
        />
        <MetricCard
          label="Profit Factor"
          value={combinedStats.profitFactor === Infinity ? '---' : combinedStats.profitFactor.toFixed(2)}
          icon={Zap}
          accent={combinedStats.profitFactor >= 1 ? 'text-green-400' : 'text-red-400'}
        />
        <MetricCard
          label="Max Drawdown"
          value={fmtPct(combinedStats.maxDrawdownPercent)}
          sub={fmtUsdNeutral(combinedStats.maxDrawdown)}
          icon={ShieldAlert}
          accent="text-red-400"
        />
        <MetricCard
          label="Sharpe Ratio"
          value={combinedStats.sharpeRatio.toFixed(2)}
          icon={BarChartHorizontal}
          accent={combinedStats.sharpeRatio >= 1 ? 'text-green-400' : combinedStats.sharpeRatio >= 0 ? 'text-yellow-400' : 'text-red-400'}
        />
      </div>

      {/* ─── Strategy breakdown ─── */}
      {tradingEnabled && (hedgeTrades.length > 0 || rangeTrades.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StrategyCard title="Coberturas" stats={hedgeStats} />
          <StrategyCard title="Trading en Rango" stats={rangeStats} />
        </div>
      )}

      {/* ─── Equity chart ─── */}
      {combinedStats.equityCurve.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Curva de Equity</CardTitle>
          </CardHeader>
          <CardContent>
            <EquityChart data={combinedStats.equityCurve} />
          </CardContent>
        </Card>
      )}

      {/* ─── Trade table ─── */}
      {allTrades.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Detalle de Trades
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <TradeTable
              trades={allTrades}
              isHedge={(t) => hedgeSet.has(`${t.entryTime}-${t.side}-${t.size}`)}
            />
          </div>
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground/60 tabular-nums">
              {allTrades.length} trade{allTrades.length !== 1 ? 's' : ''}
            </span>
            <span
              className={`text-xs font-medium tabular-nums ${
                combinedStats.netPnl >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              Neto: {fmtUsd(combinedStats.netPnl)}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── Metric card (matches Overview / History pattern) ─── */

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            {label}
          </span>
          <Icon className={`size-3.5 ${accent}`} aria-hidden="true" />
        </div>
        <p className={`text-lg font-bold tabular-nums ${accent}`}>{value}</p>
        {sub && (
          <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Strategy card ─── */

function StrategyCard({ title, stats }: { title: string; stats: BacktestStats }) {
  if (stats.totalTrades === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
            {title}
          </p>
          <p className="text-sm text-muted-foreground/50">Sin trades en esta estrategia</p>
        </CardContent>
      </Card>
    );
  }

  const rows: Array<{ label: string; value: string; color?: string }> = [
    { label: 'Trades', value: `${stats.totalTrades}` },
    {
      label: 'Win Rate',
      value: `${fmtPct(stats.winRate)}`,
      color: stats.winRate >= 50 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'PnL Neto',
      value: fmtUsd(stats.netPnl),
      color: stats.netPnl >= 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Profit Factor',
      value: stats.profitFactor === Infinity ? '---' : stats.profitFactor.toFixed(2),
    },
    { label: 'Avg Win', value: fmtUsdNeutral(stats.avgWin), color: 'text-green-400' },
    { label: 'Avg Loss', value: fmtUsdNeutral(Math.abs(stats.avgLoss)), color: 'text-red-400' },
    { label: 'Fees', value: fmtUsdNeutral(stats.totalFees) },
    { label: 'Duración prom.', value: fmtDuration(stats.avgHoldingTimeMs) },
  ];

  if (stats.falseBreakouts > 0) {
    rows.push({
      label: 'Falsas rupturas',
      value: `${stats.falseBreakouts} (${fmtPct(stats.falseBreakoutRate)})`,
      color: 'text-orange-400',
    });
  }

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
          {title}
        </p>
        <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-xs">{r.label}</span>
              <span className={`tabular-nums text-xs font-medium ${r.color ?? 'text-foreground'}`}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Equity chart ─── */

function EquityChart({ data }: { data: Array<{ timestamp: number; equity: number }> }) {
  const chartData = data.map((d) => ({
    date: fmtDate(d.timestamp),
    equity: Math.round(d.equity * 100) / 100,
  }));

  const startEquity = data[0]?.equity ?? 10_000;
  const endEquity = data[data.length - 1]?.equity ?? startEquity;
  const isProfit = endEquity >= startEquity;
  const color = isProfit ? CHART_COLORS.green : CHART_COLORS.red;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_COLORS.gridLine} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          stroke={CHART_COLORS.mutedForeground}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke={CHART_COLORS.mutedForeground}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_COLORS.card,
            border: `1px solid ${CHART_COLORS.borderStrong}`,
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: CHART_COLORS.mutedForeground, marginBottom: '4px' }}
          formatter={(val: number) => [fmtUsdNeutral(val), 'Equity']}
        />
        <ReferenceLine
          y={startEquity}
          stroke={CHART_COLORS.borderStrong}
          strokeDasharray="4 4"
        />
        <Area
          type="monotone"
          dataKey="equity"
          stroke={color}
          strokeWidth={2}
          fill="url(#equityGradient)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Trade table (matches History page pattern) ─── */

function TradeTable({
  trades,
  isHedge,
}: {
  trades: Trade[];
  isHedge: (t: Trade) => boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">Fecha</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Lado</TableHead>
          <TableHead className="text-right">Tamaño</TableHead>
          <TableHead className="text-right">Entrada</TableHead>
          <TableHead className="text-right">Salida</TableHead>
          <TableHead className="text-right">PnL</TableHead>
          <TableHead className="text-right">Fees</TableHead>
          <TableHead className="text-center">Duración</TableHead>
          <TableHead>Motivo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((t, i) => {
          const hedge = isHedge(t);
          const net = t.pnl - t.fees;
          return (
            <TableRow key={i}>
              <TableCell className="tabular-nums">
                <span className="text-foreground text-xs">{fmtDateTime(t.entryTime)}</span>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    hedge
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  }`}
                >
                  {hedge ? 'Hedge' : 'Trading'}
                </Badge>
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium ${
                    t.side === 'long' ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      t.side === 'long' ? 'bg-green-400' : 'bg-red-400'
                    }`}
                  />
                  {t.side.toUpperCase()}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums font-mono text-xs text-muted-foreground">
                {t.size.toFixed(4)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-xs">
                {fmtUsdNeutral(t.entryPrice)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-xs">
                {fmtUsdNeutral(t.exitPrice)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span
                  className={`text-xs font-semibold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  {fmtUsd(net)}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                {fmtUsdNeutral(t.fees)}
              </TableCell>
              <TableCell className="text-center">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {fmtDuration(t.exitTime - t.entryTime)}
                </span>
              </TableCell>
              <TableCell>
                {t.isFalseBreakout ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/20"
                  >
                    Falsa Ruptura
                  </Badge>
                ) : t.closeReason ? (
                  <span className="text-[11px] text-muted-foreground">
                    {t.closeReason === 'range_return'
                      ? 'Retorno al rango'
                      : t.closeReason === 'manual'
                        ? 'Manual'
                        : t.closeReason}
                  </span>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
