import { NextResponse } from 'next/server';
import { hedgesRepo } from '../db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const trades = hedgesRepo.findHistory(limit, offset);
    const falseBreakouts = hedgesRepo.countFalseBreakouts();

    return NextResponse.json({ trades, falseBreakouts });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const deleted = hedgesRepo.deleteAllHistory();
    return NextResponse.json({ deleted });
  } catch {
    return NextResponse.json({ error: 'Failed to delete history' }, { status: 500 });
  }
}
