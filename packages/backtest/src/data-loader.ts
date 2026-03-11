import { readFileSync, existsSync } from 'fs';
import { createLogger } from '@rangeguard/common';

const logger = createLogger('data-loader');

export interface PriceCandle {
  timestamp: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

/**
 * Load 1-minute OHLCV data from a CSV file.
 * Expected format: timestamp,open,high,low,close,volume
 * Header row is optional (auto-detected).
 */
export function loadCSV(filePath: string): PriceCandle[] {
  if (!existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.trim().split('\n');

  // Skip header if present
  const start = isNaN(parseFloat(lines[0].split(',')[0])) ? 1 : 0;

  const candles: PriceCandle[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 6) continue;

    const timestamp = parseInt(parts[0]);
    const open = parseFloat(parts[1]);
    const high = parseFloat(parts[2]);
    const low = parseFloat(parts[3]);
    const close = parseFloat(parts[4]);
    const volume = parseFloat(parts[5]);

    if (isNaN(timestamp) || isNaN(close)) continue;

    candles.push({ timestamp, open, high, low, close, volume });
  }

  logger.info({ file: filePath, candles: candles.length }, 'CSV loaded');
  return candles;
}

/**
 * Fetch 1-minute klines from Binance public API.
 * Paginated automatically (max 1000 per request).
 *
 * @param symbol - e.g. 'ETHUSDC'
 * @param startTime - Unix ms
 * @param endTime - Unix ms
 */
export async function fetchBinanceKlines(
  symbol: string,
  startTime: number,
  endTime: number,
): Promise<PriceCandle[]> {
  const candles: PriceCandle[] = [];
  let cursor = startTime;
  const baseUrl = 'https://api.binance.com/api/v3/klines';

  while (cursor < endTime) {
    const url = `${baseUrl}?symbol=${symbol}&interval=1m&startTime=${cursor}&endTime=${endTime}&limit=1000`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API error ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as unknown[][];
    if (data.length === 0) break;

    for (const k of data) {
      candles.push({
        timestamp: k[0] as number,
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
      });
    }

    // Move cursor past the last candle
    cursor = (data[data.length - 1][0] as number) + 60_000;

    logger.info(
      { fetched: data.length, total: candles.length, remaining: Math.ceil((endTime - cursor) / 60_000) },
      'Fetching Binance klines',
    );

    // Rate limit: max 1200 requests/min, be conservative
    if (cursor < endTime) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  logger.info({ symbol, candles: candles.length }, 'Binance klines loaded');
  return candles;
}

/**
 * Convert candles to simple price points (using close price).
 */
export function candlesToPrices(candles: PriceCandle[]): PricePoint[] {
  return candles.map((c) => ({ timestamp: c.timestamp, price: c.close }));
}

/**
 * Parse a period string like "6m", "3m", "1y" into start/end timestamps.
 * End = now, start = now - period.
 */
export function parsePeriod(period: string): { startTime: number; endTime: number } {
  const endTime = Date.now();
  const match = period.match(/^(\d+)([mwdy])$/);
  if (!match) {
    throw new Error(`Invalid period format: ${period}. Use e.g. "6m", "3m", "1y", "30d", "2w"`);
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  let ms: number;
  switch (unit) {
    case 'm':
      ms = value * 30 * 24 * 60 * 60 * 1000;
      break;
    case 'w':
      ms = value * 7 * 24 * 60 * 60 * 1000;
      break;
    case 'd':
      ms = value * 24 * 60 * 60 * 1000;
      break;
    case 'y':
      ms = value * 365 * 24 * 60 * 60 * 1000;
      break;
    default:
      throw new Error(`Unknown period unit: ${unit}`);
  }

  return { startTime: endTime - ms, endTime };
}
