import { NextResponse } from 'next/server';
import { poolsRepo } from '../../../db';
import { ChainClientManager, LiquidityReader } from '@rangeguard/pool-monitor';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pool = poolsRepo.findById(id);

    if (!pool) {
      return NextResponse.json({ error: 'Pool no encontrado' }, { status: 404 });
    }

    if (!pool.lpTokenId) {
      return NextResponse.json(
        { error: 'Pool no tiene Token ID de LP configurado' },
        { status: 400 },
      );
    }

    if (pool.poolAmountSource !== 'on-chain') {
      return NextResponse.json(
        { error: 'Pool no está configurado para lectura on-chain' },
        { status: 400 },
      );
    }

    // Create chain client + reader per request (stateless)
    const rpcOverrides: Record<number, { http: string; ws?: string }> = {};
    if (pool.rpcUrl) {
      rpcOverrides[pool.chainId] = { http: pool.rpcUrl };
    }
    const clientManager = new ChainClientManager(rpcOverrides);
    const reader = new LiquidityReader(clientManager);

    const position = await reader.readPosition(pool.chainId, pool.lpTokenId, pool.poolAddress);

    const now = Date.now();
    poolsRepo.updatePoolAmount(id, position.valueUsd.toFixed(2), now);

    await clientManager.destroyAll();

    return NextResponse.json({
      poolAmount: position.valueUsd.toFixed(2),
      syncedAt: now,
      amount0: position.amount0.toString(),
      amount1: position.amount1.toString(),
      liquidity: position.liquidity.toString(),
      currentPrice: position.currentPrice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al sincronizar liquidez';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
