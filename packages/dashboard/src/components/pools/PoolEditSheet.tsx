'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, RefreshCw } from 'lucide-react';

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

interface PoolEditSheetProps {
  poolId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
  );
}

export function PoolEditSheet({ poolId, open, onOpenChange }: PoolEditSheetProps) {
  const queryClient = useQueryClient();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);

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
    poolAmountSource: 'manual' as 'manual' | 'on-chain',
    lpTokenId: '',
    leverage: 10,
    hedgeRatio: '1.0',
    hedgeCooldownSeconds: '300',
    debounceCount: '3',
    protectionDirection: 'both' as 'below' | 'above' | 'both',
    protectionWalletId: '',
    profitWalletEnabled: true,
    protectionActive: true,
    tradingEnabled: false,
    tradingLeverage: 5,
    tradingStopLossPercent: '2.0',
    tradingTrailingPercent: '1.5',
    tradingEntryZonePercent: '25',
    tradingCooldownSeconds: '300',
    tradingMaxSizeUsd: '1000',
  });

  useEffect(() => {
    if (!open || !poolId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/pools/${poolId}`).then((r) => r.json()),
      fetch('/api/wallets').then((r) => r.json()),
    ])
      .then(([pool, w]) => {
        if (pool.error) {
          setError('Pool no encontrado');
          setLoading(false);
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
          poolAmountSource: pool.poolAmountSource || 'manual',
          lpTokenId: pool.lpTokenId || '',
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
  }, [open, poolId]);

  const protectionWallets = wallets.filter((w) => w.walletType === 'protection');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!poolId) return;
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
        poolAmountSource: form.poolAmountSource,
        lpTokenId: form.poolAmountSource === 'on-chain' ? form.lpTokenId : undefined,
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

      const res = await fetch(`/api/pools/${poolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar pool');
      }

      queryClient.invalidateQueries({ queryKey: ['pools'] });
      queryClient.invalidateQueries({ queryKey: ['pool', poolId] });
      toast.success('Pool actualizado');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar Pool</SheetTitle>
          <SheetDescription>
            Modificá la configuración del pool y sus parámetros de protección
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 px-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 px-4 pb-8">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* ── Section 1: Pool Identification ── */}
            <section className="space-y-3">
              <SectionHeader
                title="Identificación del Pool"
                description="Red, dirección y nivel de fee"
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Red</Label>
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
                <div className="space-y-1.5">
                  <Label className="text-xs">Fee Tier</Label>
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

              <div className="space-y-1.5">
                <Label className="text-xs">Dirección del Pool</Label>
                <Input
                  type="text"
                  value={form.poolAddress}
                  onChange={(e) => setForm((f) => ({ ...f, poolAddress: e.target.value }))}
                  className="bg-muted border-border text-foreground font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
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
            <section className="space-y-3">
              <SectionHeader
                title="Rango de Precios"
                description="Límites de liquidez y monto invertido"
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Rango Inferior ($)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.rangeLower}
                    onChange={(e) => setForm((f) => ({ ...f, rangeLower: e.target.value }))}
                    required
                    className="bg-muted border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Rango Superior ($)</Label>
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

              <div className="space-y-1.5">
                <Label className="text-xs">Fuente del Monto</Label>
                <Select
                  value={form.poolAmountSource}
                  onValueChange={(value) =>
                    setForm((f) => ({
                      ...f,
                      poolAmountSource: value as 'manual' | 'on-chain',
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="on-chain">Leer de blockchain</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.poolAmountSource === 'on-chain' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Token ID del NFT LP</Label>
                  <Input
                    type="text"
                    value={form.lpTokenId}
                    onChange={(e) => setForm((f) => ({ ...f, lpTokenId: e.target.value }))}
                    placeholder="123456"
                    required
                    className="bg-muted border-border text-foreground font-mono text-xs"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Monto del Pool (USD)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="any"
                    value={form.poolAmount}
                    onChange={(e) => setForm((f) => ({ ...f, poolAmount: e.target.value }))}
                    required
                    readOnly={form.poolAmountSource === 'on-chain'}
                    className="bg-muted border-border text-foreground"
                  />
                  {form.poolAmountSource === 'on-chain' && poolId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={syncing || !form.lpTokenId}
                      onClick={async () => {
                        setSyncing(true);
                        try {
                          const res = await fetch(`/api/pools/${poolId}/sync-liquidity`, {
                            method: 'POST',
                          });
                          if (!res.ok) {
                            const data = await res.json();
                            throw new Error(data.error || 'Sync failed');
                          }
                          const data = await res.json();
                          setForm((f) => ({ ...f, poolAmount: data.poolAmount }));
                          toast.success(`Monto sincronizado: $${data.poolAmount}`);
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : 'Error al sincronizar',
                          );
                        } finally {
                          setSyncing(false);
                        }
                      }}
                    >
                      <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                </div>
                {form.poolAmountSource === 'on-chain' && (
                  <p className="text-[10px] text-muted-foreground">
                    Se actualiza automáticamente cada 5 min
                  </p>
                )}
              </div>
            </section>

            <Separator />

            {/* ── Section 3: Protection ── */}
            <section className="space-y-3">
              <SectionHeader
                title="Protección"
                description="Configuración del hedge en Hyperliquid"
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Apalancamiento</Label>
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
                <div className="space-y-1.5">
                  <Label className="text-xs">Dirección</Label>
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

              <div className="space-y-1.5">
                <Label className="text-xs">Wallet de Protección</Label>
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

              <div className="flex items-center gap-5 pt-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id="sheet-protection-active"
                    checked={form.protectionActive}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, protectionActive: checked }))
                    }
                  />
                  <Label htmlFor="sheet-protection-active" className="cursor-pointer text-xs">
                    Protección activa
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="sheet-profit-wallet"
                    checked={form.profitWalletEnabled}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, profitWalletEnabled: checked }))
                    }
                  />
                  <Label htmlFor="sheet-profit-wallet" className="cursor-pointer text-xs">
                    Replicar en wallet de ganancia
                  </Label>
                </div>
              </div>
            </section>

            <Separator />

            {/* ── Section 4: Fine Tuning ── */}
            <section className="space-y-3">
              <SectionHeader
                title="Ajuste Fino"
                description="Parámetros avanzados del hedge"
              />

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Ratio</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="2.0"
                    value={form.hedgeRatio}
                    onChange={(e) => setForm((f) => ({ ...f, hedgeRatio: e.target.value }))}
                    className="bg-muted border-border text-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground">0.5–2.0</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Debounce</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    max="20"
                    value={form.debounceCount}
                    onChange={(e) => setForm((f) => ({ ...f, debounceCount: e.target.value }))}
                    className="bg-muted border-border text-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground">ticks</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cooldown</Label>
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
                  <p className="text-[10px] text-muted-foreground">segundos</p>
                </div>
              </div>
            </section>

            <Separator />

            {/* ── Section 5: Range Trading ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Trading en Rango</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mean-reversion dentro del rango LP
                  </p>
                </div>
                <Switch
                  id="sheet-trading-enabled"
                  checked={form.tradingEnabled}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, tradingEnabled: checked }))
                  }
                />
              </div>

              {form.tradingEnabled && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Apalancamiento</Label>
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
                    <div className="space-y-1.5">
                      <Label className="text-xs">Max (USD)</Label>
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

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Stop Loss (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.tradingStopLossPercent}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tradingStopLossPercent: e.target.value }))
                        }
                        className="bg-muted border-border text-foreground"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Trailing (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.tradingTrailingPercent}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tradingTrailingPercent: e.target.value }))
                        }
                        className="bg-muted border-border text-foreground"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Zona de Entrada (%)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={form.tradingEntryZonePercent}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tradingEntryZonePercent: e.target.value }))
                        }
                        className="bg-muted border-border text-foreground"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Cooldown (seg)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={form.tradingCooldownSeconds}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tradingCooldownSeconds: e.target.value }))
                        }
                        className="bg-muted border-border text-foreground"
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>

            <Separator />

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Guardando…' : 'Guardar Cambios'}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
