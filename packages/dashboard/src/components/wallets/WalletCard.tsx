interface WalletCardProps {
  wallet: {
    id: string;
    alias: string;
    address: string;
    walletType: string;
    balanceAvailable?: string;
    balanceMarginUsed?: string;
    balanceTotal?: string;
    lowBalanceThreshold: string;
    lastBalanceCheck?: number;
  };
}

export function WalletCard({ wallet }: WalletCardProps) {
  const available = wallet.balanceAvailable ? parseFloat(wallet.balanceAvailable) : null;
  const marginUsed = wallet.balanceMarginUsed ? parseFloat(wallet.balanceMarginUsed) : null;
  const total = wallet.balanceTotal ? parseFloat(wallet.balanceTotal) : null;
  const threshold = parseFloat(wallet.lowBalanceThreshold);
  const isLow = available !== null && available < threshold;

  return (
    <div
      className={`bg-gray-900 border rounded-xl p-5 ${isLow ? 'border-yellow-500/50' : 'border-gray-800'}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{wallet.alias}</h3>
          <p className="text-xs text-gray-500 font-mono mt-0.5">
            {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
          </p>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            wallet.walletType === 'protection'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-purple-500/20 text-purple-400'
          }`}
        >
          {wallet.walletType}
        </span>
      </div>

      {isLow && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-3 py-2 rounded-lg text-xs mb-3">
          Low balance! Below ${threshold} threshold
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-gray-500">Available</p>
          <p className={`text-sm font-medium ${isLow ? 'text-yellow-400' : 'text-white'}`}>
            {available !== null ? `$${available.toFixed(2)}` : '--'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Margin Used</p>
          <p className="text-sm font-medium text-white">
            {marginUsed !== null ? `$${marginUsed.toFixed(2)}` : '--'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-sm font-medium text-white">
            {total !== null ? `$${total.toFixed(2)}` : '--'}
          </p>
        </div>
      </div>

      {wallet.lastBalanceCheck && (
        <p className="text-xs text-gray-600 mt-3">
          Updated {new Date(wallet.lastBalanceCheck).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
