import { NextResponse } from 'next/server';
import { pnlRepo } from '../db';

export async function GET() {
  try {
    // Check heartbeat: bot writes to price_cache with asset='__bot_heartbeat' every 10s
    const heartbeat = pnlRepo.getLatestPrice('__bot_heartbeat');

    if (!heartbeat) {
      return NextResponse.json({ running: false, lastSeen: null });
    }

    // Parse the heartbeat timestamp (stored as the price string)
    const lastSeen = parseInt(heartbeat.price);
    const age = Date.now() - lastSeen;
    // Consider bot running if heartbeat is within last 30 seconds
    const running = age < 30_000;

    return NextResponse.json({
      running,
      lastSeen,
      ageMs: age,
    });
  } catch (error) {
    return NextResponse.json({ running: false, lastSeen: null }, { status: 200 });
  }
}
