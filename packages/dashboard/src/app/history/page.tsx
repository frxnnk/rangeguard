'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

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
        <h1 className="text-2xl font-bold text-foreground">Trade History</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            False breakouts:{' '}
            <span className="text-orange-400 font-medium">{falseBreakoutCount}</span>
          </span>
          <div className="flex items-center gap-2">
            <Switch
              id="false-breakouts"
              checked={showFalseBreakoutsOnly}
              onCheckedChange={setShowFalseBreakoutsOnly}
            />
            <Label
              htmlFor="false-breakouts"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              False breakouts only
            </Label>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No trade history yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>Exit</TableHead>
                <TableHead>P&L</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((trade: any) => {
                const pnl = trade.realizedPnl ? parseFloat(trade.realizedPnl) : 0;
                return (
                  <TableRow key={trade.id}>
                    <TableCell className="text-muted-foreground">
                      {trade.closedAt ? new Date(trade.closedAt).toLocaleDateString() : '--'}
                    </TableCell>
                    <TableCell className="font-medium">{trade.asset}</TableCell>
                    <TableCell
                      className={`font-medium ${trade.side === 'short' ? 'text-red-400' : 'text-green-400'}`}
                    >
                      {trade.side.toUpperCase()}
                    </TableCell>
                    <TableCell>{parseFloat(trade.size).toFixed(4)}</TableCell>
                    <TableCell>${parseFloat(trade.entryPrice).toLocaleString()}</TableCell>
                    <TableCell>
                      {trade.exitPrice ? `$${parseFloat(trade.exitPrice).toLocaleString()}` : '--'}
                    </TableCell>
                    <TableCell
                      className={`font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {trade.realizedPnl ? `$${pnl.toFixed(2)}` : '--'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          trade.walletType === 'protection'
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                        }
                      >
                        {trade.walletType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {trade.isFalseBreakout && (
                        <Badge
                          variant="outline"
                          className="bg-orange-500/20 text-orange-400 border-orange-500/30"
                        >
                          False Breakout
                        </Badge>
                      )}
                      {trade.closeReason && !trade.isFalseBreakout && (
                        <span className="text-xs text-muted-foreground">{trade.closeReason}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
