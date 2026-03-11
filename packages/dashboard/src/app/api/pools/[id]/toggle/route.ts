import { NextResponse } from 'next/server';
import { poolsRepo } from '../../../db';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { active } = await request.json();
    poolsRepo.toggleProtection(id, active);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to toggle protection' }, { status: 500 });
  }
}
