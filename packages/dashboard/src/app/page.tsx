'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertBanner } from '@/components/common/AlertBanner';
import { PnLChart } from '@/components/charts/PnLChart';

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

  if (!stats) return <div className="text-gray-500">Loading...</div>;

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
      <h1 className="text-2xl font-bold text-white mb-6">Overview</h1>

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
          <div key={card.label} className={`border rounded-xl p-4 ${colorMap[card.color]}`}>
            <p className="text-xs opacity-70 mb-1">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Cumulative P&L Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Cumulative P&L</h2>
        <PnLChart data={pnlData} />
      </div>
    </div>
  );
}
