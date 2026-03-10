import { NextResponse } from 'next/server';

const API_KEY = process.env.DASHBOARD_API_KEY;

export async function POST(request: Request) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
  }

  const body = await request.json();
  const { key } = body as { key?: string };

  if (!key || key !== API_KEY) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('auth-token', API_KEY, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('auth-token');
  return response;
}
