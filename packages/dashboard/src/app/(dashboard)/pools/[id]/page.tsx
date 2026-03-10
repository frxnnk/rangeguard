'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge } from '@/components/common/StatusBadge';
import { NetworkBadge } from '@/components/common/NetworkBadge';
import { RangeIndicator } from '@/components/pools/RangeIndicator';
import { PriceChart } from '@/components/charts/PriceChart';
import { HedgeCard } from '@/components/hedges/HedgeCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldOff } from 'lucide-react';

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
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-8 w-40" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-[340px] rounded-xl" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (pool.error) {
    return <div className="text-destructive">Pool not found</div>;
  }

  const currentPrice = pool.currentPrice ? parseFloat(pool.currentPrice) : undefined;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/pools" className="text-muted-foreground hover:text-foreground text-sm">
              Pools /
            </Link>
            <h1 className="text-2xl font-bold text-foreground">
              {pool.token0Symbol}/{pool.token1Symbol}
            </h1>
            <NetworkBadge chainName={pool.chainName} />
            <StatusBadge status={pool.status} />
          </div>
          {pool.name && <p className="text-sm text-muted-foreground">{pool.name}</p>}
        </div>
        <Button asChild variant="secondary">
          <Link href={`/pools/${id}/edit`}>Edit Pool</Link>
        </Button>
      </div>

      {/* Price Chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Price (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <PriceChart data={priceData} rangeLower={pool.rangeLower} rangeUpper={pool.rangeUpper} />
        </CardContent>
      </Card>

      {/* Range + Stats */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Range</CardTitle>
          </CardHeader>
          <CardContent>
            <RangeIndicator
              lower={pool.rangeLower}
              upper={pool.rangeUpper}
              current={currentPrice}
            />
            {currentPrice !== undefined && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Current Price</p>
                <p className="text-2xl font-mono font-bold text-foreground">
                  $
                  {currentPrice.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Pool Amount</span>
                <span className="text-sm text-foreground font-medium">
                  ${parseFloat(pool.poolAmount).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Hedge Asset</span>
                <span className="text-sm text-foreground font-medium">{pool.hedgeAsset}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Leverage</span>
                <span className="text-sm text-foreground font-medium">{pool.leverage}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Fee Tier</span>
                <span className="text-sm text-foreground font-medium">
                  {FEE_LABELS[pool.feeTier] || pool.feeTier}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Direction</span>
                <span className="text-sm text-foreground font-medium capitalize">
                  {pool.protectionDirection}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Protection</span>
                <span
                  className={`text-sm font-medium ${pool.protectionActive ? 'text-green-400' : 'text-muted-foreground'}`}
                >
                  {pool.protectionActive ? 'Active' : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Pool Address</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {pool.poolAddress.slice(0, 8)}...{pool.poolAddress.slice(-6)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hedges for this pool */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Hedge History</h2>
        {hedges.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ShieldOff className="size-10 text-muted-foreground mb-3" aria-hidden="true" />
              <p className="text-muted-foreground text-sm">No hedges for this pool yet.</p>
              <p className="text-muted-foreground text-xs mt-1">
                Hedges open automatically when price exits the configured range.
              </p>
            </CardContent>
          </Card>
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
