/**
 * Pre-fetch Binance kline data for all backtest presets.
 * Run locally before deploy: pnpm tsx scripts/prefetch-presets.ts
 *
 * This generates CSV cache files in data/price-cache/ that get
 * included in the Docker image, avoiding Binance geo-restrictions on Railway.
 */
import { fetchBinanceKlinesCached } from '../packages/backtest/src/data-loader.js';

const PRESETS = [
  { name: 'FTX Crash Nov 2022', symbol: 'ETHUSDT', start: '2022-11-07', end: '2022-11-20' },
  { name: 'Rally ETH Feb 2024', symbol: 'ETHUSDT', start: '2024-02-01', end: '2024-03-01' },
  { name: 'Corrección Abr 2024', symbol: 'ETHUSDT', start: '2024-04-10', end: '2024-04-25' },
  { name: 'Mercado lateral Jun 2024', symbol: 'ETHUSDT', start: '2024-06-05', end: '2024-06-20' },
  { name: 'Falsas rupturas Abr 2024', symbol: 'ETHUSDT', start: '2024-04-01', end: '2024-05-15' },
];

async function main() {
  console.log('Pre-fetching price data for backtest presets...\n');

  for (const preset of PRESETS) {
    const startTime = new Date(preset.start).getTime();
    const endTime = new Date(preset.end).getTime();

    console.log(`→ ${preset.name} (${preset.symbol} ${preset.start} to ${preset.end})`);
    const candles = await fetchBinanceKlinesCached(preset.symbol, startTime, endTime);
    console.log(`  ✓ ${candles.length} candles cached\n`);
  }

  console.log('Done! Cache files are in data/price-cache/');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
