import { NextResponse } from 'next/server';
import { logsRepo } from '../db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const level = searchParams.get('level') || undefined;

    const logs = logsRepo.findRecent(limit, level);
    return NextResponse.json(logs);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
