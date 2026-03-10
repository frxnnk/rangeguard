'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';

const CHAINS = [
  { id: 1, name: 'Ethereum' },
  { id: 42161, name: 'Arbitrum' },
  { id: 8453, name: 'Base' },
  { id: 137, name: 'Polygon' },
];

const FEE_TIERS = [
  { value: 100, label: '0.01%' },
  { value: 500, label: '0.05%' },
  { value: 3000, label: '0.3%' },
  { value: 10000, label: '1%' },
];

interface Wallet {
  id: string;
  alias: string;
  walletType: string;
}

export default function EditPoolPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    chainId: 42161,
    chainName: 'Arbitrum',
    rpcUrl: '',
    poolAddress: '',
    feeTier: 500,
    rangeLower: '',
    rangeUpper: '',
    poolAmount: '',
    leverage: 10,
    protectionDirection: 'both' as 'below' | 'above' | 'both',
    protectionWalletId: '',
    profitWalletEnabled: true,
    protectionActive: true,
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/pools/${id}`).then((r) => r.json()),
      fetch('/api/wallets').then((r) => r.json()),
    ])
      .then(([pool, w]) => {
        if (pool.error) {
          setError('Pool not found');
          return;
        }
        setForm({
          name: pool.name || '',
          chainId: pool.chainId,
          chainName: pool.chainName,
          rpcUrl: pool.rpcUrl || '',
          poolAddress: pool.poolAddress,
          feeTier: pool.feeTier,
          rangeLower: pool.rangeLower.toString(),
          rangeUpper: pool.rangeUpper.toString(),
          poolAmount: pool.poolAmount,
          leverage: pool.leverage,
          protectionDirection: pool.protectionDirection,
          protectionWalletId: pool.protectionWalletId,
          profitWalletEnabled: pool.profitWalletEnabled,
          protectionActive: pool.protectionActive,
        });
        setWallets(w);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load pool data');
        setLoading(false);
      });
  }, [id]);

  const protectionWallets = wallets.filter((w) => w.walletType === 'protection');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const chain = CHAINS.find((c) => c.id === form.chainId);
      const body = {
        name: form.name,
        chainId: form.chainId,
        chainName: chain?.name || form.chainName,
        rpcUrl: form.rpcUrl || undefined,
        poolAddress: form.poolAddress,
        feeTier: form.feeTier,
        rangeLower: parseFloat(form.rangeLower),
        rangeUpper: parseFloat(form.rangeUpper),
        poolAmount: form.poolAmount,
        leverage: form.leverage,
        protectionDirection: form.protectionDirection,
        protectionWalletId: form.protectionWalletId,
        profitWalletEnabled: form.profitWalletEnabled,
        protectionActive: form.protectionActive,
      };

      const res = await fetch(`/api/pools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update pool');
      }

      router.push(`/pools/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Edit Pool</h1>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Network</label>
            <select
              value={form.chainId}
              onChange={(e) => {
                const chainId = parseInt(e.target.value);
                const chain = CHAINS.find((c) => c.id === chainId);
                setForm((f) => ({ ...f, chainId, chainName: chain?.name || '' }));
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fee Tier</label>
            <select
              value={form.feeTier}
              onChange={(e) => setForm((f) => ({ ...f, feeTier: parseInt(e.target.value) }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {FEE_TIERS.map((ft) => (
                <option key={ft.value} value={ft.value}>
                  {ft.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Pool Address</label>
          <input
            type="text"
            value={form.poolAddress}
            onChange={(e) => setForm((f) => ({ ...f, poolAddress: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Range Lower ($)</label>
            <input
              type="number"
              step="any"
              value={form.rangeLower}
              onChange={(e) => setForm((f) => ({ ...f, rangeLower: e.target.value }))}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Range Upper ($)</label>
            <input
              type="number"
              step="any"
              value={form.rangeUpper}
              onChange={(e) => setForm((f) => ({ ...f, rangeUpper: e.target.value }))}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Pool Amount (USD)</label>
          <input
            type="number"
            step="any"
            value={form.poolAmount}
            onChange={(e) => setForm((f) => ({ ...f, poolAmount: e.target.value }))}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Name (optional)</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Leverage</label>
            <select
              value={form.leverage}
              onChange={(e) => setForm((f) => ({ ...f, leverage: parseInt(e.target.value) }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value={10}>10x</option>
              <option value={20}>20x</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Protection Direction</label>
            <select
              value={form.protectionDirection}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  protectionDirection: e.target.value as 'below' | 'above' | 'both',
                }))
              }
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="below">Below only (Short)</option>
              <option value="above">Above only (Long)</option>
              <option value="both">Both directions</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Protection Wallet</label>
          <select
            value={form.protectionWalletId}
            onChange={(e) => setForm((f) => ({ ...f, protectionWalletId: e.target.value }))}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">Select wallet...</option>
            {protectionWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.alias}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.profitWalletEnabled}
              onChange={(e) => setForm((f) => ({ ...f, profitWalletEnabled: e.target.checked }))}
              className="rounded bg-gray-800 border-gray-700"
            />
            Mirror on profit wallet
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.protectionActive}
              onChange={(e) => setForm((f) => ({ ...f, protectionActive: e.target.checked }))}
              className="rounded bg-gray-800 border-gray-700"
            />
            Protection active
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
