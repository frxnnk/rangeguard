'use client';

import { useState } from 'react';
import { WalletList } from '@/components/wallets/WalletList';
import { WalletForm } from '@/components/wallets/WalletForm';
import { Button } from '@/components/ui/button';

export default function WalletsPage() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Wallets</h1>
        {!showForm && <Button onClick={() => setShowForm(true)}>+ Add Wallet</Button>}
      </div>

      {showForm && (
        <div className="mb-6">
          <WalletForm onClose={() => setShowForm(false)} />
        </div>
      )}

      <WalletList />
    </div>
  );
}
