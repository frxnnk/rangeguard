#!/usr/bin/env node

/**
 * Backtest CLI for RangeGuard
 *
 * Usage:
 *   pnpm backtest --pair ETH/USDC --range 1800-2200 --period 6m
 *   pnpm backtest --pair ETH/USDC --range 1800-2200 --csv data/prices/ETH-USDC-1m.csv
 *   pnpm backtest --pair ETH/USDC --range 1800-2200 --period 3m --sweep
 *
 * Options:
 *   --pair          Trading pair (e.g. ETH/USDC)
 *   --range         Price range (e.g. 1800-2200)
 *   --period        Historical period to backtest (e.g. 6m, 3m, 1y, 30d)
 *   --start         Start date (e.g. 2022-11-01) — use with --end
 *   --end           End date (e.g. 2022-12-01) — use with --start
 *   --csv           Path to CSV file with price data
 *   --pool-amount   Pool amount in USD (default: 10000)
 *   --leverage      Leverage (default: 10)
 *   --hedge-ratio   Hedge ratio 0.1-2.0 (default: 1.0)
 *   --debounce      Debounce count (default: 3)
 *   --cooldown      Cooldown seconds (default: 300)
 *   --trading       Enable range trading (default: false)
 *   --sweep         Run parameter sweep
 *   --output        Output file path (default: stdout + file)
 */

import { resolve } from 'path';
import { loadCSV, fetchBinanceKlinesCached, candlesToPrices, parsePeriod } from './data-loader.js';
import { runBacktest, type BacktestConfig } from './orchestrator.js';
import { analyze } from './analyzer.js';
import { generateMarkdownReport, writeReport, type ReportData } from './reporter.js';
import { simulateLp, type LpConfig } from './lp-simulator.js';
import { analyzeUnified } from './unified-analysis.js';

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = 'true';
      }
    }
  }
  return result;
}

function pairToSymbol(pair: string): string {
  // Binance uses USDT pairs for most data. Map USDC → USDT for fetching.
  const symbol = pair.replace('/', '');
  return symbol.replace(/USDC$/, 'USDT');
}

function pairToHedgeAsset(pair: string): string {
  return pair.split('/')[0].replace('W', ''); // WETH -> ETH, WBTC -> BTC
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args['help'] || Object.keys(args).length === 0) {
    console.log(`
RangeGuard Backtest CLI

Usage:
  pnpm backtest --pair ETH/USDC --range 1800-2200 --period 6m
  pnpm backtest --pair ETH/USDC --range 1800-2200 --csv data/prices/ETH-USDC-1m.csv
  pnpm backtest --pair ETH/USDC --range 1800-2200 --period 3m --sweep

Options:
  --pair          Trading pair (e.g. ETH/USDC)
  --range         Price range (e.g. 1800-2200)
  --period        Historical period (e.g. 6m, 3m, 1y, 30d)
  --start         Start date (e.g. 2022-11-01) — use with --end
  --end           End date (e.g. 2022-12-01) — use with --start
  --csv           Path to CSV file with price data
  --pool-amount   Pool amount in USD (default: 10000)
  --leverage      Leverage (default: 10)
  --hedge-ratio   Hedge ratio 0.1-2.0 (default: 1.0)
  --debounce      Debounce count (default: 3)
  --cooldown      Cooldown seconds (default: 300)
  --trading       Enable range trading (default: false)
  --fee-apr       Estimated pool fee APR % for IL comparison (default: 20)
  --sweep         Run parameter sweep across multiple configs
  --output        Output directory (default: data/backtest-results)
`);
    return;
  }

  const pair = args['pair'];
  const rangeStr = args['range'];

  if (!pair || !rangeStr) {
    console.error('Error: --pair and --range are required');
    process.exit(1);
  }

  const [rangeLowerStr, rangeUpperStr] = rangeStr.split('-');
  const rangeLower = parseFloat(rangeLowerStr);
  const rangeUpper = parseFloat(rangeUpperStr);

  if (isNaN(rangeLower) || isNaN(rangeUpper) || rangeLower >= rangeUpper) {
    console.error('Error: --range must be in format lower-upper (e.g. 1800-2200)');
    process.exit(1);
  }

  // Load price data
  let prices;
  if (args['csv']) {
    const csvPath = resolve(process.cwd(), args['csv']);
    const candles = loadCSV(csvPath);
    prices = candlesToPrices(candles);
  } else if (args['start'] && args['end']) {
    const startTime = new Date(args['start']).getTime();
    const endTime = new Date(args['end']).getTime();
    if (isNaN(startTime) || isNaN(endTime) || startTime >= endTime) {
      console.error('Error: --start and --end must be valid dates with start < end');
      process.exit(1);
    }
    const symbol = pairToSymbol(pair);
    console.log(`Fetching ${symbol} klines (${args['start']} → ${args['end']})...`);
    const candles = await fetchBinanceKlinesCached(symbol, startTime, endTime);
    prices = candlesToPrices(candles);
  } else if (args['period']) {
    const { startTime, endTime } = parsePeriod(args['period']);
    const symbol = pairToSymbol(pair);
    console.log(`Fetching ${symbol} klines (${args['period']})...`);
    const candles = await fetchBinanceKlinesCached(symbol, startTime, endTime);
    prices = candlesToPrices(candles);
  } else {
    console.error('Error: --csv, --period, or --start/--end is required');
    process.exit(1);
  }

  console.log(`Loaded ${prices.length} price points`);

  const outputDir = resolve(process.cwd(), args['output'] ?? 'data/backtest-results');

  if (args['sweep']) {
    await runSweep(pair, rangeLower, rangeUpper, prices, args, outputDir);
  } else {
    await runSingle(pair, rangeLower, rangeUpper, prices, args, outputDir);
  }
}

async function runSingle(
  pair: string,
  rangeLower: number,
  rangeUpper: number,
  prices: Awaited<ReturnType<typeof candlesToPrices>>,
  args: Record<string, string>,
  outputDir: string,
) {
  const config: BacktestConfig = {
    pair,
    hedgeAsset: pairToHedgeAsset(pair),
    rangeLower,
    rangeUpper,
    poolAmountUsd: parseFloat(args['pool-amount'] ?? '10000'),
    leverage: parseInt(args['leverage'] ?? '10'),
    hedgeRatio: parseFloat(args['hedge-ratio'] ?? '1.0'),
    debounceCount: parseInt(args['debounce'] ?? '3'),
    cooldownSeconds: parseInt(args['cooldown'] ?? '300'),
    trading: args['trading']
      ? {
          enabled: true,
          leverage: 5,
          stopLossPercent: 2.0,
          trailingPercent: 1.5,
          entryZonePercent: 25,
          cooldownSeconds: 300,
          maxSizeUsd: 1000,
        }
      : undefined,
  };

  console.log(`\nRunning backtest: ${pair} [$${rangeLower}-$${rangeUpper}]`);
  const result = await runBacktest(prices, config);

  const allTrades = [...result.hedgeTrades, ...result.rangeTrades].sort(
    (a, b) => a.entryTime - b.entryTime,
  );

  const hedgeStats = analyze(result.hedgeTrades);
  const rangeStats = analyze(result.rangeTrades);
  const combinedStats = analyze(allTrades);

  // LP simulation + unified hedge vs IL analysis
  const feeAprPercent = parseFloat(args['fee-apr'] ?? '20');
  const lpConfig: LpConfig = {
    poolAmountUsd: config.poolAmountUsd,
    rangeLower: config.rangeLower,
    rangeUpper: config.rangeUpper,
    entryPrice: prices[0].price,
    feeAprPercent,
  };
  const lpMetrics = simulateLp(lpConfig, prices);
  const unifiedAnalysis = analyzeUnified(result.hedgeTrades, lpMetrics, prices, {
    rangeLower: config.rangeLower,
    rangeUpper: config.rangeUpper,
    poolAmountUsd: config.poolAmountUsd,
    entryPrice: prices[0].price,
  });

  const reportData: ReportData = {
    config,
    hedgeStats,
    rangeStats,
    combinedStats,
    startTime: result.startTime,
    endTime: result.endTime,
    pricePoints: result.pricePoints,
    unifiedAnalysis,
  };

  const markdown = generateMarkdownReport(reportData);
  console.log('\n' + markdown);

  // Write to file
  const { mkdirSync } = await import('fs');
  mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `${pair.replace('/', '-')}_${rangeLower}-${rangeUpper}_${timestamp}`;
  const mdPath = resolve(outputDir, `${fileName}.md`);
  writeReport(mdPath, markdown);
  console.log(`\nReport saved: ${mdPath}`);
}

async function runSweep(
  pair: string,
  rangeLower: number,
  rangeUpper: number,
  prices: Awaited<ReturnType<typeof candlesToPrices>>,
  args: Record<string, string>,
  outputDir: string,
) {
  const hedgeRatios = [0.5, 0.75, 1.0];
  const debounceCounts = [2, 3, 5];
  const cooldowns = [180, 300, 600, 900];

  console.log(
    `\nParameter sweep: ${hedgeRatios.length} ratios x ${debounceCounts.length} debounces x ${cooldowns.length} cooldowns = ${hedgeRatios.length * debounceCounts.length * cooldowns.length} configs\n`,
  );

  const feeAprPercent = parseFloat(args['fee-apr'] ?? '20');

  const results: Array<{
    config: BacktestConfig;
    netPnl: number;
    trades: number;
    winRate: number;
    sharpe: number;
    maxDD: number;
    falseBreakoutRate: number;
    ilCovered: number;
    hedgeEffectiveness: number;
  }> = [];

  for (const ratio of hedgeRatios) {
    for (const debounce of debounceCounts) {
      for (const cooldown of cooldowns) {
        const config: BacktestConfig = {
          pair,
          hedgeAsset: pairToHedgeAsset(pair),
          rangeLower,
          rangeUpper,
          poolAmountUsd: parseFloat(args['pool-amount'] ?? '10000'),
          leverage: parseInt(args['leverage'] ?? '10'),
          hedgeRatio: ratio,
          debounceCount: debounce,
          cooldownSeconds: cooldown,
        };

        const result = await runBacktest(prices, config);
        const allTrades = [...result.hedgeTrades, ...result.rangeTrades].sort(
          (a, b) => a.entryTime - b.entryTime,
        );
        const stats = analyze(allTrades);

        // Unified analysis for IL coverage
        const lpConfig: LpConfig = {
          poolAmountUsd: config.poolAmountUsd,
          rangeLower: config.rangeLower,
          rangeUpper: config.rangeUpper,
          entryPrice: prices[0].price,
          feeAprPercent,
        };
        const lpMetrics = simulateLp(lpConfig, prices);
        const unified = analyzeUnified(result.hedgeTrades, lpMetrics, prices, {
          rangeLower: config.rangeLower,
          rangeUpper: config.rangeUpper,
          poolAmountUsd: config.poolAmountUsd,
          entryPrice: prices[0].price,
        });

        results.push({
          config,
          netPnl: stats.netPnl,
          trades: stats.totalTrades,
          winRate: stats.winRate,
          sharpe: stats.sharpeRatio,
          maxDD: stats.maxDrawdownPercent,
          falseBreakoutRate: stats.falseBreakoutRate,
          ilCovered: unified.ilCoveredPercent,
          hedgeEffectiveness: unified.hedgingEffectivenessRatio,
        });

        process.stdout.write('.');
      }
    }
  }

  console.log('\n');

  // Sort by IL covered (primary goal)
  results.sort((a, b) => b.ilCovered - a.ilCovered);

  // Print sweep results table
  console.log('Parameter Sweep Results (sorted by IL Coverage)');
  console.log('='.repeat(120));
  console.log(
    'Ratio  Debounce  Cooldown  Trades  WinRate   NetPnL     Sharpe  MaxDD%  FalseBreak%  ILCovered%  HedgeEff',
  );
  console.log('-'.repeat(120));

  for (const r of results) {
    console.log(
      `${r.config.hedgeRatio.toFixed(2).padStart(5)}  ` +
        `${r.config.debounceCount.toString().padStart(8)}  ` +
        `${r.config.cooldownSeconds.toString().padStart(8)}  ` +
        `${r.trades.toString().padStart(6)}  ` +
        `${r.winRate.toFixed(1).padStart(6)}%  ` +
        `$${r.netPnl.toFixed(2).padStart(8)}  ` +
        `${r.sharpe.toFixed(2).padStart(7)}  ` +
        `${r.maxDD.toFixed(1).padStart(5)}%  ` +
        `${r.falseBreakoutRate.toFixed(1).padStart(10)}%  ` +
        `${r.ilCovered.toFixed(1).padStart(9)}%  ` +
        `${r.hedgeEffectiveness.toFixed(2).padStart(8)}x`,
    );
  }

  console.log('='.repeat(120));

  // Best config
  const best = results[0];
  console.log(
    `\nBest: ratio=${best.config.hedgeRatio}, debounce=${best.config.debounceCount}, cooldown=${best.config.cooldownSeconds}s => IL covered ${best.ilCovered.toFixed(1)}%, effectiveness ${best.hedgeEffectiveness.toFixed(2)}x`,
  );

  // Save sweep results
  const { mkdirSync, writeFileSync } = await import('fs');
  mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sweepPath = resolve(outputDir, `sweep_${pair.replace('/', '-')}_${timestamp}.json`);
  writeFileSync(sweepPath, JSON.stringify(results, null, 2));
  console.log(`Sweep results saved: ${sweepPath}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
