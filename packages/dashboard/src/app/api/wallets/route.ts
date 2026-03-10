import { NextResponse } from 'next/server';
import { walletsRepo } from '../db';

export async function GET() {
  try {
    const wallets = walletsRepo.findAll();
    return NextResponse.json(wallets);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch wallets' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const wallet = walletsRepo.create(body);
    return NextResponse.json(wallet, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create wallet';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
