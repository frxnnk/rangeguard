import { type PublicClient } from 'viem';
import {
  createLogger,
  UNISWAP_V3_POOL_ABI,
  NONFUNGIBLE_POSITION_MANAGER_ABI,
  NONFUNGIBLE_POSITION_MANAGER_ADDRESS,
  ERC20_DECIMALS_ABI,
  calculateTokenAmounts,
  calculatePositionValueUsd,
  sqrtPriceX96ToPrice,
} from '@rangeguard/common';
import type { ChainClientManager } from './chain-client.js';

const logger = createLogger('liquidity-reader');

export interface LpPositionData {
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  amount0: bigint;
  amount1: bigint;
  token0: string;
  token1: string;
  decimals0: number;
  decimals1: number;
  currentPrice: number;
  valueUsd: number;
}

// Cache token decimals to avoid repeated on-chain calls
const decimalsCache = new Map<string, number>();

export class LiquidityReader {
  private clientManager: ChainClientManager;

  constructor(clientManager: ChainClientManager) {
    this.clientManager = clientManager;
  }

  async readPosition(
    chainId: number,
    tokenId: string,
    poolAddress: string,
  ): Promise<LpPositionData> {
    const client = this.clientManager.getHttpClient(chainId) as PublicClient;
    const nftAddress = NONFUNGIBLE_POSITION_MANAGER_ADDRESS;

    // 1. Read NFT position data
    const positionResult = await client.readContract({
      address: nftAddress,
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
      functionName: 'positions',
      args: [BigInt(tokenId)],
    });

    const [, , token0, token1, , tickLower, tickUpper, liquidity] = positionResult;

    if (liquidity === 0n) {
      logger.warn({ tokenId, chainId }, 'LP position has zero liquidity');
    }

    // 2. Read current pool state
    const slot0 = await client.readContract({
      address: poolAddress as `0x${string}`,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: 'slot0',
    });
    const sqrtPriceX96 = slot0[0];

    // 3. Get token decimals (cached)
    const decimals0 = await this.getDecimals(client, token0 as `0x${string}`);
    const decimals1 = await this.getDecimals(client, token1 as `0x${string}`);

    // 4. Calculate token amounts
    const { amount0, amount1 } = calculateTokenAmounts(
      liquidity,
      sqrtPriceX96,
      tickLower,
      tickUpper,
    );

    // 5. Calculate USD value
    // token1 is assumed to be the stablecoin (USDC/USDT/DAI → $1)
    // token0 price is derived from sqrtPriceX96
    const currentPrice = sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1);
    const price0 = currentPrice;
    const price1 = 1.0;

    const valueUsd = calculatePositionValueUsd(
      amount0,
      decimals0,
      price0,
      amount1,
      decimals1,
      price1,
    );

    logger.info(
      {
        tokenId,
        chainId,
        liquidity: liquidity.toString(),
        tickLower,
        tickUpper,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        valueUsd: valueUsd.toFixed(2),
      },
      'LP position read',
    );

    return {
      liquidity,
      tickLower,
      tickUpper,
      amount0,
      amount1,
      token0: token0 as string,
      token1: token1 as string,
      decimals0,
      decimals1,
      currentPrice,
      valueUsd,
    };
  }

  private async getDecimals(client: PublicClient, tokenAddress: `0x${string}`): Promise<number> {
    const cached = decimalsCache.get(tokenAddress);
    if (cached !== undefined) return cached;

    const decimals = await client.readContract({
      address: tokenAddress,
      abi: ERC20_DECIMALS_ABI,
      functionName: 'decimals',
    });

    const value = Number(decimals);
    decimalsCache.set(tokenAddress, value);
    return value;
  }
}
