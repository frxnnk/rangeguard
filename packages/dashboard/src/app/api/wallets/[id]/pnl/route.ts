import { NextResponse } from 'next/server';
import { hedgesRepo, rangeTradesRepo } from '../../../db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: walletId } = await params;

    const hedgePnl = hedgesRepo.findClosedByWallet(walletId);
    const rangePnl = rangeTradesRepo.findClosedByWallet(walletId);

    // Merge and sort by close time
    const all = [...hedgePnl, ...rangePnl].sort((a, b) => a.closedAt - b.closedAt);

    // Compute cumulative PnL
    let cumulative = 0;
    const series = all.map((t) => {
      cumulative += t.realizedPnl;
      return { t: t.closedAt, pnl: Math.round(cumulative * 100) / 100 };
    });

    return NextResponse.json(series);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch wallet PnL' }, { status: 500 });
  }
}
