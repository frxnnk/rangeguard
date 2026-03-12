import {
  fetchBinanceKlinesCached,
  candlesToPrices,
  runBacktest,
  analyze,
  simulateLp,
  analyzeUnified,
} from '../packages/backtest/src/index.js';

const PRESETS = [
  { name: 'FTX Crash (Nov 2022)', pair: 'ETH/USDC', rangeLower: 1400, rangeUpper: 1600, start: '2022-11-07', end: '2022-11-20' },
  { name: 'Rally ETH (Feb 2024)', pair: 'ETH/USDC', rangeLower: 2200, rangeUpper: 2800, start: '2024-02-01', end: '2024-03-01' },
  { name: 'Corrección Abr 2024', pair: 'ETH/USDC', rangeLower: 3200, rangeUpper: 3800, start: '2024-04-10', end: '2024-04-25' },
  { name: 'Mercado lateral (Jun 2024)', pair: 'ETH/USDC', rangeLower: 3300, rangeUpper: 3900, start: '2024-06-05', end: '2024-06-20' },
  { name: 'Falsas rupturas (Abr 2024)', pair: 'ETH/USDC', rangeLower: 3000, rangeUpper: 3800, start: '2024-04-01', end: '2024-05-15' },
];

const cacheDir = 'packages/dashboard/data/price-cache';

async function main() {
  for (const p of PRESETS) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`  ${p.name}`);
    console.log(`  ${p.pair} | Rango: $${p.rangeLower}-$${p.rangeUpper} | ${p.start} → ${p.end}`);
    console.log(`${'═'.repeat(80)}`);

    const symbol = p.pair.replace('/', '').replace(/USDC$/, 'USDT');
    const startTime = new Date(p.start).getTime();
    const endTime = new Date(p.end).getTime();
    const candles = await fetchBinanceKlinesCached(symbol, startTime, endTime, cacheDir);
    const prices = candlesToPrices(candles);

    const config = {
      pair: p.pair,
      hedgeAsset: 'ETH',
      rangeLower: p.rangeLower,
      rangeUpper: p.rangeUpper,
      poolAmountUsd: 10000,
      leverage: 10,
      hedgeRatio: 1.0,
      debounceCount: 3,
      cooldownSeconds: 300,
    };

    const result = await runBacktest(prices, config);
    const hedgeStats = analyze(result.hedgeTrades);
    const combinedStats = analyze([...result.hedgeTrades, ...result.rangeTrades]);

    const lpMetrics = simulateLp(
      { poolAmountUsd: 10000, rangeLower: p.rangeLower, rangeUpper: p.rangeUpper, entryPrice: prices[0].price, feeAprPercent: 20 },
      prices,
    );

    const unified = analyzeUnified(result.hedgeTrades, lpMetrics, prices, {
      rangeLower: p.rangeLower, rangeUpper: p.rangeUpper, poolAmountUsd: 10000, entryPrice: prices[0].price,
    });

    // Price analysis
    const firstPrice = prices[0].price;
    const lastPrice = prices[prices.length - 1].price;
    const minPrice = Math.min(...prices.map(p => p.price));
    const maxPrice = Math.max(...prices.map(p => p.price));

    console.log(`\n  PRECIO: $${firstPrice.toFixed(0)} → $${lastPrice.toFixed(0)} (min $${minPrice.toFixed(0)}, max $${maxPrice.toFixed(0)})`);
    console.log(`  Cambio: ${(((lastPrice - firstPrice) / firstPrice) * 100).toFixed(1)}%`);

    console.log(`\n  ESTRATEGIAS:`);
    console.log(`    HODL:          ${unified.hodlFinalPnl >= 0 ? '+' : ''}$${unified.hodlFinalPnl.toFixed(2)}`);
    console.log(`    LP solo:       ${unified.lpOnlyFinalPnl >= 0 ? '+' : ''}$${unified.lpOnlyFinalPnl.toFixed(2)}`);
    console.log(`    LP + Hedge:    ${unified.lpPlusHedgeFinalPnl >= 0 ? '+' : ''}$${unified.lpPlusHedgeFinalPnl.toFixed(2)}`);

    console.log(`\n  LP DETALLE:`);
    console.log(`    IL:            -$${Math.abs(lpMetrics.totalIL).toFixed(2)} (${lpMetrics.ilPercent.toFixed(1)}%)`);
    console.log(`    Fees:          +$${lpMetrics.totalFees.toFixed(2)}`);
    console.log(`    Tiempo en rango: ${lpMetrics.timeInRangePercent.toFixed(0)}%`);

    console.log(`\n  HEDGE DETALLE:`);
    console.log(`    Trades:        ${hedgeStats.totalTrades} (${hedgeStats.wins}W / ${hedgeStats.losses}L)`);
    console.log(`    Win rate:      ${hedgeStats.winRate.toFixed(1)}%`);
    console.log(`    PnL bruto:     ${hedgeStats.totalPnl >= 0 ? '+' : ''}$${hedgeStats.totalPnl.toFixed(2)}`);
    console.log(`    Fees trading:  -$${hedgeStats.totalFees.toFixed(2)}`);
    console.log(`    PnL neto:      ${hedgeStats.netPnl >= 0 ? '+' : ''}$${hedgeStats.netPnl.toFixed(2)}`);
    console.log(`    False breakouts: ${hedgeStats.falseBreakouts}/${hedgeStats.totalTrades} (${hedgeStats.falseBreakoutRate.toFixed(0)}%)`);

    if (unified.totalHedgeFunding !== 0) {
      console.log(`    Funding cost:  ${unified.totalHedgeFunding >= 0 ? '+' : ''}$${unified.totalHedgeFunding.toFixed(2)}`);
    }

    // Trade side breakdown
    const longs = result.hedgeTrades.filter(t => t.side === 'long');
    const shorts = result.hedgeTrades.filter(t => t.side === 'short');
    if (longs.length > 0 || shorts.length > 0) {
      const longPnl = longs.reduce((s, t) => s + t.pnl, 0);
      const shortPnl = shorts.reduce((s, t) => s + t.pnl, 0);
      console.log(`    Longs:         ${longs.length} trades, PnL: ${longPnl >= 0 ? '+' : ''}$${longPnl.toFixed(2)}`);
      console.log(`    Shorts:        ${shorts.length} trades, PnL: ${shortPnl >= 0 ? '+' : ''}$${shortPnl.toFixed(2)}`);
    }

    console.log(`\n  COBERTURA vs IL:`);
    console.log(`    IL cubierto:   ${unified.ilCoveredPercent?.toFixed(0) ?? 'N/A'}%`);
    console.log(`    Efectividad:   ${unified.hedgeEffectiveness?.toFixed(2) ?? 'N/A'}x`);
    console.log(`    Efecto neto:   ${(unified.lpPlusHedgeFinalPnl - unified.lpOnlyFinalPnl) >= 0 ? '+' : ''}$${(unified.lpPlusHedgeFinalPnl - unified.lpOnlyFinalPnl).toFixed(2)} vs LP solo`);
  }
}

main().catch(console.error);
