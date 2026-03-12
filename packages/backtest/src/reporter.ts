import { writeFileSync } from 'fs';
import type { BacktestStats } from './analyzer.js';
import type { BacktestConfig } from './orchestrator.js';
import type { UnifiedAnalysis } from './unified-analysis.js';

export interface ReportData {
  config: BacktestConfig;
  hedgeStats: BacktestStats;
  rangeStats: BacktestStats;
  combinedStats: BacktestStats;
  startTime: number;
  endTime: number;
  pricePoints: number;
  unifiedAnalysis?: UnifiedAnalysis;
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
    lines.push(
      `- **Total Trades**: ${hedgeStats.totalTrades} (${hedgeStats.wins}W / ${hedgeStats.losses}L)`,
    );
    lines.push(`- **Avg Win**: $${hedgeStats.avgWin.toFixed(2)}`);
    lines.push(`- **Avg Loss**: $${hedgeStats.avgLoss.toFixed(2)}`);
    lines.push(
      `- **False Breakouts**: ${hedgeStats.falseBreakouts} (${hedgeStats.falseBreakoutRate.toFixed(1)}%)`,
    );
    lines.push(`- **Avg Holding Time**: ${fmtDuration(hedgeStats.avgHoldingTimeMs)}`);
    lines.push('');
  }

  // Range trading details
  if (rangeStats.totalTrades > 0) {
    lines.push('## Range Trading Strategy');
    lines.push('');
    lines.push(
      `- **Total Trades**: ${rangeStats.totalTrades} (${rangeStats.wins}W / ${rangeStats.losses}L)`,
    );
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

  // ── Hedge vs IL Analysis ──────────────────────────────────────
  if (data.unifiedAnalysis) {
    const ua = data.unifiedAnalysis;
    lines.push('## Hedge vs Impermanent Loss');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total IL (full period) | $${ua.totalIl.toFixed(2)} |`);
    lines.push(`| LP fees earned | $${ua.totalLpFees.toFixed(2)} |`);
    lines.push(`| IL during active hedges | $${ua.totalIlDuringHedges.toFixed(2)} |`);
    lines.push(`| Total Hedge PnL | $${ua.totalHedgePnl.toFixed(2)} |`);
    lines.push(`| Hedge fees | $${ua.totalHedgeFees.toFixed(2)} |`);
    lines.push(`| Funding costs | $${ua.totalHedgeFunding.toFixed(2)} |`);
    lines.push(`| Net hedge effect | $${ua.netHedgeEffect.toFixed(2)} |`);
    lines.push(
      `| Hedging effectiveness | ${ua.hedgingEffectivenessRatio.toFixed(2)}x ${ua.hedgingEffectivenessRatio >= 1 ? '(hedge covers IL)' : '(partial coverage)'} |`,
    );
    lines.push(`| IL covered by hedges | ${ua.ilCoveredPercent.toFixed(1)}% |`);
    lines.push('');

    // Per-trade correlation table
    if (ua.correlations.length > 0) {
      lines.push('### Per-trade IL Correlation');
      lines.push('');
      lines.push('| # | Side | Entry | Exit | Hedge PnL | IL during hedge | Net Effect | Effectiveness |');
      lines.push('|---|------|-------|------|-----------|-----------------|------------|---------------|');
      for (const c of ua.correlations) {
        lines.push(
          `| ${c.tradeIndex} | ${c.side} | $${c.entryPrice.toFixed(2)} | $${c.exitPrice.toFixed(2)} | $${c.hedgePnl.toFixed(2)} | $${c.ilDuringHedge.toFixed(2)} | $${c.netEffect.toFixed(2)} | ${c.hedgeEffectiveness.toFixed(2)}x |`,
        );
      }
      lines.push('');
    }

    // Strategy comparison
    lines.push('### Strategy Comparison');
    lines.push('');
    lines.push('| Strategy | Final PnL |');
    lines.push('|----------|-----------|');
    lines.push(`| HODL only | $${ua.hodlFinalPnl.toFixed(2)} |`);
    lines.push(`| LP only (fees - IL) | $${ua.lpOnlyFinalPnl.toFixed(2)} |`);
    lines.push(`| **LP + Hedge** | **$${ua.lpPlusHedgeFinalPnl.toFixed(2)}** |`);
    lines.push('');

    // Three-line equity curve
    if (ua.equityCurve.length > 2) {
      lines.push('### Equity Curves: LP Only vs LP+Hedge vs HODL');
      lines.push('');
      lines.push(renderMultiEquityCurve(ua.equityCurve));
      lines.push('');
    }
  }

  // Equity curve as simple ASCII (hedge trades only)
  if (combinedStats.equityCurve.length > 2) {
    lines.push('## Hedge Trades Equity Curve');
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
    let line =
      row === height - 1
        ? `$${max.toFixed(0).padStart(7)} `
        : row === 0
          ? `$${min.toFixed(0).padStart(7)} `
          : '         ';
    for (const val of sampled) {
      const normalizedRow = Math.round(((val - min) / range) * (height - 1));
      line += normalizedRow >= row ? '#' : ' ';
    }
    lines.push(line);
  }

  return '```\n' + lines.join('\n') + '\n```';
}

function renderMultiEquityCurve(
  curve: Array<{ timestamp: number; lpOnly: number; lpPlusHedge: number; hodl: number }>,
): string {
  const width = 60;
  const height = 15;

  // Downsample
  const step = Math.max(1, Math.floor(curve.length / width));
  const sampled: Array<{ lpOnly: number; lpPlusHedge: number; hodl: number }> = [];
  for (let i = 0; i < curve.length; i += step) {
    sampled.push(curve[i]);
  }
  if (sampled.length > width) sampled.length = width;

  // Find global min/max across all three series
  const allValues = sampled.flatMap((p) => [p.lpOnly, p.lpPlusHedge, p.hodl]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const normalize = (v: number) => Math.round(((v - min) / range) * (height - 1));

  // Build chart with 3 markers: L=lpOnly, H=lp+hedge, D=hodl
  const lines: string[] = [];
  for (let row = height - 1; row >= 0; row--) {
    let line =
      row === height - 1
        ? `$${max.toFixed(0).padStart(7)} `
        : row === 0
          ? `$${min.toFixed(0).padStart(7)} `
          : '         ';
    for (const pt of sampled) {
      const lp = normalize(pt.lpOnly);
      const hedge = normalize(pt.lpPlusHedge);
      const hodl = normalize(pt.hodl);

      if (hedge === row && lp === row) line += '*'; // overlap LP+hedge
      else if (hedge === row) line += '#'; // LP+Hedge
      else if (lp === row) line += '.'; // LP only
      else if (hodl === row) line += '-'; // HODL
      else line += ' ';
    }
    lines.push(line);
  }

  lines.push('         ' + 'Legend: # = LP+Hedge  . = LP only  - = HODL  * = overlap');

  return '```\n' + lines.join('\n') + '\n```';
}
