import { writeFileSync } from 'fs';
import type { BacktestStats } from './analyzer.js';
import type { BacktestConfig } from './orchestrator.js';

export interface ReportData {
  config: BacktestConfig;
  hedgeStats: BacktestStats;
  rangeStats: BacktestStats;
  combinedStats: BacktestStats;
  startTime: number;
  endTime: number;
  pricePoints: number;
}

/**
 * Generate a markdown report from backtest results.
 */
export function generateMarkdownReport(data: ReportData): string {
  const { config, hedgeStats, rangeStats, combinedStats, startTime, endTime, pricePoints } = data;

  const start = new Date(startTime).toISOString().split('T')[0];
  const end = new Date(endTime).toISOString().split('T')[0];
  const daysSpan = Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000));

  const lines: string[] = [
    `# Backtest Report: ${config.pair}`,
    '',
    `**Period**: ${start} to ${end} (${daysSpan} days, ${pricePoints.toLocaleString()} data points)`,
    `**Range**: $${config.rangeLower} - $${config.rangeUpper}`,
    `**Pool Amount**: $${config.poolAmountUsd.toLocaleString()}`,
    `**Hedge Ratio**: ${config.hedgeRatio}x`,
    `**Leverage**: ${config.leverage}x`,
    `**Debounce**: ${config.debounceCount} ticks`,
    `**Cooldown**: ${config.cooldownSeconds}s`,
    '',
  ];

  // Combined summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Hedge | Range Trading | Combined |`);
  lines.push(`|--------|-------|---------------|----------|`);
  lines.push(
    `| Trades | ${hedgeStats.totalTrades} | ${rangeStats.totalTrades} | ${combinedStats.totalTrades} |`,
  );
  lines.push(
    `| Win Rate | ${hedgeStats.winRate.toFixed(1)}% | ${rangeStats.winRate.toFixed(1)}% | ${combinedStats.winRate.toFixed(1)}% |`,
  );
  lines.push(
    `| Net PnL | $${hedgeStats.netPnl.toFixed(2)} | $${rangeStats.netPnl.toFixed(2)} | $${combinedStats.netPnl.toFixed(2)} |`,
  );
  lines.push(
    `| Total Fees | $${hedgeStats.totalFees.toFixed(2)} | $${rangeStats.totalFees.toFixed(2)} | $${combinedStats.totalFees.toFixed(2)} |`,
  );
  lines.push(
    `| Profit Factor | ${fmtPF(hedgeStats.profitFactor)} | ${fmtPF(rangeStats.profitFactor)} | ${fmtPF(combinedStats.profitFactor)} |`,
  );
  lines.push(
    `| Sharpe Ratio | ${hedgeStats.sharpeRatio.toFixed(2)} | ${rangeStats.sharpeRatio.toFixed(2)} | ${combinedStats.sharpeRatio.toFixed(2)} |`,
  );
  lines.push(
    `| Max Drawdown | $${hedgeStats.maxDrawdown.toFixed(2)} (${hedgeStats.maxDrawdownPercent.toFixed(1)}%) | $${rangeStats.maxDrawdown.toFixed(2)} (${rangeStats.maxDrawdownPercent.toFixed(1)}%) | $${combinedStats.maxDrawdown.toFixed(2)} (${combinedStats.maxDrawdownPercent.toFixed(1)}%) |`,
  );
  lines.push('');

  // Hedge details
  if (hedgeStats.totalTrades > 0) {
    lines.push('## Hedge Strategy');
    lines.push('');
    lines.push(`- **Total Trades**: ${hedgeStats.totalTrades} (${hedgeStats.wins}W / ${hedgeStats.losses}L)`);
    lines.push(`- **Avg Win**: $${hedgeStats.avgWin.toFixed(2)}`);
    lines.push(`- **Avg Loss**: $${hedgeStats.avgLoss.toFixed(2)}`);
    lines.push(`- **False Breakouts**: ${hedgeStats.falseBreakouts} (${hedgeStats.falseBreakoutRate.toFixed(1)}%)`);
    lines.push(`- **Avg Holding Time**: ${fmtDuration(hedgeStats.avgHoldingTimeMs)}`);
    lines.push('');
  }

  // Range trading details
  if (rangeStats.totalTrades > 0) {
    lines.push('## Range Trading Strategy');
    lines.push('');
    lines.push(`- **Total Trades**: ${rangeStats.totalTrades} (${rangeStats.wins}W / ${rangeStats.losses}L)`);
    lines.push(`- **Avg Win**: $${rangeStats.avgWin.toFixed(2)}`);
    lines.push(`- **Avg Loss**: $${rangeStats.avgLoss.toFixed(2)}`);
    lines.push(`- **Avg Holding Time**: ${fmtDuration(rangeStats.avgHoldingTimeMs)}`);
    lines.push('');
  }

  // Configuration details
  if (config.trading?.enabled) {
    lines.push('## Range Trading Config');
    lines.push('');
    lines.push(`- Leverage: ${config.trading.leverage}x`);
    lines.push(`- Stop Loss: ${config.trading.stopLossPercent}%`);
    lines.push(`- Trailing Stop: ${config.trading.trailingPercent}%`);
    lines.push(`- Entry Zone: ${config.trading.entryZonePercent}%`);
    lines.push(`- Max Size: $${config.trading.maxSizeUsd}`);
    lines.push('');
  }

  // Equity curve as simple ASCII
  if (combinedStats.equityCurve.length > 2) {
    lines.push('## Equity Curve');
    lines.push('');
    lines.push(renderAsciiEquityCurve(combinedStats.equityCurve));
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated ${new Date().toISOString()}*`);

  return lines.join('\n');
}

/**
 * Write report to file.
 */
export function writeReport(filePath: string, content: string): void {
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Generate a JSON report (for programmatic consumption).
 */
export function generateJsonReport(data: ReportData): string {
  return JSON.stringify(data, null, 2);
}

function fmtPF(pf: number): string {
  if (!isFinite(pf)) return 'Inf';
  return pf.toFixed(2);
}

function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function renderAsciiEquityCurve(curve: Array<{ timestamp: number; equity: number }>): string {
  const width = 60;
  const height = 15;

  const equities = curve.map((p) => p.equity);
  const min = Math.min(...equities);
  const max = Math.max(...equities);
  const range = max - min || 1;

  // Downsample to width
  const step = Math.max(1, Math.floor(curve.length / width));
  const sampled: number[] = [];
  for (let i = 0; i < curve.length; i += step) {
    sampled.push(curve[i].equity);
  }
  if (sampled.length > width) sampled.length = width;

  // Build chart
  const lines: string[] = [];
  for (let row = height - 1; row >= 0; row--) {
    const threshold = min + (range * row) / (height - 1);
    let line = row === height - 1 ? `$${max.toFixed(0).padStart(7)} ` : row === 0 ? `$${min.toFixed(0).padStart(7)} ` : '         ';
    for (const val of sampled) {
      const normalizedRow = Math.round(((val - min) / range) * (height - 1));
      line += normalizedRow >= row ? '#' : ' ';
    }
    lines.push(line);
  }

  return '```\n' + lines.join('\n') + '\n```';
}
