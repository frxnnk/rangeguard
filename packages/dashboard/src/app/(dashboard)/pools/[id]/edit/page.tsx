'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
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
    hedgeRatio: '1.0',
    hedgeCooldownSeconds: '300',
    debounceCount: '3',
    protectionDirection: 'both' as 'below' | 'above' | 'both',
    protectionWalletId: '',
    profitWalletEnabled: true,
    protectionActive: true,
    // Range trading (R10)
    tradingEnabled: false,
    tradingLeverage: 5,
    tradingStopLossPercent: '2.0',
    tradingTrailingPercent: '1.5',
    tradingEntryZonePercent: '25',
    tradingCooldownSeconds: '300',
    tradingMaxSizeUsd: '1000',
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/pools/${id}`).then((r) => r.json()),
      fetch('/api/wallets').then((r) => r.json()),
    ])
      .then(([pool, w]) => {
        if (pool.error) {
          setError('Pool no encontrado');
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
          hedgeRatio: (pool.hedgeRatio ?? 1.0).toString(),
          hedgeCooldownSeconds: (pool.hedgeCooldownSeconds ?? 300).toString(),
          debounceCount: (pool.debounceCount ?? 3).toString(),
          protectionDirection: pool.protectionDirection,
          protectionWalletId: pool.protectionWalletId,
          profitWalletEnabled: pool.profitWalletEnabled,
          protectionActive: pool.protectionActive,
          tradingEnabled: pool.tradingEnabled ?? false,
          tradingLeverage: pool.tradingLeverage ?? 5,
          tradingStopLossPercent: (pool.tradingStopLossPercent ?? 2.0).toString(),
          tradingTrailingPercent: (pool.tradingTrailingPercent ?? 1.5).toString(),
          tradingEntryZonePercent: (pool.tradingEntryZonePercent ?? 25).toString(),
          tradingCooldownSeconds: (pool.tradingCooldownSeconds ?? 300).toString(),
          tradingMaxSizeUsd: (pool.tradingMaxSizeUsd ?? 1000).toString(),
        });
        setWallets(w);
        setLoading(false);
      })
      .catch(() => {
        setError('Error al cargar datos del pool');
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
        hedgeRatio: parseFloat(form.hedgeRatio),
        hedgeCooldownSeconds: parseInt(form.hedgeCooldownSeconds),
        debounceCount: parseInt(form.debounceCount),
        protectionDirection: form.protectionDirection,
        protectionWalletId: form.protectionWalletId,
        profitWalletEnabled: form.profitWalletEnabled,
        protectionActive: form.protectionActive,
        tradingEnabled: form.tradingEnabled,
        tradingLeverage: form.tradingLeverage,
        tradingStopLossPercent: parseFloat(form.tradingStopLossPercent),
        tradingTrailingPercent: parseFloat(form.tradingTrailingPercent),
        tradingEntryZonePercent: parseFloat(form.tradingEntryZonePercent),
        tradingCooldownSeconds: parseInt(form.tradingCooldownSeconds),
        tradingMaxSizeUsd: parseFloat(form.tradingMaxSizeUsd),
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
      <p className="text-sm text-muted-foreground mb-4">
        <Link href="/pools" className="hover:text-foreground transition-colors">
          Pools
        </Link>
        {' / '}
        <Link href={`/pools/${id}`} className="hover:text-foreground transition-colors">
          {form.name || 'Pool'}
        </Link>
        {' / '}
        <span className="text-foreground">Editar</span>
      </p>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Editar Pool</CardTitle>
          <CardDescription>
            Modificá la configuración del pool y sus parámetros de protección
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
                description="Red, dirección y nivel de fee del pool"
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
                  <Label>Fee Tier</Label>
                  <Select
                    value={form.feeTier.toString()}
                    onValueChange={(value) =>
                      setForm((f) => ({ ...f, feeTier: parseInt(value) }))
                    }
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
                <Label>Dirección del Pool</Label>
                <Input
                  type="text"
                  value={form.poolAddress}
                  onChange={(e) => setForm((f) => ({ ...f, poolAddress: e.target.value }))}
                  className="bg-muted border-border text-foreground font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Nombre <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="bg-muted border-border text-foreground"
                />
              </div>
            </section>

            <Separator />

            {/* ── Section 2: Price Range ── */}
            <section className="space-y-4">
              <SectionHeader
                title="Rango de Precios"
                description="Límites de liquidez concentrada y monto total invertido"
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
              </div>
            </section>

            <Separator />

            {/* ── Section 3: Protection ── */}
            <section className="space-y-4">
              <SectionHeader
                title="Protección"
                description="Configuración del hedge en Hyperliquid"
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
              </div>

              <div className="flex items-center gap-6 pt-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id="protection-active"
                    checked={form.protectionActive}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, protectionActive: checked }))
                    }
                  />
                  <Label htmlFor="protection-active" className="cursor-pointer">
                    Protección activa
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="profit-wallet"
                    checked={form.profitWalletEnabled}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, profitWalletEnabled: checked }))
                    }
                  />
                  <Label htmlFor="profit-wallet" className="cursor-pointer">
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

            {/* ── Section 5: Range Trading (R10) ── */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Trading dentro del Rango
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Opera mean-reversion dentro del rango LP (long abajo, short arriba)
                  </p>
                </div>
                <Switch
                  id="trading-enabled"
                  checked={form.tradingEnabled}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, tradingEnabled: checked }))
                  }
                />
              </div>

              {form.tradingEnabled && (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Apalancamiento Trading</Label>
                      <Select
                        value={form.tradingLeverage.toString()}
                        onValueChange={(value) =>
                          setForm((f) => ({ ...f, tradingLeverage: parseInt(value) }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2x</SelectItem>
                          <SelectItem value="3">3x</SelectItem>
                          <SelectItem value="5">5x</SelectItem>
                          <SelectItem value="10">10x</SelectItem>
                          <SelectItem value="20">20x</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tamaño Máximo (USD)</Label>
                      <Input
                        type="number"
                        step="any"
                        value={form.tradingMaxSizeUsd}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tradingMaxSizeUsd: e.target.value }))
                        }
                        className="bg-muted border-border text-foreground"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Stop Loss (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.tradingStopLossPercent}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tradingStopLossPercent: e.target.value }))
                        }
                        className="bg-muted border-border text-foreground"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Cierre forzado si el precio va en contra este %
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Trailing Stop (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.tradingTrailingPercent}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tradingTrailingPercent: e.target.value }))
                        }
                        className="bg-muted border-border text-foreground"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Se arrastra detrás del mejor precio alcanzado
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Zona de Entrada (%)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={form.tradingEntryZonePercent}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tradingEntryZonePercent: e.target.value }))
                        }
                        className="bg-muted border-border text-foreground"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        % del rango que define zona baja (long) y alta (short)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Cooldown (segundos)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={form.tradingCooldownSeconds}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tradingCooldownSeconds: e.target.value }))
                        }
                        className="bg-muted border-border text-foreground"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Espera entre operaciones (evitar overtrade)
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <Separator />

            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Guardando…' : 'Guardar Cambios'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
