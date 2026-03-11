import { NextResponse } from 'next/server';
import { poolsRepo } from '../db';

export async function GET() {
  try {
    const pools = poolsRepo.findAll();
    return NextResponse.json(pools);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch pools' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pool = poolsRepo.create(body);
    return NextResponse.json(pool, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create pool';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
