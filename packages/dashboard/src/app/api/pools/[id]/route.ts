import { NextResponse } from 'next/server';
import { poolsRepo } from '../../db';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = poolsRepo.findById(id);
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
  }
  return NextResponse.json(pool);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const pool = poolsRepo.update(id, body);
    return NextResponse.json(pool);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update pool';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    poolsRepo.delete(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete pool' }, { status: 500 });
  }
}
