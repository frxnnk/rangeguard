'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

const CHAINS = [
  { id: 1, name: 'Ethereum' },
  { id: 42161, name: 'Arbitrum' },
  { id: 8453, name: 'Base' },
  { id: 137, name: 'Polygon' },
];

const DEFAULT_PAIRS = [
  { token0: 'WETH', token1: 'USDC', label: 'ETH/USDC', hedgeAsset: 'ETH' },
  { token0: 'WETH', token1: 'USDT', label: 'ETH/USDT', hedgeAsset: 'ETH' },
  { token0: 'WBTC', token1: 'USDC', label: 'BTC/USDC', hedgeAsset: 'BTC' },
  { token0: 'WBTC', token1: 'WETH', label: 'BTC/ETH', hedgeAsset: 'BTC' },
  { token0: 'WETH', token1: 'DAI', label: 'ETH/DAI', hedgeAsset: 'ETH' },
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

export function PoolForm() {
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    chainId: 42161,
    chainName: 'Arbitrum',
    rpcUrl: '',
    pairIndex: 0,
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
    fetch('/api/wallets')
      .then((r) => r.json())
      .then(setWallets)
      .catch(console.error);
  }, []);

  const selectedPair = DEFAULT_PAIRS[form.pairIndex] || DEFAULT_PAIRS[0];
  const protectionWallets = wallets.filter((w) => w.walletType === 'protection');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const chain = CHAINS.find((c) => c.id === form.chainId);
      const body = {
        name: form.name || `${selectedPair.label} ${chain?.name || ''}`,
        chainId: form.chainId,
        chainName: chain?.name || 'Unknown',
        rpcUrl: form.rpcUrl || undefined,
        poolAddress: form.poolAddress,
        token0Symbol: selectedPair.token0,
        token1Symbol: selectedPair.token1,
        feeTier: form.feeTier,
        rangeLower: parseFloat(form.rangeLower),
        rangeUpper: parseFloat(form.rangeUpper),
        poolAmount: form.poolAmount,
        hedgeAsset: selectedPair.hedgeAsset,
        leverage: form.leverage,
        protectionDirection: form.protectionDirection,
        protectionWalletId: form.protectionWalletId,
        profitWalletEnabled: form.profitWalletEnabled,
        protectionActive: form.protectionActive,
      };

      const res = await fetch('/api/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create pool');
      }

      router.push('/pools');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Chain */}
        <div>
          <Label>Network</Label>
          <select
            value={form.chainId}
            onChange={(e) => {
              const chainId = parseInt(e.target.value);
              const chain = CHAINS.find((c) => c.id === chainId);
              setForm((f) => ({ ...f, chainId, chainName: chain?.name || '' }));
            }}
            className="w-full bg-muted border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Pair */}
        <div>
          <Label>Pair</Label>
          <select
            value={form.pairIndex}
            onChange={(e) => setForm((f) => ({ ...f, pairIndex: parseInt(e.target.value) }))}
            className="w-full bg-muted border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
          >
            {DEFAULT_PAIRS.map((p, i) => (
              <option key={i} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Pool Address */}
      <div>
        <Label>Pool Address</Label>
        <Input
          type="text"
          value={form.poolAddress}
          onChange={(e) => setForm((f) => ({ ...f, poolAddress: e.target.value }))}
          placeholder="0x..."
          required
          className="bg-muted border-border text-foreground font-mono"
        />
      </div>

      {/* Fee Tier */}
      <div>
        <Label>Fee Tier</Label>
        <select
          value={form.feeTier}
          onChange={(e) => setForm((f) => ({ ...f, feeTier: parseInt(e.target.value) }))}
          className="w-full bg-muted border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
        >
          {FEE_TIERS.map((ft) => (
            <option key={ft.value} value={ft.value}>
              {ft.label}
            </option>
          ))}
        </select>
      </div>

      {/* Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Range Lower ($)</Label>
          <Input
            type="number"
            step="any"
            value={form.rangeLower}
            onChange={(e) => setForm((f) => ({ ...f, rangeLower: e.target.value }))}
            placeholder="2000"
            required
            className="bg-muted border-border text-foreground"
          />
        </div>
        <div>
          <Label>Range Upper ($)</Label>
          <Input
            type="number"
            step="any"
            value={form.rangeUpper}
            onChange={(e) => setForm((f) => ({ ...f, rangeUpper: e.target.value }))}
            placeholder="2500"
            required
            className="bg-muted border-border text-foreground"
          />
        </div>
      </div>

      {/* Pool Amount */}
      <div>
        <Label>Pool Amount (USD)</Label>
        <Input
          type="number"
          step="any"
          value={form.poolAmount}
          onChange={(e) => setForm((f) => ({ ...f, poolAmount: e.target.value }))}
          placeholder="10000"
          required
          className="bg-muted border-border text-foreground"
        />
      </div>

      {/* Name (optional) */}
      <div>
        <Label>Name (optional)</Label>
        <Input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="ETH/USDC Arbitrum Narrow"
          className="bg-muted border-border text-foreground"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Leverage */}
        <div>
          <Label>Leverage</Label>
          <select
            value={form.leverage}
            onChange={(e) => setForm((f) => ({ ...f, leverage: parseInt(e.target.value) }))}
            className="w-full bg-muted border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
          >
            <option value={10}>10x</option>
            <option value={20}>20x</option>
          </select>
        </div>

        {/* Protection Direction */}
        <div>
          <Label>Protection Direction</Label>
          <select
            value={form.protectionDirection}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                protectionDirection: e.target.value as 'below' | 'above' | 'both',
              }))
            }
            className="w-full bg-muted border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
          >
            <option value="below">Below only (Short)</option>
            <option value="above">Above only (Long)</option>
            <option value="both">Both directions</option>
          </select>
        </div>
      </div>

      {/* Protection Wallet */}
      <div>
        <Label>Protection Wallet</Label>
        <select
          value={form.protectionWalletId}
          onChange={(e) => setForm((f) => ({ ...f, protectionWalletId: e.target.value }))}
          required
          className="w-full bg-muted border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
        >
          <option value="">Select wallet...</option>
          {protectionWallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.alias}
            </option>
          ))}
        </select>
        {protectionWallets.length === 0 && (
          <p className="text-xs text-yellow-500 mt-1">
            No protection wallets registered. Add one in Settings first.
          </p>
        )}
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
          <input
            type="checkbox"
            checked={form.profitWalletEnabled}
            onChange={(e) => setForm((f) => ({ ...f, profitWalletEnabled: e.target.checked }))}
            className="rounded bg-muted border-border"
          />
          Mirror on profit wallet
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
          <input
            type="checkbox"
            checked={form.protectionActive}
            onChange={(e) => setForm((f) => ({ ...f, protectionActive: e.target.checked }))}
            className="rounded bg-muted border-border"
          />
          Protection active
        </label>
      </div>

      <Button className="w-full" disabled={submitting}>
        {submitting ? 'Creating...' : 'Create Pool'}
      </Button>
    </form>
  );
}
