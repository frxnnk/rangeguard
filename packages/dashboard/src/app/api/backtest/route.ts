import { NextResponse } from 'next/server';
import {
  fetchBinanceKlines,
  candlesToPrices,
  parsePeriod,
  runBacktest,
  analyze,
} from '@rangeguard/backtest';
import type { BacktestConfig } from '@rangeguard/backtest';

export const maxDuration = 300; // 5 minutes for long backtests

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    const { pair, rangeLower, rangeUpper, period } = body;
    if (!pair || !rangeLower || !rangeUpper || !period) {
      return NextResponse.json(
        { error: 'Campos requeridos: pair, rangeLower, rangeUpper, period' },
        { status: 400 },
      );
    }

    if (rangeLower >= rangeUpper) {
      return NextResponse.json(
        { error: 'El rango inferior debe ser menor al superior' },
        { status: 400 },
      );
    }

    // Parse period and fetch data from Binance
    const { startTime, endTime } = parsePeriod(period);
    const symbol = pair.replace('/', '');
    const candles = await fetchBinanceKlines(symbol, startTime, endTime);

    if (candles.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron datos de precio para el período seleccionado' },
        { status: 400 },
      );
    }

    const prices = candlesToPrices(candles);

    // Build config
    const hedgeAsset = pair.split('/')[0];
    const config: BacktestConfig = {
      pair,
      hedgeAsset,
      rangeLower: Number(rangeLower),
      rangeUpper: Number(rangeUpper),
      poolAmountUsd: Number(body.poolAmountUsd) || 10_000,
      leverage: Number(body.leverage) || 10,
      hedgeRatio: Number(body.hedgeRatio) || 1.0,
      debounceCount: Number(body.debounceCount) || 3,
      cooldownSeconds: Number(body.cooldownSeconds) || 300,
    };

    if (body.tradingEnabled) {
      config.trading = {
        enabled: true,
        leverage: Number(body.tradingLeverage) || 5,
        stopLossPercent: Number(body.tradingStopLossPercent) || 2.0,
        trailingPercent: Number(body.tradingTrailingPercent) || 1.5,
        entryZonePercent: Number(body.tradingEntryZonePercent) || 25,
        cooldownSeconds: Number(body.tradingCooldownSeconds) || 300,
        maxSizeUsd: Number(body.tradingMaxSizeUsd) || 1000,
      };
    }

    // Run backtest
    const t0 = Date.now();
    const result = await runBacktest(prices, config);
    const durationMs = Date.now() - t0;

    // Analyze
    const allTrades = [...result.hedgeTrades, ...result.rangeTrades];
    const hedgeStats = analyze(result.hedgeTrades);
    const rangeStats = analyze(result.rangeTrades);
    const combinedStats = analyze(allTrades);

    return NextResponse.json({
      config: result.config,
      hedgeStats,
      rangeStats,
      combinedStats,
      hedgeTrades: result.hedgeTrades,
      rangeTrades: result.rangeTrades,
      startTime: result.startTime,
      endTime: result.endTime,
      pricePoints: result.pricePoints,
      durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error ejecutando backtest';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
