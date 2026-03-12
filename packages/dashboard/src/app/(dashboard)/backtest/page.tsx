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
  Droplets,
  Percent,
  Coins,
  Calculator,
  BookOpen,
  Lightbulb,
  CheckCircle2,
  XCircle,
  Info,
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
  { value: '1m', label: '1 mes' },
  { value: '2m', label: '2 meses' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: 'custom', label: 'Fechas personalizadas' },
];

interface Preset {
  name: string;
  description: string;
  icon: 'crash' | 'neutral' | 'warning';
  pair: string;
  rangeLower: string;
  rangeUpper: string;
  startDate: string;
  endDate: string;
  hedgeRatio: string;
  debounceCount: string;
  cooldownSeconds: string;
  poolAmountUsd: string;
  leverage: string;
  feeAprPercent: string;
}

const PRESETS: Preset[] = [
  {
    name: 'FTX Crash (Nov 2022)',
    description:
      'ETH $1570→$1100 en días. Crash fuerte y sostenido. Mejor caso para la cobertura — el short gana mientras el LP sufre IL.',
    icon: 'crash',
    pair: 'ETH/USDC',
    rangeLower: '1400',
    rangeUpper: '1600',
    startDate: '2022-11-07',
    endDate: '2022-11-20',
    hedgeRatio: '1.0',
    debounceCount: '3',
    cooldownSeconds: '300',
    poolAmountUsd: '10000',
    leverage: '10',
    feeAprPercent: '20',
  },
  {
    name: 'Rally ETH (Feb 2024)',
    description:
      'ETH $2300→$3500 en un mes. Ruptura al alza sostenida. El short pierde — la cobertura NO funciona en rallies.',
    icon: 'warning',
    pair: 'ETH/USDC',
    rangeLower: '2200',
    rangeUpper: '2800',
    startDate: '2024-02-01',
    endDate: '2024-03-01',
    hedgeRatio: '1.0',
    debounceCount: '3',
    cooldownSeconds: '300',
    poolAmountUsd: '10000',
    leverage: '10',
    feeAprPercent: '20',
  },
  {
    name: 'Corrección Abr 2024',
    description:
      'ETH $3640→$2880. Corrección parcial con rebotes. Cobertura parcial, falsas rupturas restan valor.',
    icon: 'neutral',
    pair: 'ETH/USDC',
    rangeLower: '3200',
    rangeUpper: '3800',
    startDate: '2024-04-10',
    endDate: '2024-04-25',
    hedgeRatio: '1.0',
    debounceCount: '3',
    cooldownSeconds: '300',
    poolAmountUsd: '10000',
    leverage: '10',
    feeAprPercent: '20',
  },
  {
    name: 'Mercado lateral (Jun 2024)',
    description:
      'Precio dentro del rango todo el período. 0 coberturas necesarias. LP gana fees sin IL.',
    icon: 'crash',
    pair: 'ETH/USDC',
    rangeLower: '3300',
    rangeUpper: '3900',
    startDate: '2024-06-05',
    endDate: '2024-06-20',
    hedgeRatio: '1.0',
    debounceCount: '3',
    cooldownSeconds: '300',
    poolAmountUsd: '10000',
    leverage: '10',
    feeAprPercent: '20',
  },
  {
    name: 'Falsas rupturas (Abr 2024)',
    description:
      'Precio oscila en el borde del rango 45 días. Muchas falsas rupturas. Escenario donde la cobertura pierde por fees acumulados.',
    icon: 'warning',
    pair: 'ETH/USDC',
    rangeLower: '3000',
    rangeUpper: '3800',
    startDate: '2024-04-01',
    endDate: '2024-05-15',
    hedgeRatio: '1.0',
    debounceCount: '3',
    cooldownSeconds: '300',
    poolAmountUsd: '10000',
    leverage: '10',
    feeAprPercent: '20',
  },
];

const CHART_COLORS = {
  mutedForeground: '#a1a1aa',
  card: '#1c1c1e',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.1)',
  green: '#22c55e',
  red: '#ef4444',
  blue: '#3b82f6',
  yellow: '#eab308',
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
  fundingPnl: number;
  entryTime: number;
  exitTime: number;
  closeReason: string;
  isFalseBreakout: boolean;
}

interface LpSnapshot {
  timestamp: number;
  price: number;
  positionValue: number;
  hodlValue: number;
  il: number;
  ilPercent: number;
  accumulatedFees: number;
  netLpPnl: number;
  inRange: boolean;
}

interface LpMetrics {
  entryPrice: number;
  finalPrice: number;
  liquidity: number;
  positionValueStart: number;
  positionValueEnd: number;
  hodlValueEnd: number;
  totalIL: number;
  ilPercent: number;
  totalFees: number;
  netLpPnl: number;
  timeInRangePercent: number;
  snapshots: LpSnapshot[];
}

interface HedgeIlCorrelation {
  tradeIndex: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  hedgePnl: number;
  hedgeFees: number;
  hedgeFunding: number;
  ilDuringHedge: number;
  netEffect: number;
  hedgeEffectiveness: number;
}

interface EquityCurvePoint {
  timestamp: number;
  lpOnly: number;
  lpPlusHedge: number;
  hodl: number;
}

interface UnifiedAnalysis {
  correlations: HedgeIlCorrelation[];
  totalIlDuringHedges: number;
  totalHedgePnl: number;
  totalHedgeFees: number;
  totalHedgeFunding: number;
  netHedgeEffect: number;
  hedgingEffectivenessRatio: number;
  ilCoveredPercent: number;
  totalIl: number;
  totalLpFees: number;
  lpOnlyFinalPnl: number;
  lpPlusHedgeFinalPnl: number;
  hodlFinalPnl: number;
  equityCurve: EquityCurvePoint[];
}

interface BacktestResult {
  config: Record<string, unknown>;
  hedgeStats: BacktestStats;
  rangeStats: BacktestStats;
  combinedStats: BacktestStats;
  hedgeTrades: Trade[];
  rangeTrades: Trade[];
  lpMetrics: LpMetrics;
  unifiedAnalysis?: UnifiedAnalysis;
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
  return new Date(ts).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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
  const [feeAprPercent, setFeeAprPercent] = useState('20');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasRunOnce, setHasRunOnce] = useState(false);

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const applyPreset = (preset: Preset) => {
    setPair(preset.pair);
    setRangeLower(preset.rangeLower);
    setRangeUpper(preset.rangeUpper);
    setPeriod('custom');
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
    setHedgeRatio(preset.hedgeRatio);
    setDebounceCount(preset.debounceCount);
    setCooldownSeconds(preset.cooldownSeconds);
    setPoolAmountUsd(preset.poolAmountUsd);
    setLeverage(preset.leverage);
    setFeeAprPercent(preset.feeAprPercent);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    setHasRunOnce(true);

    try {
      const payload: Record<string, unknown> = {
        pair,
        rangeLower: Number(rangeLower),
        rangeUpper: Number(rangeUpper),
        poolAmountUsd: Number(poolAmountUsd),
        leverage: Number(leverage),
        hedgeRatio: Number(hedgeRatio),
        debounceCount: Number(debounceCount),
        cooldownSeconds: Number(cooldownSeconds),
        feeAprPercent: Number(feeAprPercent),
        tradingEnabled,
        tradingLeverage: Number(tradingLeverage),
        tradingStopLossPercent: Number(tradingStopLoss),
        tradingTrailingPercent: Number(tradingTrailing),
        tradingEntryZonePercent: Number(tradingEntryZone),
        tradingCooldownSeconds: Number(tradingCooldown),
        tradingMaxSizeUsd: Number(tradingMaxSize),
      };

      if (period === 'custom' && startDate && endDate) {
        payload.startDate = startDate;
        payload.endDate = endDate;
      } else {
        payload.period = period;
      }

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

      {/* ─── Educational card (before first run) ─── */}
      {!hasRunOnce && !result && <EducationalCard />}

      {/* ─── Presets ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="size-4 text-yellow-400" />
            Escenarios Precargados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Seleccioná un escenario para cargar los parámetros automáticamente. Después hacé click
            en &quot;Ejecutar Backtest&quot;.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="text-left p-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`size-2 rounded-full ${
                      preset.icon === 'crash'
                        ? 'bg-green-400'
                        : preset.icon === 'neutral'
                          ? 'bg-blue-400'
                          : 'bg-orange-400'
                    }`}
                  />
                  <span className="text-xs font-medium text-foreground">{preset.name}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

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
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
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
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
              </div>
              {/* Custom dates */}
              {period === 'custom' && (
                <div className="grid grid-cols-2 gap-4 mt-3 max-w-md">
                  <FieldGroup label="Fecha inicio">
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </FieldGroup>
                  <FieldGroup label="Fecha fin">
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </FieldGroup>
                </div>
              )}
            </div>

            {/* Section: Parámetros */}
            <div>
              <SectionLabel>Parámetros</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 max-w-3xl">
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
                <FieldGroup label="Fee APR pool (%)">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="200"
                    value={feeAprPercent}
                    onChange={(e) => setFeeAprPercent(e.target.value)}
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

      {/* ─── Findings card ─── */}
      {result && <FindingsCard result={result} />}
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
  const {
    combinedStats,
    hedgeStats,
    rangeStats,
    hedgeTrades,
    rangeTrades,
    lpMetrics,
    unifiedAnalysis,
  } = result;
  const hedgeSet = new Set(hedgeTrades.map((t) => `${t.entryTime}-${t.side}-${t.size}`));
  const allTrades = [...hedgeTrades, ...rangeTrades].sort((a, b) => a.entryTime - b.entryTime);

  // Combined total: LP net (fees - IL) + hedge/trading PnL
  const totalCombined = lpMetrics.netLpPnl + combinedStats.netPnl;
  const isProfit = totalCombined >= 0;

  return (
    <div className="space-y-6">
      {/* ─── Result banner ─── */}
      <div
        className={`rounded-xl border px-5 py-4 flex flex-col gap-4 ${
          isProfit ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
              <p
                className={`text-xl font-bold tabular-nums ${isProfit ? 'text-green-400' : 'text-red-400'}`}
              >
                {fmtUsd(totalCombined)}
              </p>
              <p className="text-xs text-muted-foreground">Resultado combinado (LP + Cobertura)</p>
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

        {/* Breakdown row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums border-t border-current/10 pt-3">
          <span className="text-muted-foreground">
            Fees LP:{' '}
            <span className="text-green-400 font-medium">{fmtUsd(lpMetrics.totalFees)}</span>
          </span>
          <span className="text-muted-foreground/40">−</span>
          <span className="text-muted-foreground">
            IL:{' '}
            <span className="text-red-400 font-medium">
              {fmtUsdNeutral(Math.abs(lpMetrics.totalIL))} ({fmtPct(Math.abs(lpMetrics.ilPercent))})
            </span>
          </span>
          <span className="text-muted-foreground/40">+</span>
          <span className="text-muted-foreground">
            Hedge PnL:{' '}
            <span
              className={`font-medium ${combinedStats.netPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {fmtUsd(combinedStats.netPnl)}
            </span>
          </span>
          <span className="text-muted-foreground/40">=</span>
          <span className={`font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
            {fmtUsd(totalCombined)}
          </span>
        </div>
      </div>

      {/* ─── LP metrics cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Impermanent Loss"
          value={fmtUsd(lpMetrics.totalIL)}
          sub={fmtPct(lpMetrics.ilPercent)}
          icon={Droplets}
          accent="text-red-400"
        />
        <MetricCard
          label="Fees LP estimados"
          value={fmtUsd(lpMetrics.totalFees)}
          sub={`${(lpMetrics.timeInRangePercent ?? 100).toFixed(0)}% en rango`}
          icon={Coins}
          accent="text-green-400"
        />
        <MetricCard
          label="Neto LP"
          value={fmtUsd(lpMetrics.netLpPnl)}
          sub="Fees − IL"
          icon={Percent}
          accent={lpMetrics.netLpPnl >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <MetricCard
          label="Neto Total"
          value={fmtUsd(totalCombined)}
          sub="LP + Hedge + Trading"
          icon={Calculator}
          accent={totalCombined >= 0 ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      {/* ─── Hedge/Trading stats grid ─── */}
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
          label="Fees Trading"
          value={fmtUsdNeutral(combinedStats.totalFees)}
          icon={DollarSign}
          accent="text-muted-foreground"
        />
        <MetricCard
          label="Profit Factor"
          value={
            combinedStats.profitFactor === Infinity ? '---' : combinedStats.profitFactor.toFixed(2)
          }
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
          accent={
            combinedStats.sharpeRatio >= 1
              ? 'text-green-400'
              : combinedStats.sharpeRatio >= 0
                ? 'text-yellow-400'
                : 'text-red-400'
          }
        />
      </div>

      {/* ─── Methodology ─── */}
      <MethodologyCard />

      {/* ─── Strategy breakdown ─── */}
      {tradingEnabled && (hedgeTrades.length > 0 || rangeTrades.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StrategyCard title="Coberturas" stats={hedgeStats} />
          <StrategyCard title="Trading en Rango" stats={rangeStats} />
        </div>
      )}

      {/* ─── Strategy Comparison ─── */}
      {unifiedAnalysis && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Comparación de Estrategias</CardTitle>
          </CardHeader>
          <CardContent>
            <StrategyComparisonTable analysis={unifiedAnalysis} />
          </CardContent>
        </Card>
      )}

      {/* ─── Hedge vs IL metrics ─── */}
      {unifiedAnalysis && hedgeTrades.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cobertura vs Impermanent Loss</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <HedgeIlMetrics analysis={unifiedAnalysis} />
            {unifiedAnalysis.correlations.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
                    Correlación por Trade
                  </p>
                  <div className="overflow-x-auto">
                    <HedgeIlCorrelationTable correlations={unifiedAnalysis.correlations} />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── 3-line equity curve (LP vs LP+Hedge vs HODL) ─── */}
      {unifiedAnalysis && unifiedAnalysis.equityCurve.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Curvas de Equity: LP vs LP+Hedge vs HODL
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UnifiedEquityChart data={unifiedAnalysis.equityCurve} />
          </CardContent>
        </Card>
      )}

      {/* ─── LP value chart ─── */}
      {lpMetrics.snapshots.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Posición LP vs HODL</CardTitle>
          </CardHeader>
          <CardContent>
            <LpChart snapshots={lpMetrics.snapshots} />
          </CardContent>
        </Card>
      )}

      {/* ─── Equity chart ─── */}
      {combinedStats.equityCurve.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Curva de Equity (Trades)</CardTitle>
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
            <CardTitle className="text-sm font-medium">Detalle de Trades</CardTitle>
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
              Neto trades: {fmtUsd(combinedStats.netPnl)}
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
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{sub}</p>}
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

/* ─── Strategy comparison table ─── */

function StrategyComparisonTable({ analysis }: { analysis: UnifiedAnalysis }) {
  const strategies = [
    { name: 'HODL', pnl: analysis.hodlFinalPnl },
    { name: 'LP solo (fees − IL)', pnl: analysis.lpOnlyFinalPnl },
    { name: 'LP + Cobertura', pnl: analysis.lpPlusHedgeFinalPnl, highlight: true },
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Estrategia</TableHead>
          <TableHead className="text-right">PnL Final</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {strategies.map((s) => (
          <TableRow key={s.name}>
            <TableCell className={s.highlight ? 'font-semibold text-foreground' : ''}>
              {s.highlight ? `** ${s.name} **` : s.name}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <span className={`font-semibold ${s.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmtUsd(s.pnl)}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ─── Hedge vs IL aggregate metrics ─── */

function HedgeIlMetrics({ analysis }: { analysis: UnifiedAnalysis }) {
  const rows: Array<{ label: string; value: string; color?: string }> = [
    {
      label: 'IL total (período completo)',
      value: fmtUsd(analysis.totalIl),
      color: 'text-red-400',
    },
    {
      label: 'Fees LP ganados',
      value: fmtUsd(analysis.totalLpFees),
      color: 'text-green-400',
    },
    {
      label: 'IL durante hedges activos',
      value: fmtUsd(analysis.totalIlDuringHedges),
      color: analysis.totalIlDuringHedges >= 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'PnL total coberturas',
      value: fmtUsd(analysis.totalHedgePnl),
      color: analysis.totalHedgePnl >= 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Fees coberturas',
      value: fmtUsdNeutral(analysis.totalHedgeFees),
    },
    {
      label: 'Costo funding',
      value: fmtUsd(analysis.totalHedgeFunding),
      color: analysis.totalHedgeFunding >= 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Efecto neto cobertura',
      value: fmtUsd(analysis.netHedgeEffect),
      color: analysis.netHedgeEffect >= 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Efectividad cobertura',
      value: `${analysis.hedgingEffectivenessRatio.toFixed(2)}x`,
      color: analysis.hedgingEffectivenessRatio >= 1 ? 'text-green-400' : 'text-yellow-400',
    },
    {
      label: 'IL cubierto por hedges',
      value: fmtPct(analysis.ilCoveredPercent),
      color: analysis.ilCoveredPercent > 50 ? 'text-green-400' : 'text-red-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">{r.label}</span>
          <span className={`text-sm font-semibold tabular-nums ${r.color ?? 'text-foreground'}`}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Per-trade IL correlation table ─── */

function HedgeIlCorrelationTable({ correlations }: { correlations: HedgeIlCorrelation[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]">#</TableHead>
          <TableHead>Lado</TableHead>
          <TableHead className="text-right">Entrada</TableHead>
          <TableHead className="text-right">Salida</TableHead>
          <TableHead className="text-right">PnL Hedge</TableHead>
          <TableHead className="text-right">IL durante hedge</TableHead>
          <TableHead className="text-right">Efecto Neto</TableHead>
          <TableHead className="text-right">Efectividad</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {correlations.map((c) => (
          <TableRow key={c.tradeIndex}>
            <TableCell className="tabular-nums text-xs text-muted-foreground">
              {c.tradeIndex}
            </TableCell>
            <TableCell>
              <span
                className={`text-xs font-medium ${
                  c.side === 'long' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {c.side}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums text-xs">
              {fmtUsdNeutral(c.entryPrice)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-xs">
              {fmtUsdNeutral(c.exitPrice)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <span
                className={`text-xs font-semibold ${c.hedgePnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {fmtUsd(c.hedgePnl)}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <span
                className={`text-xs ${c.ilDuringHedge >= 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {fmtUsd(c.ilDuringHedge)}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <span
                className={`text-xs font-semibold ${c.netEffect >= 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {fmtUsd(c.netEffect)}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
              {c.hedgeEffectiveness.toFixed(2)}x
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ─── Unified 3-line equity curve chart ─── */

function UnifiedEquityChart({ data }: { data: EquityCurvePoint[] }) {
  // Downsample if too many points for the chart
  const maxPoints = 500;
  const step = Math.max(1, Math.floor(data.length / maxPoints));
  const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const chartData = sampled.map((d) => ({
    date: fmtDate(d.timestamp),
    lpOnly: Math.round(d.lpOnly * 100) / 100,
    lpPlusHedge: Math.round(d.lpPlusHedge * 100) / 100,
    hodl: Math.round(d.hodl * 100) / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="lpOnlyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.red} stopOpacity={0.1} />
            <stop offset="95%" stopColor={CHART_COLORS.red} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="lpHedgeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.blue} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0} />
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
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_COLORS.card,
            border: `1px solid ${CHART_COLORS.borderStrong}`,
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: CHART_COLORS.mutedForeground, marginBottom: '4px' }}
          formatter={(val: number, name: string) => {
            const labels: Record<string, string> = {
              hodl: 'HODL',
              lpOnly: 'LP Solo',
              lpPlusHedge: 'LP + Hedge',
            };
            return [fmtUsd(val), labels[name] ?? name];
          }}
        />
        <ReferenceLine y={0} stroke={CHART_COLORS.borderStrong} strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="hodl"
          stroke={CHART_COLORS.yellow}
          strokeWidth={1.5}
          strokeDasharray="6 3"
          fill="none"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.yellow }}
        />
        <Area
          type="monotone"
          dataKey="lpOnly"
          stroke={CHART_COLORS.red}
          strokeWidth={1.5}
          fill="url(#lpOnlyGrad)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.red }}
        />
        <Area
          type="monotone"
          dataKey="lpPlusHedge"
          stroke={CHART_COLORS.blue}
          strokeWidth={2}
          fill="url(#lpHedgeGrad)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.blue }}
        />
      </AreaChart>
    </ResponsiveContainer>
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
        <ReferenceLine y={startEquity} stroke={CHART_COLORS.borderStrong} strokeDasharray="4 4" />
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

/* ─── LP chart (IL + Fees + Net) ─── */

function LpChart({ snapshots }: { snapshots: LpSnapshot[] }) {
  const chartData = snapshots.map((s) => ({
    date: fmtDate(s.timestamp),
    il: Math.round(s.il * 100) / 100,
    fees: Math.round(s.accumulatedFees * 100) / 100,
    net: Math.round(s.netLpPnl * 100) / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ilGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.red} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART_COLORS.red} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="feesGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.green} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0} />
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
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_COLORS.card,
            border: `1px solid ${CHART_COLORS.borderStrong}`,
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: CHART_COLORS.mutedForeground, marginBottom: '4px' }}
          formatter={(val: number, name: string) => {
            const labels: Record<string, string> = {
              il: 'IL',
              fees: 'Fees LP',
              net: 'Neto LP',
            };
            return [fmtUsd(val), labels[name] ?? name];
          }}
        />
        <ReferenceLine y={0} stroke={CHART_COLORS.borderStrong} strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="il"
          stroke={CHART_COLORS.red}
          strokeWidth={1.5}
          fill="url(#ilGradient)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.red }}
        />
        <Area
          type="monotone"
          dataKey="fees"
          stroke={CHART_COLORS.green}
          strokeWidth={1.5}
          fill="url(#feesGradient)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.green }}
        />
        <Area
          type="monotone"
          dataKey="net"
          stroke="#eab308"
          strokeWidth={2}
          fill="none"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: '#eab308' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Educational card ─── */

function EducationalCard() {
  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BookOpen className="size-4 text-blue-400" />
          ¿Qué hace este backtest?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-muted-foreground leading-relaxed">
        <p>Este simulador compara tres estrategias sobre datos históricos reales de Binance:</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-card/50 border border-border/30">
            <p className="font-medium text-foreground mb-1">HODL</p>
            <p>Simplemente mantener el activo sin proveer liquidez. Línea base.</p>
          </div>
          <div className="p-3 rounded-lg bg-card/50 border border-border/30">
            <p className="font-medium text-foreground mb-1">LP Solo</p>
            <p>
              Proveer liquidez concentrada. Gana fees pero sufre Impermanent Loss cuando el precio
              sale del rango.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-card/50 border border-border/30">
            <p className="font-medium text-foreground mb-1">LP + Cobertura</p>
            <p>
              Proveer liquidez + abrir shorts con perpetuos cuando el precio rompe el rango. El
              hedge compensa la IL.
            </p>
          </div>
        </div>
        <div className="border-t border-border/30 pt-3 space-y-1.5">
          <p className="flex items-start gap-2">
            <CheckCircle2 className="size-3.5 text-green-400 mt-0.5 shrink-0" />
            <span>
              <strong className="text-foreground">Funciona bien</strong> cuando el precio rompe el
              rango con fuerza y se mantiene afuera (crashes, correcciones sostenidas).
            </span>
          </p>
          <p className="flex items-start gap-2">
            <XCircle className="size-3.5 text-red-400 mt-0.5 shrink-0" />
            <span>
              <strong className="text-foreground">No funciona bien</strong> cuando el precio oscila
              alrededor del borde del rango (falsas rupturas) o se mueve gradualmente.
            </span>
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground/60">
          Usá los escenarios precargados para ver ejemplos de cada caso, o configurá tus propios
          parámetros.
        </p>
      </CardContent>
    </Card>
  );
}

/* ─── Findings card ─── */

function FindingsCard({ result }: { result: BacktestResult }) {
  const { combinedStats, unifiedAnalysis, hedgeTrades, lpMetrics } = result;
  const findings: Array<{ type: 'positive' | 'warning' | 'neutral' | 'solution'; text: string }> = [];

  // ── Analyze trade patterns ──
  // Upward breakout trades: longs opened when price goes above range (unnecessary — LP is 100% stablecoin)
  const upsideTrades = hedgeTrades.filter((t) => t.side === 'long');
  const upsidePnl = upsideTrades.reduce((s, t) => s + t.pnl, 0);
  // Downward breakout trades: shorts opened when price drops below range (actual hedging)
  const downsideTrades = hedgeTrades.filter((t) => t.side === 'short');
  const downsidePnl = downsideTrades.reduce((s, t) => s + t.pnl, 0);

  // No trades at all
  if (combinedStats.totalTrades === 0) {
    findings.push({
      type: 'neutral',
      text: 'El precio se mantuvo dentro del rango durante todo el período. No se necesitaron coberturas. LP ganó fees sin IL significativo.',
    });
  }

  // IL coverage
  if (unifiedAnalysis && hedgeTrades.length > 0) {
    if (unifiedAnalysis.ilCoveredPercent > 50) {
      findings.push({
        type: 'positive',
        text: `Las coberturas cubrieron el ${unifiedAnalysis.ilCoveredPercent.toFixed(0)}% del Impermanent Loss. La estrategia de hedge funciona bien en este escenario.`,
      });
    } else if (unifiedAnalysis.ilCoveredPercent > 20) {
      findings.push({
        type: 'neutral',
        text: `Las coberturas cubrieron el ${unifiedAnalysis.ilCoveredPercent.toFixed(0)}% del IL. Cobertura parcial — ajustar parámetros podría mejorar el resultado.`,
      });
    } else if (unifiedAnalysis.ilCoveredPercent > 0) {
      findings.push({
        type: 'warning',
        text: `Solo se cubrió el ${unifiedAnalysis.ilCoveredPercent.toFixed(0)}% del IL. Las coberturas no fueron suficientes en este escenario.`,
      });
    }
  }

  // LP+Hedge vs LP solo
  if (unifiedAnalysis) {
    if (unifiedAnalysis.lpPlusHedgeFinalPnl > unifiedAnalysis.lpOnlyFinalPnl) {
      const diff = unifiedAnalysis.lpPlusHedgeFinalPnl - unifiedAnalysis.lpOnlyFinalPnl;
      findings.push({
        type: 'positive',
        text: `LP+Hedge superó a LP solo por ${fmtUsdNeutral(diff)}. El hedge agregó valor neto.`,
      });
    } else if (unifiedAnalysis.lpPlusHedgeFinalPnl < unifiedAnalysis.lpOnlyFinalPnl) {
      const diff = unifiedAnalysis.lpOnlyFinalPnl - unifiedAnalysis.lpPlusHedgeFinalPnl;
      findings.push({
        type: 'warning',
        text: `LP solo superó a LP+Hedge por ${fmtUsdNeutral(diff)}. Los fees y falsas rupturas del hedge restaron valor.`,
      });
    }
  }

  // ── Detect upward breakout problem ──
  // When price goes above range, LP is 100% stablecoin — opening longs is unnecessary
  if (upsideTrades.length > 0 && hedgeTrades.length > 0) {
    const pctUpside = ((upsideTrades.length / hedgeTrades.length) * 100).toFixed(0);
    const upsideFees = upsideTrades.reduce((s, t) => s + t.fees, 0);
    const upsideNet = upsidePnl - upsideFees;
    if (upsideNet < -10 || Number(pctUpside) > 50) {
      findings.push({
        type: 'warning',
        text: `${upsideTrades.length} cobertura(s) abrieron long en ruptura al alza (${pctUpside}% de los trades). Resultado neto: ${fmtUsd(upsideNet)}.`,
      });
      findings.push({
        type: 'solution',
        text: `Solución: Configurar cobertura "solo hacia abajo". Cuando el precio sube arriba del rango, el LP ya está 100% en stablecoin — no hay exposición que cubrir. Operar en rupturas al alza no es cobertura, es especulación.`,
      });
      // Estimate savings
      if (downsideTrades.length > 0) {
        findings.push({
          type: 'solution',
          text: `Si solo se hubieran ejecutado coberturas hacia abajo: PnL hedge ${fmtUsd(downsidePnl)} vs actual ${fmtUsd(downsidePnl + upsidePnl)}. Ahorro estimado: ${fmtUsdNeutral(Math.abs(upsideNet))}.`,
        });
      }
    }
  }

  // False breakouts
  if (combinedStats.falseBreakoutRate > 50 && combinedStats.totalTrades > 0) {
    findings.push({
      type: 'warning',
      text: `${combinedStats.falseBreakoutRate.toFixed(0)}% de falsas rupturas. Muchos open/close rápidos acumulan fees sin beneficio.`,
    });
    findings.push({
      type: 'solution',
      text: 'Solución: Aumentar el debounce (más señales consecutivas antes de abrir) o el cooldown (más espera entre coberturas). Probá con debounce 5 y cooldown 600s.',
    });
  } else if (combinedStats.falseBreakoutRate > 0 && combinedStats.falseBreakoutRate <= 30) {
    findings.push({
      type: 'positive',
      text: `Solo ${combinedStats.falseBreakoutRate.toFixed(0)}% de falsas rupturas. Los parámetros de debounce filtran bien el ruido.`,
    });
  }

  // Funding cost is significant
  if (unifiedAnalysis && Math.abs(unifiedAnalysis.totalHedgeFunding) > 5 && hedgeTrades.length > 0) {
    const avgHoldHours = hedgeTrades.reduce((s, t) => s + (t.exitTime - t.entryTime), 0) / hedgeTrades.length / 3_600_000;
    if (avgHoldHours > 24) {
      findings.push({
        type: 'warning',
        text: `Costo de funding acumulado: ${fmtUsd(unifiedAnalysis.totalHedgeFunding)}. Las coberturas estuvieron abiertas ~${avgHoldHours.toFixed(0)}h en promedio.`,
      });
      findings.push({
        type: 'solution',
        text: 'Solución: Agregar trailing stop a los hedges para cerrar posiciones que no avanzan, reduciendo el tiempo abierto y el costo de funding.',
      });
    }
  }

  // Win rate
  if (combinedStats.totalTrades > 0 && combinedStats.winRate > 60) {
    findings.push({
      type: 'positive',
      text: `Tasa de acierto del ${combinedStats.winRate.toFixed(0)}% — la mayoría de las coberturas generaron ganancia.`,
    });
  }

  // IL is negligible
  if (Math.abs(lpMetrics.ilPercent) < 0.5 && combinedStats.totalTrades === 0) {
    findings.push({
      type: 'positive',
      text: 'IL prácticamente nulo. El precio se mantuvo dentro del rango — escenario ideal para LP.',
    });
  }

  if (findings.length === 0) return null;

  return (
    <Card className="border-muted">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Info className="size-4 text-blue-400" />
          Interpretación
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {findings.map((f, i) => (
          <div key={i} className="flex items-start gap-2.5 text-xs leading-relaxed">
            {f.type === 'positive' && (
              <CheckCircle2 className="size-3.5 text-green-400 mt-0.5 shrink-0" />
            )}
            {f.type === 'warning' && (
              <AlertTriangle className="size-3.5 text-orange-400 mt-0.5 shrink-0" />
            )}
            {f.type === 'neutral' && <Info className="size-3.5 text-blue-400 mt-0.5 shrink-0" />}
            {f.type === 'solution' && (
              <Lightbulb className="size-3.5 text-yellow-400 mt-0.5 shrink-0" />
            )}
            <span className={f.type === 'solution' ? 'text-foreground/80' : 'text-muted-foreground'}>
              {f.text}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─── Methodology card ─── */

function MethodologyCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-0">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center justify-between w-full"
        >
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BookOpen className="size-4 text-blue-400" />
            Cómo se calcula cada métrica
          </CardTitle>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="pt-4 space-y-4 text-xs text-muted-foreground leading-relaxed">
          {/* IL */}
          <div className="space-y-1">
            <p className="font-medium text-foreground">Impermanent Loss (IL)</p>
            <p>
              Calculado con la fórmula exacta de Uniswap V3 para liquidez concentrada. Dado un rango
              [Pa, Pb] y el precio actual P, se computan las cantidades de cada token que tendría la
              posición LP. La diferencia entre el valor de esos tokens vs simplemente holdear
              los tokens iniciales es el IL.
            </p>
            <p className="text-[11px] text-muted-foreground/60 font-mono">
              IL = Valor_LP(P) − Valor_HODL(P), donde Valor_LP usa las fórmulas √P de Uniswap V3
            </p>
          </div>

          {/* Fees */}
          <div className="space-y-1">
            <p className="font-medium text-foreground">Fees LP estimados</p>
            <p>
              Se estiman a partir del APR del pool (configurable, default 20%) prorrateado por el
              tiempo que el precio estuvo <strong>dentro del rango</strong>. Una posición fuera de
              rango no genera fees — por eso se muestra el &quot;% en rango&quot;.
            </p>
            <p className="text-[11px] text-muted-foreground/60 font-mono">
              Fees = Pool_USD × (APR/100) × (horas_en_rango / 8760)
            </p>
          </div>

          {/* Hedge PnL */}
          <div className="space-y-1">
            <p className="font-medium text-foreground">PnL de Coberturas</p>
            <p>
              Cada vez que el precio sale del rango (confirmado por {'"'}debounce{'"'} señales consecutivas),
              se abre un short en perpetuos. Cuando vuelve al rango, se cierra. El PnL es la
              diferencia de precio × tamaño de la posición.
            </p>
          </div>

          {/* Fees de trading */}
          <div className="space-y-1">
            <p className="font-medium text-foreground">Fees de trading</p>
            <p>
              Se estiman como 0.035% (taker fee de Hyperliquid) sobre el nocional de cada
              apertura y cierre de posición.
            </p>
          </div>

          {/* Funding */}
          <div className="space-y-1">
            <p className="font-medium text-foreground">Costo de Funding</p>
            <p>
              Los perpetuos cobran un &quot;funding rate&quot; cada 8 horas. En condiciones normales
              (contango), los shorts pagan a los longs. Se usa una tasa promedio de 0.01% cada 8h.
              Este costo se acumula por el tiempo que el hedge permanece abierto.
            </p>
            <p className="text-[11px] text-muted-foreground/60 font-mono">
              Funding = Nocional_promedio × tasa_por_hora × horas_abierto (negativo para shorts)
            </p>
          </div>

          {/* Efectividad */}
          <div className="space-y-1">
            <p className="font-medium text-foreground">Efectividad de cobertura</p>
            <p>
              Mide cuánto del IL fue compensado por las ganancias netas del hedge (después de
              descontar fees y funding). Un valor {'>'}1x significa que el hedge cubrió más que el IL.
              El &quot;IL cubierto&quot; muestra este ratio como porcentaje del IL total del período.
            </p>
          </div>

          {/* Data source */}
          <div className="border-t border-border/30 pt-3 space-y-1">
            <p className="font-medium text-foreground">Fuente de datos</p>
            <p>
              Precios históricos reales (velas de 1 minuto). Los presets usan datos pre-cacheados.
              Las búsquedas personalizadas consultan Binance, Bybit o CryptoCompare según
              disponibilidad geográfica.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Trade table (matches History page pattern) ─── */

function TradeTable({ trades, isHedge }: { trades: Trade[]; isHedge: (t: Trade) => boolean }) {
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
