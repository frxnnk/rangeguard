'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

export default function HistoryPage() {
  const [showFalseBreakoutsOnly, setShowFalseBreakoutsOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['trades'],
    queryFn: () => fetch('/api/trades?limit=100').then((r) => r.json()),
  });

  const trades = data?.trades || [];
  const falseBreakoutCount = data?.falseBreakouts || 0;

  const filtered = showFalseBreakoutsOnly ? trades.filter((t: any) => t.isFalseBreakout) : trades;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Trade History</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            False breakouts:{' '}
            <span className="text-orange-400 font-medium">{falseBreakoutCount}</span>
          </span>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showFalseBreakoutsOnly}
              onChange={(e) => setShowFalseBreakoutsOnly(e.target.checked)}
              className="rounded bg-gray-800 border-gray-700"
            />
            False breakouts only
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No trade history yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Asset</th>
                <th className="pb-3 font-medium">Side</th>
                <th className="pb-3 font-medium">Size</th>
                <th className="pb-3 font-medium">Entry</th>
                <th className="pb-3 font-medium">Exit</th>
                <th className="pb-3 font-medium">P&L</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((trade: any) => {
                const pnl = trade.realizedPnl ? parseFloat(trade.realizedPnl) : 0;
                return (
                  <tr key={trade.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="py-3 text-gray-400">
                      {trade.closedAt ? new Date(trade.closedAt).toLocaleDateString() : '--'}
                    </td>
                    <td className="py-3 text-white font-medium">{trade.asset}</td>
                    <td
                      className={`py-3 font-medium ${trade.side === 'short' ? 'text-red-400' : 'text-green-400'}`}
                    >
                      {trade.side.toUpperCase()}
                    </td>
                    <td className="py-3 text-white">{parseFloat(trade.size).toFixed(4)}</td>
                    <td className="py-3 text-white">
                      ${parseFloat(trade.entryPrice).toLocaleString()}
                    </td>
                    <td className="py-3 text-white">
                      {trade.exitPrice ? `$${parseFloat(trade.exitPrice).toLocaleString()}` : '--'}
                    </td>
                    <td
                      className={`py-3 font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {trade.realizedPnl ? `$${pnl.toFixed(2)}` : '--'}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          trade.walletType === 'protection'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-purple-500/20 text-purple-400'
                        }`}
                      >
                        {trade.walletType}
                      </span>
                    </td>
                    <td className="py-3">
                      {trade.isFalseBreakout && (
                        <span className="px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400">
                          False Breakout
                        </span>
                      )}
                      {trade.closeReason && !trade.isFalseBreakout && (
                        <span className="text-xs text-gray-500">{trade.closeReason}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
