'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function WalletForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    alias: '',
    address: '',
    walletType: 'protection' as 'protection' | 'profit',
    lowBalanceThreshold: '100',
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to create wallet');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.alias.trim()) {
      setError('Alias is required');
      return;
    }
    if (!form.address.trim() || !form.address.startsWith('0x')) {
      setError('Valid Ethereum address required (0x...)');
      return;
    }

    createMutation.mutate(form);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Add Wallet</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm">
          Cancel
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Alias</label>
          <input
            type="text"
            value={form.alias}
            onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
            placeholder="hedge-wallet-1"
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Address</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="0x..."
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Type</label>
            <select
              value={form.walletType}
              onChange={(e) =>
                setForm((f) => ({ ...f, walletType: e.target.value as 'protection' | 'profit' }))
              }
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="protection">Protection</option>
              <option value="profit">Profit</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Low Balance Threshold ($)</label>
            <input
              type="number"
              step="any"
              value={form.lowBalanceThreshold}
              onChange={(e) => setForm((f) => ({ ...f, lowBalanceThreshold: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
          >
            {createMutation.isPending ? 'Adding...' : 'Add Wallet'}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          After adding, run{' '}
          <code className="text-green-400 bg-gray-800 px-1 rounded">pnpm setup-keys</code> to add
          the private key to the vault.
        </p>
      </form>
    </div>
  );
}
