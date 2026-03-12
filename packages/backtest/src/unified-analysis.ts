/**
 * Unified analysis: correlates hedge trade PnL with LP impermanent loss.
 * Proves (or disproves) that hedging with perpetual futures offsets IL.
 */

import type { Trade } from './analyzer.js';
import type { LpMetrics } from './lp-simulator.js';
import { calculateLiquidity, tokenAmounts, positionValue } from './lp-simulator.js';

// ── Types ───────────────────────────────────────────────────────────

export interface HedgeIlCorrelation {
  tradeIndex: number;
  side: 'long' | 'short';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  hedgePnl: number;
  hedgeFees: number;
  ilDuringHedge: number; // IL delta during [entryTime, exitTime] (≤ 0 if price moved)
  netEffect: number; // hedgePnl + ilDuringHedge (positive = hedge helped)
  hedgeEffectiveness: number; // hedgePnl / abs(ilDuringHedge) — >1 means over-hedged
}

export interface EquityCurvePoint {
  timestamp: number;
  lpOnly: number; // LP net PnL (IL + fees) relative to start
  lpPlusHedge: number; // LP + cumulative hedge PnL
  hodl: number; // HODL PnL relative to start
}

export interface UnifiedAnalysis {
  // Per-trade correlation
  correlations: HedgeIlCorrelation[];

  // Aggregate hedge effectiveness
  totalIlDuringHedges: number;
  totalHedgePnl: number;
  totalHedgeFees: number;
  netHedgeEffect: number;
  hedgingEffectivenessRatio: number; // totalHedgePnl / abs(totalIlDuringHedges)
  ilCoveredPercent: number; // % of total IL offset by hedges

  // Full-period LP metrics
  totalIl: number;
  totalLpFees: number;

  // Final PnL comparison (all relative to starting value)
  lpOnlyFinalPnl: number; // LP position: IL + fees
  lpPlusHedgeFinalPnl: number; // LP + hedge net PnL
  hodlFinalPnl: number; // pure HODL change

  // Equity curves
  equityCurve: EquityCurvePoint[];
}

// ── Helpers ─────────────────────────────────────────────────────────

interface PricePoint {
  timestamp: number;
  price: number;
}

/**
 * Compute IL at a given price relative to entry (always ≤ 0).
 */
function computeIlAtPrice(
  L: number,
  currentPrice: number,
  entryPrice: number,
  rangeLower: number,
  rangeUpper: number,
): number {
  const currentValue = positionValue(L, currentPrice, rangeLower, rangeUpper);
  const initial = tokenAmounts(L, entryPrice, rangeLower, rangeUpper);
  const hodlValue = initial.amount0 * currentPrice + initial.amount1;
  return currentValue - hodlValue;
}

// ── Main Analysis ───────────────────────────────────────────────────

export function analyzeUnified(
  hedgeTrades: Trade[],
  lpMetrics: LpMetrics,
  prices: PricePoint[],
  config: {
    rangeLower: number;
    rangeUpper: number;
    poolAmountUsd: number;
    entryPrice: number;
  },
): UnifiedAnalysis {
  const { rangeLower, rangeUpper, poolAmountUsd, entryPrice } = config;

  const L = calculateLiquidity(poolAmountUsd, entryPrice, rangeLower, rangeUpper);

  // ── Per-trade IL correlation ──────────────────────────────────
  const correlations: HedgeIlCorrelation[] = hedgeTrades.map((trade, i) => {
    // Use the trade's own entry/exit prices (not timestamp lookup)
    // because DryRunClient trades resolve within the same candle
    const ilAtEntry = computeIlAtPrice(L, trade.entryPrice, entryPrice, rangeLower, rangeUpper);
    const ilAtExit = computeIlAtPrice(L, trade.exitPrice, entryPrice, rangeLower, rangeUpper);

    // IL delta: how much IL changed during this hedge window
    const ilDuringHedge = ilAtExit - ilAtEntry;

    const hedgePnl = trade.pnl;
    const hedgeFees = trade.fees;
    const netEffect = hedgePnl + ilDuringHedge;

    const absIl = Math.abs(ilDuringHedge);
    const hedgeEffectiveness = absIl > 0.01 ? hedgePnl / absIl : 0;

    return {
      tradeIndex: i + 1,
      side: trade.side,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      hedgePnl,
      hedgeFees,
      ilDuringHedge,
      netEffect,
      hedgeEffectiveness,
    };
  });

  // ── Aggregates ────────────────────────────────────────────────
  const totalIlDuringHedges = correlations.reduce((s, c) => s + c.ilDuringHedge, 0);
  const totalHedgePnl = correlations.reduce((s, c) => s + c.hedgePnl, 0);
  const totalHedgeFees = correlations.reduce((s, c) => s + c.hedgeFees, 0);
  const netHedgeEffect = totalHedgePnl + totalIlDuringHedges;

  const absIlDuringHedges = Math.abs(totalIlDuringHedges);
  const hedgingEffectivenessRatio = absIlDuringHedges > 0.01 ? totalHedgePnl / absIlDuringHedges : 0;

  // IL covered: only meaningful when hedge gains offset IL losses
  // If hedge PnL is negative, it didn't cover any IL
  const absTotalIl = Math.abs(lpMetrics.totalIL);
  let ilCoveredPercent = 0;
  if (totalHedgePnl > 0 && absTotalIl > 0.01) {
    ilCoveredPercent = Math.min((totalHedgePnl / absTotalIl) * 100, 999);
  }

  // ── Final PnL comparison ─────────────────────────────────────
  const lpOnlyFinalPnl = lpMetrics.netLpPnl;
  const hedgeNetPnl = totalHedgePnl - totalHedgeFees;
  const lpPlusHedgeFinalPnl = lpOnlyFinalPnl + hedgeNetPnl;

  const initial = tokenAmounts(L, entryPrice, rangeLower, rangeUpper);
  const startValue = initial.amount0 * entryPrice + initial.amount1;
  const hodlFinalPnl = lpMetrics.hodlValueEnd - startValue;

  // ── Equity curves ────────────────────────────────────────────
  const equityCurve = buildEquityCurve(lpMetrics, hedgeTrades, prices, L, config);

  return {
    correlations,
    totalIlDuringHedges,
    totalHedgePnl,
    totalHedgeFees,
    netHedgeEffect,
    hedgingEffectivenessRatio,
    ilCoveredPercent,
    totalIl: lpMetrics.totalIL,
    totalLpFees: lpMetrics.totalFees,
    lpOnlyFinalPnl,
    lpPlusHedgeFinalPnl,
    hodlFinalPnl,
    equityCurve,
  };
}

/**
 * Build 3-line equity curve: LP-only, LP+Hedge, HODL.
 * Uses LP snapshots as the time axis and overlays cumulative hedge PnL.
 */
function buildEquityCurve(
  lpMetrics: LpMetrics,
  hedgeTrades: Trade[],
  _prices: PricePoint[],
  _L: number,
  _config: { rangeLower: number; rangeUpper: number; poolAmountUsd: number; entryPrice: number },
): EquityCurvePoint[] {
  const snapshots = lpMetrics.snapshots;
  if (snapshots.length === 0) return [];

  // Sort hedge trades by exit time for cumulative PnL
  const sortedTrades = [...hedgeTrades].sort((a, b) => a.exitTime - b.exitTime);

  const curve: EquityCurvePoint[] = [];
  let tradeIdx = 0;
  let cumulativeHedgePnl = 0;

  for (const snap of snapshots) {
    // Accumulate hedge PnL for trades closed before this snapshot
    while (tradeIdx < sortedTrades.length && sortedTrades[tradeIdx].exitTime <= snap.timestamp) {
      cumulativeHedgePnl += sortedTrades[tradeIdx].pnl - sortedTrades[tradeIdx].fees;
      tradeIdx++;
    }

    const startValue = lpMetrics.positionValueStart;

    curve.push({
      timestamp: snap.timestamp,
      lpOnly: snap.netLpPnl, // IL + fees
      lpPlusHedge: snap.netLpPnl + cumulativeHedgePnl,
      hodl: snap.hodlValue - startValue,
    });
  }

  return curve;
}
