import { NextResponse } from 'next/server';
import { hedgesRepo } from '../db';

export async function GET() {
  try {
    // Get all closed trades and compute cumulative PnL per day
    const trades = hedgesRepo.findHistory(500, 0);
    const closedTrades = trades
      .filter((t) => t.closedAt && t.realizedPnl)
      .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));

    let cumulative = 0;
    const dailyMap = new Map<string, number>();

    for (const trade of closedTrades) {
      cumulative += parseFloat(trade.realizedPnl!);
      const date = new Date(trade.closedAt!).toLocaleDateString();
      dailyMap.set(date, cumulative);
    }

    const data = Array.from(dailyMap.entries()).map(([date, pnl]) => ({
      date,
      pnl: parseFloat(pnl.toFixed(2)),
    }));

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch PnL data' }, { status: 500 });
  }
}
