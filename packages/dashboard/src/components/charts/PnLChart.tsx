'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// Colors matched to dark theme CSS variables (oklch)
const CHART_COLORS = {
  mutedForeground: '#a1a1aa', // --muted-foreground
  card: '#1c1c1e', // --card
  border: 'rgba(255,255,255,0.1)', // --border
  chartLine: '#818cf8', // brighter indigo for visibility on dark bg
};

interface PnLChartProps {
  data: Array<{ date: string; pnl: number }>;
}

export function PnLChart({ data }: PnLChartProps) {
  if (data.length === 0) {
    return <div className="text-muted-foreground text-center py-8">Sin datos de PnL</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <XAxis dataKey="date" stroke={CHART_COLORS.mutedForeground} fontSize={12} />
        <YAxis stroke={CHART_COLORS.mutedForeground} fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_COLORS.card,
            border: `1px solid ${CHART_COLORS.border}`,
            borderRadius: '8px',
          }}
          labelStyle={{ color: CHART_COLORS.mutedForeground }}
        />
        <ReferenceLine y={0} stroke={CHART_COLORS.border} strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="pnl"
          stroke={CHART_COLORS.chartLine}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
