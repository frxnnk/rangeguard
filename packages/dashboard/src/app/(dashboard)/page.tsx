'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertBanner } from '@/components/common/AlertBanner';
import { PnLChart } from '@/components/charts/PnLChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, CircleCheck, Shield, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';

interface Stats {
  totalPools: number;
  activePools: number;
  inRangePools: number;
  openHedges: number;
  falseBreakouts: number;
  totalRealizedPnl: string;
  totalUnrealizedPnl: string;
  lowBalanceWallets: Array<{ alias: string; available: string; threshold: string }>;
}

export default function OverviewPage() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: pnlData = [] } = useQuery<Array<{ date: string; pnl: number }>>({
    queryKey: ['pnl-chart'],
    queryFn: () => fetch('/api/pnl').then((r) => r.json()),
  });

  if (!stats)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[360px] rounded-xl" />
      </div>
    );

  const pnl = parseFloat(stats.totalRealizedPnl);
  const unrealizedPnl = parseFloat(stats.totalUnrealizedPnl);

  const cards = [
    {
      label: 'Active Pools',
      value: `${stats.activePools}/${stats.totalPools}`,
      icon: Activity,
      accent: 'text-blue-400',
    },
    {
      label: 'In Range',
      value: stats.inRangePools.toString(),
      icon: CircleCheck,
      accent: 'text-green-400',
    },
    {
      label: 'Open Hedges',
      value: stats.openHedges.toString(),
      icon: Shield,
      accent: 'text-yellow-400',
    },
    {
      label: 'Realized P&L',
      value: `$${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      accent: pnl >= 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Unrealized P&L',
      value: `$${unrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: TrendingUp,
      accent: unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'False Breakouts',
      value: stats.falseBreakouts.toString(),
      icon: AlertTriangle,
      accent: 'text-orange-400',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Overview</h1>

      {stats.lowBalanceWallets.length > 0 && (
        <div className="mb-6 space-y-2">
          {stats.lowBalanceWallets.map((w) => (
            <AlertBanner
              key={w.alias}
              type="warning"
              message={`Wallet "${w.alias}" has low balance: $${parseFloat(w.available).toFixed(2)} (threshold: $${w.threshold})`}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
                <card.icon className={`size-4 ${card.accent}`} aria-hidden="true" />
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cumulative P&L</CardTitle>
        </CardHeader>
        <CardContent>
          <PnLChart data={pnlData} />
        </CardContent>
      </Card>
    </div>
  );
}
