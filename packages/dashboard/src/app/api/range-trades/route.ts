import { NextResponse } from 'next/server';
import { rangeTradesRepo } from '../db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const poolId = searchParams.get('poolId');

    if (poolId) {
      const trades = rangeTradesRepo.findByPool(poolId);
      return NextResponse.json(trades);
    }

    const trades = rangeTradesRepo.findHistory(limit, offset);
    return NextResponse.json({ trades });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch range trades' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const deleted = rangeTradesRepo.deleteAllHistory();
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete range trade history' }, { status: 500 });
  }
}
