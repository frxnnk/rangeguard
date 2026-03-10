import { StatusBadge } from '@/components/common/StatusBadge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

interface HedgeCardProps {
  hedge: {
    id: string;
    asset: string;
    side: string;
    size: string;
    entryPrice: string;
    leverage: number;
    status: string;
    walletType: string;
    fees: string;
    realizedPnl?: string;
    unrealizedPnl?: string;
    unrealizedPnlUpdatedAt?: number;
    openedAt: number;
  };
}

export function HedgeCard({ hedge }: HedgeCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-lg font-bold',
                hedge.side === 'short' ? 'text-red-400' : 'text-green-400',
              )}
            >
              {hedge.side.toUpperCase()}
            </span>
            <span className="text-lg font-semibold text-foreground">{hedge.asset}</span>
            <span className="text-xs text-muted-foreground">{hedge.leverage}x</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                hedge.walletType === 'protection'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : 'bg-purple-500/10 text-purple-400 border-purple-500/30',
              )}
            >
              {hedge.walletType}
            </Badge>
            <StatusBadge status={hedge.status} />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Size</p>
            <p className="text-sm font-medium text-foreground">
              {parseFloat(hedge.size).toFixed(4)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Entry Price</p>
            <p className="text-sm font-medium text-foreground">
              ${parseFloat(hedge.entryPrice).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fees</p>
            <p className="text-sm font-medium text-foreground">
              ${parseFloat(hedge.fees).toFixed(2)}
            </p>
          </div>
          {hedge.unrealizedPnl && hedge.status === 'open' && (
            <div>
              <p className="text-xs text-muted-foreground">Unrealized P&L</p>
              <p
                className={cn(
                  'text-sm font-medium',
                  parseFloat(hedge.unrealizedPnl) >= 0 ? 'text-green-400' : 'text-red-400',
                )}
              >
                ${parseFloat(hedge.unrealizedPnl).toFixed(2)}
              </p>
            </div>
          )}
          {hedge.realizedPnl && (
            <div>
              <p className="text-xs text-muted-foreground">Realized P&L</p>
              <p
                className={cn(
                  'text-sm font-medium',
                  parseFloat(hedge.realizedPnl) >= 0 ? 'text-green-400' : 'text-red-400',
                )}
              >
                ${parseFloat(hedge.realizedPnl).toFixed(2)}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-muted-foreground">
            Opened {new Date(hedge.openedAt).toLocaleString()}
          </p>
          {hedge.unrealizedPnlUpdatedAt && hedge.status === 'open' && (
            <p className="text-xs text-muted-foreground">
              Updated {formatTimeAgo(hedge.unrealizedPnlUpdatedAt)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
