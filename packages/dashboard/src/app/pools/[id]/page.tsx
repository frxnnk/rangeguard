'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge } from '@/components/common/StatusBadge';
import { NetworkBadge } from '@/components/common/NetworkBadge';
import { RangeIndicator } from '@/components/pools/RangeIndicator';
import { PriceChart } from '@/components/charts/PriceChart';
import { HedgeCard } from '@/components/hedges/HedgeCard';

const FEE_LABELS: Record<number, string> = {
  100: '0.01%',
  500: '0.05%',
  3000: '0.3%',
  10000: '1%',
};

export default function PoolDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: pool, isLoading: poolLoading } = useQuery({
    queryKey: ['pool', id],
    queryFn: () => fetch(`/api/pools/${id}`).then((r) => r.json()),
  });

  const { data: priceData = [] } = useQuery({
    queryKey: ['prices', pool?.hedgeAsset],
    queryFn: () => fetch(`/api/prices?asset=${pool.hedgeAsset}&hours=24`).then((r) => r.json()),
    enabled: !!pool?.hedgeAsset,
  });

  const { data: hedges = [] } = useQuery({
    queryKey: ['pool-hedges', id],
    queryFn: () => fetch(`/api/hedges?poolId=${id}`).then((r) => r.json()),
  });

  if (poolLoading || !pool) {
    return <div className="text-gray-500">Loading pool...</div>;
  }

  if (pool.error) {
    return <div className="text-red-400">Pool not found</div>;
  }

  const currentPrice = pool.currentPrice ? parseFloat(pool.currentPrice) : undefined;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/pools" className="text-gray-500 hover:text-gray-300 text-sm">
              Pools /
            </Link>
            <h1 className="text-2xl font-bold text-white">
              {pool.token0Symbol}/{pool.token1Symbol}
            </h1>
            <NetworkBadge chainName={pool.chainName} />
            <StatusBadge status={pool.status} />
          </div>
          {pool.name && <p className="text-sm text-gray-500">{pool.name}</p>}
        </div>
        <Link
          href={`/pools/${id}/edit`}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Edit Pool
        </Link>
      </div>

      {/* Price Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Price (24h)</h2>
        <PriceChart data={priceData} rangeLower={pool.rangeLower} rangeUpper={pool.rangeUpper} />
      </div>

      {/* Range + Stats */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-3">Range</h2>
          <RangeIndicator lower={pool.rangeLower} upper={pool.rangeUpper} current={currentPrice} />
          {currentPrice !== undefined && (
            <div className="mt-3">
              <p className="text-xs text-gray-500">Current Price</p>
              <p className="text-2xl font-mono font-bold text-white">
                $
                {currentPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Pool Amount</span>
              <span className="text-sm text-white font-medium">
                ${parseFloat(pool.poolAmount).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Hedge Asset</span>
              <span className="text-sm text-white font-medium">{pool.hedgeAsset}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Leverage</span>
              <span className="text-sm text-white font-medium">{pool.leverage}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Fee Tier</span>
              <span className="text-sm text-white font-medium">
                {FEE_LABELS[pool.feeTier] || pool.feeTier}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Direction</span>
              <span className="text-sm text-white font-medium capitalize">
                {pool.protectionDirection}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Protection</span>
              <span
                className={`text-sm font-medium ${pool.protectionActive ? 'text-green-400' : 'text-gray-500'}`}
              >
                {pool.protectionActive ? 'Active' : 'Disabled'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Pool Address</span>
              <span className="text-xs text-gray-400 font-mono">
                {pool.poolAddress.slice(0, 8)}...{pool.poolAddress.slice(-6)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hedges for this pool */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Hedge History</h2>
        {hedges.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No hedges for this pool yet.</div>
        ) : (
          <div className="grid gap-4">
            {hedges.map((hedge: any) => (
              <HedgeCard key={hedge.id} hedge={hedge} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
