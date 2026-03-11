'use client';

import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, ResponsiveContainer, ReferenceLine } from 'recharts';

interface WalletPnlSparklineProps {
  walletId: string;
}

export function WalletPnlSparkline({ walletId }: WalletPnlSparklineProps) {
  const { data: series = [] } = useQuery<Array<{ t: number; pnl: number }>>({
    queryKey: ['wallet-pnl', walletId],
    queryFn: () => fetch(`/api/wallets/${walletId}/pnl`).then((r) => r.json()),
    staleTime: 60_000,
  });

  if (series.length < 2) return null;

  const lastPnl = series[series.length - 1].pnl;
  const color = lastPnl >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground">PnL Acumulado</p>
        <p className={`text-sm font-semibold ${lastPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {lastPnl >= 0 ? '+' : ''}${lastPnl.toFixed(2)}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={series}>
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="pnl"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
