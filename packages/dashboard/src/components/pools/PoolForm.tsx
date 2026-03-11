'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
  );
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
    hedgeRatio: '1.0',
    hedgeCooldownSeconds: '300',
    debounceCount: '3',
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
        hedgeRatio: parseFloat(form.hedgeRatio),
        hedgeCooldownSeconds: parseInt(form.hedgeCooldownSeconds),
        debounceCount: parseInt(form.debounceCount),
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
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">Nuevo Pool</CardTitle>
        <CardDescription>
          Configurá un pool de Uniswap V3 para monitorear y proteger contra impermanent loss
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* ── Section 1: Pool Identification ── */}
          <section className="space-y-4">
            <SectionHeader
              title="Identificación del Pool"
              description="Red, par y dirección del pool de Uniswap V3"
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Red</Label>
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
                <Label>Par</Label>
                <Select
                  value={form.pairIndex.toString()}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, pairIndex: parseInt(value) }))
                  }
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

            <div className="grid grid-cols-[1fr_auto] gap-4">
              <div className="space-y-2">
                <Label>Dirección del Pool</Label>
                <Input
                  type="text"
                  value={form.poolAddress}
                  onChange={(e) => setForm((f) => ({ ...f, poolAddress: e.target.value }))}
                  placeholder="0x…"
                  required
                  className="bg-muted border-border text-foreground font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Fee Tier</Label>
                <Select
                  value={form.feeTier.toString()}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, feeTier: parseInt(value) }))
                  }
                >
                  <SelectTrigger className="w-[110px]">
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
              <Label>
                Nombre <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={`${selectedPair.label} ${CHAINS.find((c) => c.id === form.chainId)?.name || ''}`}
                className="bg-muted border-border text-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                Se genera automáticamente si se deja vacío
              </p>
            </div>
          </section>

          <Separator />

          {/* ── Section 2: Price Range ── */}
          <section className="space-y-4">
            <SectionHeader
              title="Rango de Precios"
              description="Límites de liquidez concentrada y monto total invertido en el pool"
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rango Inferior ($)</Label>
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
                <Label>Rango Superior ($)</Label>
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
              <Label>Monto del Pool (USD)</Label>
              <Input
                type="number"
                step="any"
                value={form.poolAmount}
                onChange={(e) => setForm((f) => ({ ...f, poolAmount: e.target.value }))}
                required
                className="bg-muted border-border text-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                Valor total de tu posición LP en USD
              </p>
            </div>
          </section>

          <Separator />

          {/* ── Section 3: Protection ── */}
          <section className="space-y-4">
            <SectionHeader
              title="Protección"
              description="Configuración del hedge en Hyperliquid cuando el precio sale del rango"
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Apalancamiento</Label>
                <Select
                  value={form.leverage.toString()}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, leverage: parseInt(value) }))
                  }
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
                <Label>Dirección de Protección</Label>
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
                    <SelectItem value="below">Solo abajo (Short)</SelectItem>
                    <SelectItem value="above">Solo arriba (Long)</SelectItem>
                    <SelectItem value="both">Ambas direcciones</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Wallet de Protección</Label>
              <Select
                value={form.protectionWalletId}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, protectionWalletId: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar wallet…" />
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
                <p className="text-xs text-muted-foreground">
                  No hay wallets de protección registradas. Agregá una primero.
                </p>
              )}
            </div>

            <div className="flex items-center gap-6 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="protection-active-new"
                  checked={form.protectionActive}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, protectionActive: checked }))
                  }
                />
                <Label htmlFor="protection-active-new" className="cursor-pointer">
                  Protección activa
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="profit-wallet-new"
                  checked={form.profitWalletEnabled}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, profitWalletEnabled: checked }))
                  }
                />
                <Label htmlFor="profit-wallet-new" className="cursor-pointer">
                  Replicar en wallet de ganancia
                </Label>
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Section 4: Fine Tuning ── */}
          <section className="space-y-4">
            <SectionHeader
              title="Ajuste Fino"
              description="Parámetros avanzados para el comportamiento del hedge"
            />

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Ratio de Hedge</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="2.0"
                  value={form.hedgeRatio}
                  onChange={(e) => setForm((f) => ({ ...f, hedgeRatio: e.target.value }))}
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-[11px] text-muted-foreground">
                  0.5 = mitad, 1.0 = completo, 2.0 = doble
                </p>
              </div>
              <div className="space-y-2">
                <Label>Debounce (ticks)</Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="20"
                  value={form.debounceCount}
                  onChange={(e) => setForm((f) => ({ ...f, debounceCount: e.target.value }))}
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-[11px] text-muted-foreground">
                  Ticks consecutivos para confirmar salida
                </p>
              </div>
              <div className="space-y-2">
                <Label>Cooldown (seg)</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={form.hedgeCooldownSeconds}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hedgeCooldownSeconds: e.target.value }))
                  }
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-[11px] text-muted-foreground">
                  Espera post-cierre antes de nuevo hedge
                </p>
              </div>
            </div>
          </section>

          <Separator />

          <Button className="w-full" disabled={submitting}>
            {submitting ? 'Creando…' : 'Crear Pool'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
