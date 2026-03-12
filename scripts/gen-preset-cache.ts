import { fetchBinanceKlinesCached } from '../packages/backtest/src/data-loader.js';

const PRESETS = [
  { name: 'FTX Crash', symbol: 'ETHUSDT', start: '2022-11-07', end: '2022-11-20' },
  { name: 'Rally ETH', symbol: 'ETHUSDT', start: '2024-02-01', end: '2024-03-01' },
  { name: 'Corrección Abr', symbol: 'ETHUSDT', start: '2024-04-10', end: '2024-04-25' },
  { name: 'Lateral Jun', symbol: 'ETHUSDT', start: '2024-06-05', end: '2024-06-20' },
  { name: 'Falsas rupturas', symbol: 'ETHUSDT', start: '2024-04-01', end: '2024-05-15' },
];

const cacheDir = 'packages/dashboard/data/price-cache';

async function main() {
  for (const p of PRESETS) {
    const startTime = new Date(p.start).getTime();
    const endTime = new Date(p.end).getTime();
    console.log(`Fetching ${p.name}: ${p.symbol} ${p.start} → ${p.end}`);
    const candles = await fetchBinanceKlinesCached(p.symbol, startTime, endTime, cacheDir);
    console.log(`  → ${candles.length} candles cached`);
  }
  console.log('Done!');
}

main().catch(console.error);
