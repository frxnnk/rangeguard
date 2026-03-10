import { NextResponse } from 'next/server';
import { poolsRepo, hedgesRepo, walletsRepo } from '../db';

export async function GET() {
  try {
    const pools = poolsRepo.findAll();
    const openHedges = hedgesRepo.findOpen();
    const wallets = walletsRepo.findAll();
    const falseBreakouts = hedgesRepo.countFalseBreakouts();

    const activePools = pools.filter((p) => p.protectionActive).length;
    const inRangePools = pools.filter((p) => p.status === 'in-range').length;

    const totalRealizedPnl = hedgesRepo.sumRealizedPnl();

    const lowBalanceWallets = wallets.filter((w) => {
      if (!w.balanceAvailable) return false;
      return parseFloat(w.balanceAvailable) < parseFloat(w.lowBalanceThreshold);
    });

    return NextResponse.json({
      totalPools: pools.length,
      activePools,
      inRangePools,
      openHedges: openHedges.length,
      falseBreakouts,
      totalRealizedPnl: totalRealizedPnl.toFixed(2),
      lowBalanceWallets: lowBalanceWallets.map((w) => ({
        alias: w.alias,
        available: w.balanceAvailable,
        threshold: w.lowBalanceThreshold,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
