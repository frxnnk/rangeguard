'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
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

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground mb-1">Pool / Edit Pool</p>
        <h1 className="text-2xl font-bold text-foreground">Edit Pool</h1>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="space-y-2">
              <Label>Pool Address</Label>
              <Input
                type="text"
                value={form.poolAddress}
                onChange={(e) => setForm((f) => ({ ...f, poolAddress: e.target.value }))}
                className="bg-muted border-border text-foreground font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Range Lower ($)</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.rangeLower}
                  onChange={(e) => setForm((f) => ({ ...f, rangeLower: e.target.value }))}
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
                  required
                  className="bg-muted border-border text-foreground"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pool Amount (USD)</Label>
              <Input
                type="number"
                step="any"
                value={form.poolAmount}
                onChange={(e) => setForm((f) => ({ ...f, poolAmount: e.target.value }))}
                required
                className="bg-muted border-border text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-muted border-border text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="profit-wallet"
                  checked={form.profitWalletEnabled}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, profitWalletEnabled: checked }))
                  }
                />
                <Label htmlFor="profit-wallet" className="cursor-pointer">
                  Mirror on profit wallet
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="protection-active"
                  checked={form.protectionActive}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, protectionActive: checked }))
                  }
                />
                <Label htmlFor="protection-active" className="cursor-pointer">
                  Protection active
                </Label>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Saving\u2026' : 'Save Changes'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
