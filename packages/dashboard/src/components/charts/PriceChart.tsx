'use client';

import {
  AreaChart,
  Area,
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
  destructive: '#ef4444', // --destructive
  chartLine: '#818cf8', // brighter indigo for visibility on dark bg
};

interface PriceChartProps {
  data: Array<{ time: string; price: number }>;
  rangeLower?: number;
  rangeUpper?: number;
}

export function PriceChart({ data, rangeLower, rangeUpper }: PriceChartProps) {
  if (data.length === 0) {
    return <div className="text-muted-foreground text-center py-8">No price data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <XAxis dataKey="time" stroke={CHART_COLORS.mutedForeground} fontSize={12} />
        <YAxis stroke={CHART_COLORS.mutedForeground} fontSize={12} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_COLORS.card,
            border: `1px solid ${CHART_COLORS.border}`,
            borderRadius: '8px',
          }}
          labelStyle={{ color: CHART_COLORS.mutedForeground }}
        />
        {rangeLower && (
          <ReferenceLine
            y={rangeLower}
            stroke={CHART_COLORS.destructive}
            strokeDasharray="3 3"
            label={{ value: 'Lower', fill: CHART_COLORS.destructive, fontSize: 11 }}
          />
        )}
        {rangeUpper && (
          <ReferenceLine
            y={rangeUpper}
            stroke={CHART_COLORS.destructive}
            strokeDasharray="3 3"
            label={{ value: 'Upper', fill: CHART_COLORS.destructive, fontSize: 11 }}
          />
        )}
        <Area
          type="monotone"
          dataKey="price"
          stroke={CHART_COLORS.chartLine}
          fill={CHART_COLORS.chartLine}
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
