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

interface PriceChartProps {
  data: Array<{ time: string; price: number }>;
  rangeLower?: number;
  rangeUpper?: number;
}

export function PriceChart({ data, rangeLower, rangeUpper }: PriceChartProps) {
  if (data.length === 0) {
    return <div className="text-gray-500 text-center py-8">No price data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <XAxis dataKey="time" stroke="#6b7280" fontSize={12} />
        <YAxis stroke="#6b7280" fontSize={12} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '8px',
          }}
          labelStyle={{ color: '#9ca3af' }}
        />
        {rangeLower && (
          <ReferenceLine
            y={rangeLower}
            stroke="#ef4444"
            strokeDasharray="3 3"
            label={{ value: 'Lower', fill: '#ef4444', fontSize: 11 }}
          />
        )}
        {rangeUpper && (
          <ReferenceLine
            y={rangeUpper}
            stroke="#ef4444"
            strokeDasharray="3 3"
            label={{ value: 'Upper', fill: '#ef4444', fontSize: 11 }}
          />
        )}
        <Area
          type="monotone"
          dataKey="price"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.1}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
