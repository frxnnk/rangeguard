import { describe, it, expect } from 'vitest';
import { analyze, type Trade } from './analyzer.js';

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    side: 'short',
    entryPrice: 2000,
    exitPrice: 1950,
    size: 1,
    pnl: 50,
    fees: 0.5,
    entryTime: 1000,
    exitTime: 2000,
    closeReason: 'range_return',
    isFalseBreakout: false,
    ...overrides,
  };
}

describe('analyze', () => {
  it('should return empty stats for no trades', () => {
    const stats = analyze([]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.totalPnl).toBe(0);
    expect(stats.netPnl).toBe(0);
    expect(stats.sharpeRatio).toBe(0);
    expect(stats.maxDrawdown).toBe(0);
    expect(stats.equityCurve).toHaveLength(1);
  });

  it('should compute basic stats for a single winning trade', () => {
    const trade = makeTrade({ pnl: 100, fees: 1 });
    const stats = analyze([trade]);

    expect(stats.totalTrades).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(0);
    expect(stats.winRate).toBe(100);
    expect(stats.totalPnl).toBe(100);
    expect(stats.totalFees).toBe(1);
    expect(stats.netPnl).toBe(99);
    expect(stats.avgPnl).toBe(99);
    expect(stats.avgWin).toBe(100);
    expect(stats.avgLoss).toBe(0);
  });

  it('should compute stats for mixed winning and losing trades', () => {
    const trades = [
      makeTrade({ pnl: 100, fees: 1, entryTime: 1000, exitTime: 2000 }),
      makeTrade({ pnl: -30, fees: 0.5, entryTime: 3000, exitTime: 4000 }),
      makeTrade({ pnl: 50, fees: 0.8, entryTime: 5000, exitTime: 6000 }),
    ];

    const stats = analyze(trades);

    expect(stats.totalTrades).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBeCloseTo(66.67, 1);
    expect(stats.totalPnl).toBe(120);
    expect(stats.totalFees).toBe(2.3);
    expect(stats.netPnl).toBeCloseTo(117.7);
    expect(stats.avgWin).toBe(75); // (100 + 50) / 2
    expect(stats.avgLoss).toBe(-30); // |-30| / 1 = 30, negated
  });

  it('should compute profit factor correctly', () => {
    const trades = [makeTrade({ pnl: 100, fees: 0 }), makeTrade({ pnl: -50, fees: 0 })];
    const stats = analyze(trades);
    expect(stats.profitFactor).toBe(2); // 100 / 50
  });

  it('should return Infinity profit factor when no losses', () => {
    const trades = [makeTrade({ pnl: 100, fees: 0 })];
    const stats = analyze(trades);
    expect(stats.profitFactor).toBe(Infinity);
  });

  it('should compute max drawdown', () => {
    const trades = [
      makeTrade({ pnl: 100, fees: 0, entryTime: 1000, exitTime: 2000 }),
      makeTrade({ pnl: -200, fees: 0, entryTime: 3000, exitTime: 4000 }),
      makeTrade({ pnl: 50, fees: 0, entryTime: 5000, exitTime: 6000 }),
    ];

    const stats = analyze(trades, 10_000);

    // Equity curve: 10000 -> 10100 -> 9900 -> 9950
    // Peak was 10100, lowest after peak was 9900 => DD = 200
    expect(stats.maxDrawdown).toBe(200);
    expect(stats.maxDrawdownPercent).toBeCloseTo((200 / 10100) * 100, 1);
  });

  it('should build equity curve correctly', () => {
    const trades = [
      makeTrade({ pnl: 50, fees: 1, entryTime: 1000, exitTime: 2000 }),
      makeTrade({ pnl: -20, fees: 0.5, entryTime: 3000, exitTime: 4000 }),
    ];

    const stats = analyze(trades, 10_000);

    expect(stats.equityCurve).toHaveLength(3); // initial + 2 trades
    expect(stats.equityCurve[0].equity).toBe(10_000);
    expect(stats.equityCurve[1].equity).toBe(10_049); // +50 -1
    expect(stats.equityCurve[2].equity).toBe(10_028.5); // +50-1-20-0.5
  });

  it('should track false breakouts', () => {
    const trades = [
      makeTrade({ isFalseBreakout: true }),
      makeTrade({ isFalseBreakout: false }),
      makeTrade({ isFalseBreakout: true }),
    ];

    const stats = analyze(trades);

    expect(stats.falseBreakouts).toBe(2);
    expect(stats.falseBreakoutRate).toBeCloseTo(66.67, 1);
  });

  it('should compute average holding time', () => {
    const trades = [
      makeTrade({ entryTime: 0, exitTime: 1000 }),
      makeTrade({ entryTime: 2000, exitTime: 5000 }),
    ];

    const stats = analyze(trades);
    expect(stats.avgHoldingTimeMs).toBe(2000); // (1000 + 3000) / 2
  });

  it('should compute sharpe ratio as 0 for single trade', () => {
    const stats = analyze([makeTrade()]);
    expect(stats.sharpeRatio).toBe(0);
  });

  it('should compute positive sharpe for consistently profitable trades', () => {
    const trades = Array.from({ length: 10 }, (_, i) =>
      makeTrade({ pnl: 10 + i, fees: 0, entryTime: i * 1000, exitTime: i * 1000 + 500 }),
    );

    const stats = analyze(trades);
    expect(stats.sharpeRatio).toBeGreaterThan(0);
  });

  it('should respect custom initial equity', () => {
    const stats = analyze([], 5000);
    expect(stats.equityCurve[0].equity).toBe(5000);
  });
});
