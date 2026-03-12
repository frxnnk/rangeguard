export interface Trade {
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  fees: number;
  fundingPnl: number; // funding rate cost (negative = paid, positive = received)
  entryTime: number;
  exitTime: number;
  closeReason: string;
  isFalseBreakout: boolean;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
}

export interface BacktestStats {
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
  equityCurve: EquityPoint[];
}

/**
 * Analyze a set of completed trades and produce statistics.
 */
export function analyze(trades: Trade[], initialEquity: number = 10_000): BacktestStats {
  if (trades.length === 0) {
    return emptyStats(initialEquity);
  }

  const winTrades = trades.filter((t) => t.pnl > 0);
  const lossTrades = trades.filter((t) => t.pnl <= 0);
  const falseBreakouts = trades.filter((t) => t.isFalseBreakout);

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalFees = trades.reduce((s, t) => s + t.fees, 0);
  const totalFunding = trades.reduce((s, t) => s + t.fundingPnl, 0);
  const netPnl = totalPnl - totalFees + totalFunding;

  const grossWins = winTrades.reduce((s, t) => s + t.pnl, 0);
  const grossLosses = Math.abs(lossTrades.reduce((s, t) => s + t.pnl, 0));

  // Equity curve
  const equityCurve: EquityPoint[] = [{ timestamp: trades[0].entryTime, equity: initialEquity }];
  let equity = initialEquity;
  for (const trade of trades) {
    equity += trade.pnl - trade.fees + trade.fundingPnl;
    equityCurve.push({ timestamp: trade.exitTime, equity });
  }

  // Max drawdown
  let peak = initialEquity;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const dd = peak - point.equity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPercent = (dd / peak) * 100;
    }
  }

  // Sharpe ratio (daily returns approximation)
  const returns = trades.map((t) => (t.pnl - t.fees + t.fundingPnl) / initialEquity);
  const sharpeRatio = computeSharpe(returns);

  // Average holding time
  const avgHoldingTimeMs =
    trades.reduce((s, t) => s + (t.exitTime - t.entryTime), 0) / trades.length;

  return {
    totalTrades: trades.length,
    wins: winTrades.length,
    losses: lossTrades.length,
    winRate: (winTrades.length / trades.length) * 100,
    totalPnl,
    totalFees,
    netPnl,
    avgPnl: netPnl / trades.length,
    avgWin: winTrades.length > 0 ? grossWins / winTrades.length : 0,
    avgLoss: lossTrades.length > 0 ? -grossLosses / lossTrades.length : 0,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0,
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio,
    falseBreakouts: falseBreakouts.length,
    falseBreakoutRate:
      trades.length > 0 ? (falseBreakouts.length / trades.length) * 100 : 0,
    avgHoldingTimeMs,
    equityCurve,
  };
}

function computeSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;

  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);

  if (std === 0) return 0;

  // Annualize: assume ~8760 trades/year (hourly-ish frequency)
  const annualizationFactor = Math.sqrt(Math.min(returns.length * 12, 8760));
  return (mean / std) * annualizationFactor;
}

function emptyStats(initialEquity: number): BacktestStats {
  return {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalPnl: 0,
    totalFees: 0,
    netPnl: 0,
    avgPnl: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    sharpeRatio: 0,
    falseBreakouts: 0,
    falseBreakoutRate: 0,
    avgHoldingTimeMs: 0,
    equityCurve: [{ timestamp: Date.now(), equity: initialEquity }],
  };
}
