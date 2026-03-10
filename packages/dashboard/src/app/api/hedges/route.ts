import { NextResponse } from 'next/server';
import { hedgesRepo, pnlRepo } from '../db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const poolId = searchParams.get('poolId');

    let hedges;
    if (poolId) {
      hedges = hedgesRepo.findByPool(poolId);
    } else if (status === 'open') {
      hedges = hedgesRepo.findOpen();
    } else {
      hedges = hedgesRepo.findOpen();
    }

    // Enrich open hedges with latest unrealized PnL from snapshots
    const enriched = hedges.map((h) => {
      if (h.status === 'open') {
        const snapshots = pnlRepo.findByPool(h.poolConfigId, 1);
        if (snapshots.length > 0) {
          return {
            ...h,
            unrealizedPnl: snapshots[0].unrealizedPnl,
            unrealizedPnlUpdatedAt: snapshots[0].snapshotAt,
          };
        }
      }
      return h;
    });

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch hedges' }, { status: 500 });
  }
}
