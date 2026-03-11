'use client';

import { useQuery } from '@tanstack/react-query';
import { WalletCard } from './WalletCard';

interface WalletRow {
  id: string;
  alias: string;
  address: string;
  walletType: string;
  balanceAvailable?: string;
  balanceMarginUsed?: string;
  balanceTotal?: string;
  lowBalanceThreshold: string;
  lastBalanceCheck?: number;
}

export function WalletList() {
  const { data: wallets = [], isLoading } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallets').then((r) => r.json()),
  });

  if (isLoading) return <div className="text-gray-500">Cargando billeteras...</div>;
  if (wallets.length === 0)
    return <div className="text-gray-500">No hay billeteras registradas.</div>;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {wallets.map((wallet: WalletRow) => (
        <WalletCard key={wallet.id} wallet={wallet} />
      ))}
    </div>
  );
}
