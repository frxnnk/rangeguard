import { StatusBadge } from '@/components/common/StatusBadge';

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
    openedAt: number;
  };
}

export function HedgeCard({ hedge }: HedgeCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`text-lg font-bold ${
              hedge.side === 'short' ? 'text-red-400' : 'text-green-400'
            }`}
          >
            {hedge.side.toUpperCase()}
          </span>
          <span className="text-lg font-semibold text-white">{hedge.asset}</span>
          <span className="text-xs text-gray-500">{hedge.leverage}x</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              hedge.walletType === 'protection'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-purple-500/20 text-purple-400'
            }`}
          >
            {hedge.walletType}
          </span>
          <StatusBadge status={hedge.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-xs text-gray-500">Size</p>
          <p className="text-sm font-medium text-white">{parseFloat(hedge.size).toFixed(4)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Entry Price</p>
          <p className="text-sm font-medium text-white">
            ${parseFloat(hedge.entryPrice).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Fees</p>
          <p className="text-sm font-medium text-white">${parseFloat(hedge.fees).toFixed(2)}</p>
        </div>
        {hedge.realizedPnl && (
          <div>
            <p className="text-xs text-gray-500">P&L</p>
            <p
              className={`text-sm font-medium ${
                parseFloat(hedge.realizedPnl) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              ${parseFloat(hedge.realizedPnl).toFixed(2)}
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-600 mt-3">
        Opened {new Date(hedge.openedAt).toLocaleString()}
      </p>
    </div>
  );
}
