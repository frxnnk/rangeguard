'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertBanner } from '@/components/common/AlertBanner';
import { PnLChart } from '@/components/charts/PnLChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Stats {
  totalPools: number;
  activePools: number;
  inRangePools: number;
  openHedges: number;
  falseBreakouts: number;
  totalRealizedPnl: string;
  lowBalanceWallets: Array<{ alias: string; available: string; threshold: string }>;
}

export default function OverviewPage() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then((r) => r.json()),
  });

  const { data: pnlData = [] } = useQuery<Array<{ date: string; pnl: number }>>({
    queryKey: ['pnl-chart'],
    queryFn: () => fetch('/api/pnl').then((r) => r.json()),
  });

  if (!stats)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );

  const cards = [
    { label: 'Active Pools', value: `${stats.activePools}/${stats.totalPools}`, color: 'blue' },
    { label: 'In Range', value: stats.inRangePools.toString(), color: 'green' },
    { label: 'Open Hedges', value: stats.openHedges.toString(), color: 'yellow' },
    {
      label: 'Realized P&L',
      value: `$${parseFloat(stats.totalRealizedPnl).toLocaleString()}`,
      color: parseFloat(stats.totalRealizedPnl) >= 0 ? 'green' : 'red',
    },
    { label: 'False Breakouts', value: stats.falseBreakouts.toString(), color: 'orange' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  };

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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {cards.map((card) => (
          <Card key={card.label} className={`${colorMap[card.color]}`}>
            <CardContent className="p-4">
              <p className="text-xs opacity-70 mb-1">{card.label}</p>
              <p className="text-2xl font-bold">{card.value}</p>
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
