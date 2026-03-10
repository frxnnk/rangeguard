'use client';

import { useQuery } from '@tanstack/react-query';
import { WalletCard } from './WalletCard';

export function WalletList() {
  const { data: wallets = [], isLoading } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallets').then((r) => r.json()),
  });

  if (isLoading) return <div className="text-gray-500">Loading wallets...</div>;
  if (wallets.length === 0) return <div className="text-gray-500">No wallets registered.</div>;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {wallets.map((wallet: any) => (
        <WalletCard key={wallet.id} wallet={wallet} />
      ))}
    </div>
  );
}
