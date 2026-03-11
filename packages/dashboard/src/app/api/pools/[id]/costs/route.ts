import { NextResponse } from 'next/server';
import { hedgesRepo, rangeTradesRepo, poolsRepo } from '../../../db';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pool = poolsRepo.findById(id);
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    const hedgeStats = hedgesRepo.statsByPool(id);
    const tradingStats = rangeTradesRepo.statsByPool(id);

    // Combine hedge + range trading stats
    const stats = {
      totalTrades: hedgeStats.totalTrades + tradingStats.totalTrades,
      totalPnl: hedgeStats.totalPnl + tradingStats.totalPnl,
      totalFees: hedgeStats.totalFees + tradingStats.totalFees,
      wins: hedgeStats.wins + tradingStats.wins,
      losses: hedgeStats.losses + tradingStats.losses,
    };

    const trades = hedgesRepo.findByPool(id);

    return NextResponse.json({ stats, trades, hedgeStats, tradingStats });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch pool costs' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deletedHedges = hedgesRepo.deleteHistoryByPool(id);
    const deletedTrades = rangeTradesRepo.deleteHistoryByPool(id);
    return NextResponse.json({ deleted: deletedHedges + deletedTrades });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete pool history' }, { status: 500 });
  }
}
