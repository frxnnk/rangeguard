import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
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
 * @param symbol - e.g. 'ETHUSDT'
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
 * Fetch 1-minute klines from Bybit V5 public API.
 * Used as fallback when Binance is geo-restricted (HTTP 451).
 * Results come in reverse order — we reverse them to match Binance's chronological order.
 */
export async function fetchBybitKlines(
  symbol: string,
  startTime: number,
  endTime: number,
): Promise<PriceCandle[]> {
  const candles: PriceCandle[] = [];
  let cursor = endTime;
  const baseUrl = 'https://api.bybit.com/v5/market/kline';

  while (cursor > startTime) {
    const url = `${baseUrl}?category=spot&symbol=${symbol}&interval=1&start=${startTime}&end=${cursor}&limit=1000`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Bybit API error ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as {
      retCode: number;
      retMsg: string;
      result: { list: string[][] };
    };

    if (json.retCode !== 0) {
      throw new Error(`Bybit API error: ${json.retMsg}`);
    }

    const data = json.result.list;
    if (data.length === 0) break;

    // Bybit returns newest-first — collect and we'll sort at the end
    for (const k of data) {
      candles.push({
        timestamp: parseInt(k[0]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      });
    }

    // Move cursor to before the oldest candle in this batch
    const oldestTs = parseInt(data[data.length - 1][0]);
    if (oldestTs >= cursor) break; // No progress, avoid infinite loop
    cursor = oldestTs - 1;

    logger.info(
      { fetched: data.length, total: candles.length, remaining: Math.ceil((cursor - startTime) / 60_000) },
      'Fetching Bybit klines',
    );

    // Rate limit: max 120 requests/min on Bybit
    if (cursor > startTime) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Sort chronologically (Bybit returns reverse order, and we paginated backwards)
  candles.sort((a, b) => a.timestamp - b.timestamp);

  // Deduplicate by timestamp (overlapping pages may produce dupes)
  const seen = new Set<number>();
  const deduped = candles.filter((c) => {
    if (seen.has(c.timestamp)) return false;
    seen.add(c.timestamp);
    return true;
  });

  logger.info({ symbol, candles: deduped.length }, 'Bybit klines loaded');
  return deduped;
}

/**
 * Fetch 1-minute klines from CryptoCompare (data aggregator, no geo-restrictions).
 * Used as final fallback when both Binance and Bybit are blocked.
 *
 * @param symbol - e.g. 'ETHUSDT' (we split into fsym/tsym)
 */
export async function fetchCryptoCompareKlines(
  symbol: string,
  startTime: number,
  endTime: number,
): Promise<PriceCandle[]> {
  // Parse symbol: ETHUSDT → fsym=ETH, tsym=USDT
  const match = symbol.match(/^([A-Z]+)(USDT|USDC|USD|BTC)$/);
  if (!match) {
    throw new Error(`Cannot parse symbol for CryptoCompare: ${symbol}`);
  }
  const [, fsym, tsym] = match;

  const candles: PriceCandle[] = [];
  const baseUrl = 'https://min-api.cryptocompare.com/data/v2/histominute';
  const apiKey = process.env.CRYPTOCOMPARE_API_KEY || '';
  const apiKeyParam = apiKey ? `&api_key=${apiKey}` : '';
  let cursor = Math.floor(endTime / 1000); // CryptoCompare uses seconds

  const startSec = Math.floor(startTime / 1000);

  while (cursor > startSec) {
    // Max 2000 per request
    const url = `${baseUrl}?fsym=${fsym}&tsym=${tsym}&limit=2000&toTs=${cursor}${apiKeyParam}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CryptoCompare API error ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as {
      Response: string;
      Message: string;
      Data: {
        Data: Array<{
          time: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volumefrom: number;
        }>;
      };
    };

    if (json.Response === 'Error') {
      throw new Error(`CryptoCompare API error: ${json.Message}`);
    }

    const data = json.Data.Data;
    if (data.length === 0) break;

    // Filter to our desired range and convert to ms timestamps
    for (const k of data) {
      const tsMs = k.time * 1000;
      if (tsMs >= startTime && tsMs <= endTime && k.close > 0) {
        candles.push({
          timestamp: tsMs,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          volume: k.volumefrom,
        });
      }
    }

    // Move cursor to before the oldest candle in this batch
    const oldestTs = data[0].time;
    if (oldestTs >= cursor) break; // No progress
    cursor = oldestTs - 1;

    logger.info(
      { fetched: data.length, total: candles.length, remaining: Math.ceil((cursor - startSec) / 60) },
      'Fetching CryptoCompare klines',
    );

    // Rate limit: ~50 req/second on free tier, be conservative
    if (cursor > startSec) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Sort chronologically and deduplicate
  candles.sort((a, b) => a.timestamp - b.timestamp);
  const seen = new Set<number>();
  const deduped = candles.filter((c) => {
    if (seen.has(c.timestamp)) return false;
    seen.add(c.timestamp);
    return true;
  });

  logger.info({ symbol, candles: deduped.length }, 'CryptoCompare klines loaded');
  return deduped;
}

/**
 * Fetch klines trying Binance → Bybit → CryptoCompare.
 * Each fallback triggers on geo-restriction errors.
 */
async function fetchKlines(
  symbol: string,
  startTime: number,
  endTime: number,
): Promise<PriceCandle[]> {
  // Try Binance first
  try {
    return await fetchBinanceKlines(symbol, startTime, endTime);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('451') && !msg.includes('restricted location')) {
      throw err;
    }
    logger.warn('Binance geo-restricted, trying Bybit');
  }

  // Try Bybit
  try {
    return await fetchBybitKlines(symbol, startTime, endTime);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('403') && !msg.includes('block access')) {
      throw err;
    }
    logger.warn('Bybit geo-restricted, falling back to CryptoCompare');
  }

  // Final fallback: CryptoCompare (no geo-restrictions)
  return fetchCryptoCompareKlines(symbol, startTime, endTime);
}

/**
 * Fetch klines with automatic CSV caching.
 * If cached file exists, loads from disk. Otherwise fetches (Binance → Bybit fallback) and saves.
 */
export async function fetchBinanceKlinesCached(
  symbol: string,
  startTime: number,
  endTime: number,
  cacheDir: string = 'data/price-cache',
): Promise<PriceCandle[]> {
  // Generate cache key from symbol + date range (rounded to day)
  const startDay = new Date(startTime).toISOString().split('T')[0];
  const endDay = new Date(endTime).toISOString().split('T')[0];
  const cacheFile = resolve(cacheDir, `${symbol}_${startDay}_${endDay}.csv`);

  if (existsSync(cacheFile)) {
    logger.info({ file: cacheFile }, 'Loading cached price data');
    return loadCSV(cacheFile);
  }

  // Fetch from Binance (with Bybit fallback)
  const candles = await fetchKlines(symbol, startTime, endTime);

  // Save to cache
  mkdirSync(dirname(cacheFile), { recursive: true });
  const header = 'timestamp,open,high,low,close,volume';
  const rows = candles.map(
    (c) => `${c.timestamp},${c.open},${c.high},${c.low},${c.close},${c.volume}`,
  );
  writeFileSync(cacheFile, [header, ...rows].join('\n'), 'utf-8');
  logger.info({ file: cacheFile, candles: candles.length }, 'Price data cached to CSV');

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
