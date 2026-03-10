'use client';

import { useState } from 'react';
import { WalletList } from '@/components/wallets/WalletList';
import { WalletForm } from '@/components/wallets/WalletForm';

export default function WalletsPage() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Wallets</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Add Wallet
          </button>
        )}
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
