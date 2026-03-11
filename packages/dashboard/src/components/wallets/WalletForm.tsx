'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

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
      toast.success('Billetera agregada');
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.alias.trim()) {
      setError('El alias es obligatorio');
      return;
    }
    if (!form.address.trim() || !form.address.startsWith('0x')) {
      setError('Dirección Ethereum válida requerida (0x...)');
      return;
    }

    createMutation.mutate(form);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Agregar Billetera</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Alias</Label>

            <Input
              type="text"
              value={form.alias}
              onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
              placeholder="hedge-wallet-1"
              required
              className="bg-muted border-border text-foreground"
            />
          </div>

          <div>
            <Label>Dirección</Label>
            <Input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="0x..."
              required
              className="bg-muted border-border text-foreground font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo</Label>
              <select
                value={form.walletType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, walletType: e.target.value as 'protection' | 'profit' }))
                }
                className="w-full bg-muted border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
              >
                <option value="protection">Protección</option>
                <option value="profit">Ganancia</option>
              </select>
            </div>
            <div>
              <Label>Alerta de Saldo Bajo ($)</Label>
              <Input
                type="number"
                step="any"
                value={form.lowBalanceThreshold}
                onChange={(e) => setForm((f) => ({ ...f, lowBalanceThreshold: e.target.value }))}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={createMutation.isPending} className="flex-1">
              {createMutation.isPending ? 'Agregando...' : 'Agregar Billetera'}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Después de agregar, ejecutá{' '}
            <code className="text-green-400 bg-muted px-1 rounded">pnpm setup-keys</code> para
            agregar la clave privada al vault.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
