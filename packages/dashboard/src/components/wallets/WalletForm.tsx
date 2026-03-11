'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle2, Copy, Wand2, Import } from 'lucide-react';

interface WalletResult {
  id: string;
  alias: string;
  address: string;
  walletType: string;
  generated?: boolean;
}

export function WalletForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'generate' | 'import'>('generate');
  const [form, setForm] = useState({
    alias: '',
    privateKey: '',
    walletType: 'protection' as 'protection' | 'profit',
    lowBalanceThreshold: '100',
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WalletResult | null>(null);

  const generateMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/wallets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Error al generar wallet');
      }
      return res.json() as Promise<WalletResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      setResult(data);
      toast.success('Wallet generada exitosamente');
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message);
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/wallets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Error al importar wallet');
      }
      return res.json() as Promise<WalletResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      setResult(data);
      toast.success('Wallet importada exitosamente');
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message);
    },
  });

  const isPending = generateMutation.isPending || importMutation.isPending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.alias.trim()) {
      setError('El alias es obligatorio');
      return;
    }

    if (mode === 'import' && !form.privateKey.trim()) {
      setError('La clave privada es obligatoria');
      return;
    }

    if (mode === 'generate') {
      generateMutation.mutate(form);
    } else {
      importMutation.mutate(form);
    }
  };

  const copyAddress = () => {
    if (result?.address) {
      navigator.clipboard.writeText(result.address);
      toast.success('Dirección copiada');
    }
  };

  // Success view
  if (result) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <CardTitle>
              {result.generated ? 'Wallet Generada' : 'Wallet Importada'}
            </CardTitle>
          </div>
          <CardDescription>
            La clave privada fue almacenada en el vault encriptado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Alias</Label>
            <p className="text-sm font-medium text-foreground">{result.alias}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Dirección</Label>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-foreground bg-muted px-2 py-1 rounded flex-1 break-all">
                {result.address}
              </code>
              <Button variant="ghost" size="icon" onClick={copyAddress} className="shrink-0">
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          {result.generated && (
            <Alert>
              <AlertDescription>
                Fondeá esta dirección en{' '}
                <span className="font-medium">Hyperliquid Testnet</span> para poder operar.
                Depositá USDC desde Arbitrum Sepolia al bridge de HL testnet.
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={onClose} className="w-full">
            Cerrar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-lg">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="space-y-1">
          <CardTitle>Nueva Billetera</CardTitle>
          <CardDescription>
            Generá una nueva wallet o importá una existente con clave privada.
          </CardDescription>
        </div>
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

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'generate' | 'import')}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="generate" className="flex-1 gap-1.5">
              <Wand2 className="size-3.5" />
              Generar
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1 gap-1.5">
              <Import className="size-3.5" />
              Importar
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Alias</Label>
              <Input
                type="text"
                value={form.alias}
                onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                placeholder="hedge-wallet-1"
                required
                className="bg-muted border-border text-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                Nombre para identificar esta wallet en el dashboard y el vault.
              </p>
            </div>

            <TabsContent value="import" className="mt-0">
              <div className="space-y-2">
                <Label>Clave Privada</Label>
                <Input
                  type="password"
                  value={form.privateKey}
                  onChange={(e) => setForm((f) => ({ ...f, privateKey: e.target.value }))}
                  placeholder="0x..."
                  className="bg-muted border-border text-foreground font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Hex de 64 caracteres (con o sin prefijo 0x). Se almacena encriptada en el vault.
                </p>
              </div>
            </TabsContent>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.walletType}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, walletType: value as 'protection' | 'profit' }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="protection">Protección</SelectItem>
                    <SelectItem value="profit">Ganancia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
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

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending
                ? 'Procesando...'
                : mode === 'generate'
                  ? 'Generar Wallet'
                  : 'Importar Wallet'}
            </Button>
          </form>
        </Tabs>
      </CardContent>
    </Card>
  );
}
