'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    rangeLower: '2000',
    rangeUpper: '2500',
    poolAmount: '10000',
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
        <div className="space-y-2">
          <Label>Network</Label>
          <Select
            value={form.chainId.toString()}
            onValueChange={(value) => {
              const chainId = parseInt(value);
              const chain = CHAINS.find((c) => c.id === chainId);
              setForm((f) => ({ ...f, chainId, chainName: chain?.name || '' }));
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHAINS.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pair */}
        <div className="space-y-2">
          <Label>Pair</Label>
          <Select
            value={form.pairIndex.toString()}
            onValueChange={(value) => setForm((f) => ({ ...f, pairIndex: parseInt(value) }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEFAULT_PAIRS.map((p, i) => (
                <SelectItem key={i} value={i.toString()}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pool Address */}
      <div className="space-y-2">
        <Label>Pool Address</Label>
        <Input
          type="text"
          value={form.poolAddress}
          onChange={(e) => setForm((f) => ({ ...f, poolAddress: e.target.value }))}
          placeholder="0x\u2026"
          required
          className="bg-muted border-border text-foreground font-mono"
        />
      </div>

      {/* Fee Tier */}
      <div className="space-y-2">
        <Label>Fee Tier</Label>
        <Select
          value={form.feeTier.toString()}
          onValueChange={(value) => setForm((f) => ({ ...f, feeTier: parseInt(value) }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEE_TIERS.map((ft) => (
              <SelectItem key={ft.value} value={ft.value.toString()}>
                {ft.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
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
        <div className="space-y-2">
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
      <div className="space-y-2">
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
      <div className="space-y-2">
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
        <div className="space-y-2">
          <Label>Leverage</Label>
          <Select
            value={form.leverage.toString()}
            onValueChange={(value) => setForm((f) => ({ ...f, leverage: parseInt(value) }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10x</SelectItem>
              <SelectItem value="20">20x</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Protection Direction */}
        <div className="space-y-2">
          <Label>Protection Direction</Label>
          <Select
            value={form.protectionDirection}
            onValueChange={(value) =>
              setForm((f) => ({
                ...f,
                protectionDirection: value as 'below' | 'above' | 'both',
              }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="below">Below only (Short)</SelectItem>
              <SelectItem value="above">Above only (Long)</SelectItem>
              <SelectItem value="both">Both directions</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Protection Wallet */}
      <div className="space-y-2">
        <Label>Protection Wallet</Label>
        <Select
          value={form.protectionWalletId}
          onValueChange={(value) => setForm((f) => ({ ...f, protectionWalletId: value }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select wallet\u2026" />
          </SelectTrigger>
          <SelectContent>
            {protectionWallets.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.alias}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {protectionWallets.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            No protection wallets registered. Add one in Settings first.
          </p>
        )}
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id="profit-wallet-new"
            checked={form.profitWalletEnabled}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, profitWalletEnabled: checked }))}
          />
          <Label htmlFor="profit-wallet-new" className="cursor-pointer">
            Mirror on profit wallet
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="protection-active-new"
            checked={form.protectionActive}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, protectionActive: checked }))}
          />
          <Label htmlFor="protection-active-new" className="cursor-pointer">
            Protection active
          </Label>
        </div>
      </div>

      <Button className="w-full" disabled={submitting}>
        {submitting ? 'Creating\u2026' : 'Create Pool'}
      </Button>
    </form>
  );
}
