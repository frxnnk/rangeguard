import { NextResponse } from 'next/server';
import { hedgesRepo, poolsRepo } from '../../../db';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const hedge = hedgesRepo.findById(id);

    if (!hedge) {
      return NextResponse.json({ error: 'Hedge not found' }, { status: 404 });
    }

    if (hedge.status !== 'open') {
      return NextResponse.json({ error: 'Hedge is not open' }, { status: 400 });
    }

    const pool = poolsRepo.findById(hedge.poolConfigId);
    if (!pool) {
      return NextResponse.json({ error: 'Pool config not found' }, { status: 404 });
    }

    // Get current price from pool to calculate PnL
    const currentPrice = pool.currentPrice ? parseFloat(pool.currentPrice) : null;
    if (!currentPrice) {
      return NextResponse.json(
        { error: 'No current price available for PnL calculation' },
        { status: 400 },
      );
    }

    const entryPrice = parseFloat(hedge.entryPrice);
    let pnl: number;
    if (hedge.side === 'short') {
      pnl = (entryPrice - currentPrice) * parseFloat(hedge.size);
    } else {
      pnl = (currentPrice - entryPrice) * parseFloat(hedge.size);
    }

    const isFalseBreakout = pnl < 0;

    // Close the hedge in DB
    hedgesRepo.close(id, currentPrice.toString(), pnl.toFixed(2), 'manual', isFalseBreakout);

    // Close all hedges for this pool if this was a manual close
    const remainingOpen = hedgesRepo.findOpenByPool(hedge.poolConfigId);
    if (remainingOpen.length === 0) {
      poolsRepo.updateStatus(hedge.poolConfigId, 'in-range', currentPrice.toString());
    }

    return NextResponse.json({
      success: true,
      closedHedgeId: id,
      exitPrice: currentPrice.toString(),
      realizedPnl: pnl.toFixed(2),
      isFalseBreakout,
      note: 'DB record closed. The bot will detect position changes on next check. For immediate HL position close, use the bot CLI.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to close hedge';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
