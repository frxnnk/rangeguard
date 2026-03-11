'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { NetworkBadge } from '@/components/common/NetworkBadge';
import { RangeIndicator } from '@/components/pools/RangeIndicator';
import { PoolEditSheet } from '@/components/pools/PoolEditSheet';
import { PriceChart } from '@/components/charts/PriceChart';
import { HedgeCard } from '@/components/hedges/HedgeCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldOff, DollarSign, TrendingUp, Activity, Trash2, Pencil } from 'lucide-react';

const FEE_LABELS: Record<number, string> = {
  100: '0.01%',
  500: '0.05%',
  3000: '0.3%',
  10000: '1%',
};

export default function PoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [editOpen, setEditOpen] = useState(false);

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

  const { data: costsData } = useQuery<{
    stats: { totalTrades: number; totalPnl: number; totalFees: number; wins: number; losses: number };
  }>({
    queryKey: ['pool-costs', id],
    queryFn: () => fetch(`/api/pools/${id}/costs`).then((r) => r.json()),
  });

  const queryClient = useQueryClient();
  const deleteHistoryMutation = useMutation({
    mutationFn: () => fetch(`/api/pools/${id}/costs`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pool-costs', id] });
      queryClient.invalidateQueries({ queryKey: ['pool-hedges', id] });
      toast.success('Historial del pool eliminado');
    },
    onError: () => toast.error('Error al eliminar historial'),
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
    return <div className="text-destructive">Pool no encontrado</div>;
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
        <Button variant="secondary" onClick={() => setEditOpen(true)}>
          <Pencil className="size-3.5 mr-1.5" />
          Editar Pool
        </Button>
      </div>

      {/* Price Chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Precio (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <PriceChart data={priceData} rangeLower={pool.rangeLower} rangeUpper={pool.rangeUpper} />
        </CardContent>
      </Card>

      {/* Range + Stats */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Rango</CardTitle>
          </CardHeader>
          <CardContent>
            <RangeIndicator
              lower={pool.rangeLower}
              upper={pool.rangeUpper}
              current={currentPrice}
            />
            {currentPrice !== undefined && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Precio Actual</p>
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
            <CardTitle>Configuración</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Monto del Pool</span>
                <span className="text-sm text-foreground font-medium">
                  ${parseFloat(pool.poolAmount).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Activo de Cobertura</span>
                <span className="text-sm text-foreground font-medium">{pool.hedgeAsset}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Apalancamiento</span>
                <span className="text-sm text-foreground font-medium">{pool.leverage}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Nivel de Fee</span>
                <span className="text-sm text-foreground font-medium">
                  {FEE_LABELS[pool.feeTier] || pool.feeTier}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Dirección</span>
                <span className="text-sm text-foreground font-medium capitalize">
                  {pool.protectionDirection}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Protección</span>
                <span
                  className={`text-sm font-medium ${pool.protectionActive ? 'text-green-400' : 'text-muted-foreground'}`}
                >
                  {pool.protectionActive ? 'Activa' : 'Desactivada'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Dirección del Pool</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {pool.poolAddress.slice(0, 8)}...{pool.poolAddress.slice(-6)}
                </span>
              </div>
              {/* Range Trading status */}
              <div className="border-t border-border pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Trading en Rango</span>
                  <span
                    className={`text-sm font-medium ${pool.tradingEnabled ? 'text-green-400' : 'text-muted-foreground'}`}
                  >
                    {pool.tradingEnabled ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
                {pool.tradingEnabled && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Apalancamiento Trading</span>
                      <span className="text-sm text-foreground font-medium">
                        {pool.tradingLeverage}x
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">SL / Trail</span>
                      <span className="text-sm text-foreground font-medium">
                        {pool.tradingStopLossPercent}% / {pool.tradingTrailingPercent}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Zona Entrada / Max</span>
                      <span className="text-sm text-foreground font-medium">
                        {pool.tradingEntryZonePercent}% / ${pool.tradingMaxSizeUsd}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pool costs summary */}
      {costsData?.stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                  Total Trades
                </span>
                <Activity className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {costsData.stats.totalTrades}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                  PnL Neto
                </span>
                <TrendingUp
                  className={`size-3.5 ${costsData.stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  aria-hidden="true"
                />
              </div>
              <p
                className={`text-lg font-bold tabular-nums ${costsData.stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {costsData.stats.totalPnl >= 0 ? '+' : ''}${costsData.stats.totalPnl.toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                {costsData.stats.wins}G / {costsData.stats.losses}P
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                  Comisiones
                </span>
                <DollarSign className="size-3.5 text-orange-400" aria-hidden="true" />
              </div>
              <p className="text-lg font-bold text-orange-400 tabular-nums">
                ${costsData.stats.totalFees.toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                  Neto - Fees
                </span>
                <DollarSign
                  className={`size-3.5 ${costsData.stats.totalPnl - costsData.stats.totalFees >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  aria-hidden="true"
                />
              </div>
              <p
                className={`text-lg font-bold tabular-nums ${costsData.stats.totalPnl - costsData.stats.totalFees >= 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                ${(costsData.stats.totalPnl - costsData.stats.totalFees).toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Hedges for this pool */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Historial de Coberturas</h2>
          {hedges.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-destructive"
              onClick={() => {
                if (confirm('¿Eliminar todo el historial de este pool? Esta acción no se puede deshacer.')) {
                  deleteHistoryMutation.mutate();
                }
              }}
              disabled={deleteHistoryMutation.isPending}
            >
              <Trash2 className="size-3.5 mr-1" />
              {deleteHistoryMutation.isPending ? 'Eliminando...' : 'Borrar historial'}
            </Button>
          )}
        </div>
        {hedges.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ShieldOff className="size-10 text-muted-foreground mb-3" aria-hidden="true" />
              <p className="text-muted-foreground text-sm">No hay coberturas para este pool.</p>
              <p className="text-muted-foreground text-xs mt-1">
                Las coberturas se abren automáticamente cuando el precio sale del rango configurado.
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

      <PoolEditSheet poolId={id} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
