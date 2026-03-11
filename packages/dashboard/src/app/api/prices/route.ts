import { NextResponse } from 'next/server';
import { pnlRepo } from '../db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get('asset');
    const hours = parseInt(searchParams.get('hours') || '24');

    if (!asset) {
      return NextResponse.json({ error: 'asset param required' }, { status: 400 });
    }

    const since = Date.now() - hours * 60 * 60 * 1000;
    const history = pnlRepo.getPriceHistory(asset, since);

    const data = history.map((p) => ({
      time: new Date(p.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      price: parseFloat(p.price),
    }));

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}
