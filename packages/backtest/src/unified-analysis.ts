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
  hedgeFunding: number; // funding rate PnL (negative = cost)
  ilDuringHedge: number; // IL delta during [entryTime, exitTime] (≤ 0 if price moved)
  netEffect: number; // hedgePnl + ilDuringHedge - fees + funding (positive = hedge helped)
  hedgeEffectiveness: number; // (hedgePnl - fees + funding) / abs(ilDuringHedge) — >1 means over-hedged
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
  totalHedgeFunding: number; // total funding PnL across all hedges
  netHedgeEffect: number;
  hedgingEffectivenessRatio: number; // net hedge gain / abs(totalIlDuringHedges)
  ilCoveredPercent: number; // % of total IL offset by hedges (after fees+funding)

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
    const hedgeFunding = trade.fundingPnl;
    // Net effect includes IL offset + all hedge costs
    const hedgeNetGain = hedgePnl - hedgeFees + hedgeFunding;
    const netEffect = hedgeNetGain + ilDuringHedge;

    const absIl = Math.abs(ilDuringHedge);
    const hedgeEffectiveness = absIl > 0.01 ? hedgeNetGain / absIl : 0;

    return {
      tradeIndex: i + 1,
      side: trade.side,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      hedgePnl,
      hedgeFees,
      hedgeFunding,
      ilDuringHedge,
      netEffect,
      hedgeEffectiveness,
    };
  });

  // ── Aggregates ────────────────────────────────────────────────
  const totalIlDuringHedges = correlations.reduce((s, c) => s + c.ilDuringHedge, 0);
  const totalHedgePnl = correlations.reduce((s, c) => s + c.hedgePnl, 0);
  const totalHedgeFees = correlations.reduce((s, c) => s + c.hedgeFees, 0);
  const totalHedgeFunding = correlations.reduce((s, c) => s + c.hedgeFunding, 0);
  const hedgeNetGain = totalHedgePnl - totalHedgeFees + totalHedgeFunding;
  const netHedgeEffect = hedgeNetGain + totalIlDuringHedges;

  const absIlDuringHedges = Math.abs(totalIlDuringHedges);
  const hedgingEffectivenessRatio = absIlDuringHedges > 0.01 ? hedgeNetGain / absIlDuringHedges : 0;

  // IL covered: only meaningful when net hedge gain offsets IL losses
  const absTotalIl = Math.abs(lpMetrics.totalIL);
  let ilCoveredPercent = 0;
  if (hedgeNetGain > 0 && absTotalIl > 0.01) {
    ilCoveredPercent = Math.min((hedgeNetGain / absTotalIl) * 100, 999);
  }

  // ── Final PnL comparison ─────────────────────────────────────
  const lpOnlyFinalPnl = lpMetrics.netLpPnl;
  const lpPlusHedgeFinalPnl = lpOnlyFinalPnl + hedgeNetGain;

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
    totalHedgeFunding,
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
      const t = sortedTrades[tradeIdx];
      cumulativeHedgePnl += t.pnl - t.fees + t.fundingPnl;
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
