import { NextResponse } from 'next/server';
import { hedgesRepo } from '../db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const poolId = searchParams.get('poolId');

    if (poolId) {
      // Return all hedges for a specific pool
      const hedges = hedgesRepo.findByPool(poolId);
      return NextResponse.json(hedges);
    }

    if (status === 'open') {
      return NextResponse.json(hedgesRepo.findOpen());
    }

    // Return all open hedges by default
    return NextResponse.json(hedgesRepo.findOpen());
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch hedges' }, { status: 500 });
  }
}
