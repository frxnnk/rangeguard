'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle2, Info, RotateCcw, Save, Shield } from 'lucide-react';

const DEFAULTS: Record<string, string> = {
  debounce_count: '3',
  polling_interval_ms: '5000',
  wallet_check_interval_ms: '30000',
  cooldown_minutes: '5',
  circuit_breaker_threshold: '3',
  circuit_breaker_reset_ms: '300000',
  hl_api_url: 'https://api.hyperliquid-testnet.xyz',
  hl_ws_url: 'wss://api.hyperliquid-testnet.xyz/ws',
  log_level: 'info',
  hl_environment: 'testnet',
};

const SECURITY_FEATURES = [
  'Vault encriptado con AES-256-GCM + scrypt KDF',
  'Claves cargadas en memoria, borradas al apagar el bot',
  'Claves privadas nunca almacenadas en la base de datos',
  'Una wallet aislada por pool (sin posiciones cruzadas)',
  'Stop-loss de respaldo en cada cobertura abierta',
];

async function fetchSettings(): Promise<Record<string, string>> {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

async function saveSettings(settings: Record<string, string>): Promise<Record<string, string>> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to save settings');
  }
  return res.json();
}

async function fetchWallets(): Promise<{ id: string }[]> {
  const res = await fetch('/api/wallets');
  if (!res.ok) return [];
  return res.json();
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  const {
    data: settings,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    refetchInterval: false,
    staleTime: 30_000,
  });

  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: fetchWallets,
    refetchInterval: false,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      setForm(data);
      setDirty(false);
      toast.success('Configuración guardada');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    mutation.mutate(form);
  };

  const handleReset = () => {
    setForm(DEFAULTS);
    setDirty(true);
  };

  const isMainnet = form.hl_environment === 'mainnet';
  const walletCount = wallets?.length ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-3xl">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Error al cargar configuración. ¿La base de datos es accesible?
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
          <Badge variant={isMainnet ? 'destructive' : 'secondary'}>
            {isMainnet ? 'Mainnet' : 'Testnet'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={mutation.isPending}>
            <RotateCcw className="size-4 mr-1" />
            Restablecer
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || mutation.isPending}>
            <Save className="size-4 mr-1" />
            {mutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertTitle>Reinicio requerido</AlertTitle>
        <AlertDescription>
          Los cambios se aplican en el próximo reinicio del bot. Los ajustes del dashboard tienen
          prioridad sobre las variables de entorno.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="monitoring">
        <TabsList>
          <TabsTrigger value="monitoring">Monitoreo</TabsTrigger>
          <TabsTrigger value="hyperliquid">Hyperliquid</TabsTrigger>
          <TabsTrigger value="security">Seguridad</TabsTrigger>
        </TabsList>

        <TabsContent value="monitoring">
          <Card>
            <CardHeader>
              <CardTitle>Parámetros de Monitoreo</CardTitle>
              <CardDescription>
                Configurá cómo el bot monitorea pools y wallets, y el nivel de detalle de los logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="debounce_count">Conteo de Debounce</Label>
                  <Input
                    id="debounce_count"
                    type="number"
                    min="1"
                    max="20"
                    value={form.debounce_count}
                    onChange={(e) => updateField('debounce_count', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Actualizaciones consecutivas fuera de rango antes de abrir una cobertura.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cooldown_minutes">Minutos de Cooldown</Label>
                  <Input
                    id="cooldown_minutes"
                    type="number"
                    min="0"
                    max="60"
                    value={form.cooldown_minutes}
                    onChange={(e) => updateField('cooldown_minutes', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tiempo de espera después de cerrar una cobertura antes de reabrir.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="circuit_breaker_threshold">Circuit Breaker — Umbral de Fallos</Label>
                  <Input
                    id="circuit_breaker_threshold"
                    type="number"
                    min="1"
                    max="20"
                    value={form.circuit_breaker_threshold}
                    onChange={(e) => updateField('circuit_breaker_threshold', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Fallos consecutivos en un pool antes de pausar aperturas automáticas.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="circuit_breaker_reset_ms">Circuit Breaker — Reset (ms)</Label>
                  <Input
                    id="circuit_breaker_reset_ms"
                    type="number"
                    min="10000"
                    max="3600000"
                    step="10000"
                    value={form.circuit_breaker_reset_ms}
                    onChange={(e) => updateField('circuit_breaker_reset_ms', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tiempo en ms antes de reintentar tras pausar un pool. (300000 = 5 min)
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="polling_interval_ms">Intervalo de Polling (ms)</Label>
                  <Input
                    id="polling_interval_ms"
                    type="number"
                    min="1000"
                    max="60000"
                    step="1000"
                    value={form.polling_interval_ms}
                    onChange={(e) => updateField('polling_interval_ms', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Cada cuánto consultar precios de pools vía slot0.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wallet_check_interval_ms">
                    Intervalo de Chequeo de Wallets (ms)
                  </Label>
                  <Input
                    id="wallet_check_interval_ms"
                    type="number"
                    min="5000"
                    max="300000"
                    step="1000"
                    value={form.wallet_check_interval_ms}
                    onChange={(e) => updateField('wallet_check_interval_ms', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Cada cuánto refrescar saldos de wallets desde Hyperliquid.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 max-w-xs">
                <Label htmlFor="log_level">Nivel de Log</Label>
                <Select
                  value={form.log_level}
                  onValueChange={(value) => updateField('log_level', value)}
                >
                  <SelectTrigger id="log_level" className="w-full">
                    <SelectValue placeholder="Seleccionar nivel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debug">Debug</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warn">Warn</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Controla el nivel de detalle de los logs del bot.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hyperliquid">
          <Card>
            <CardHeader>
              <CardTitle>Conexión Hyperliquid</CardTitle>
              <CardDescription>
                Entorno y endpoints del DEX Hyperliquid.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-1">
                  <Label>Entorno</Label>
                  <p className="text-xs text-muted-foreground">
                    {isMainnet
                      ? 'Conectado a mainnet de Hyperliquid. Fondos reales en riesgo.'
                      : 'Conectado a testnet de Hyperliquid. Seguro para pruebas.'}
                  </p>
                </div>
                <Badge variant={isMainnet ? 'destructive' : 'secondary'} className="text-sm">
                  {isMainnet ? 'Mainnet' : 'Testnet'}
                </Badge>
              </div>

              <Alert>
                <Info className="size-4" />
                <AlertTitle>Controlado por variable de entorno</AlertTitle>
                <AlertDescription>
                  El ambiente se controla con <code className="text-xs bg-muted px-1 py-0.5 rounded">RANGEGUARD_ENV</code>. Reiniciar el bot para cambiar de ambiente.
                </AlertDescription>
              </Alert>

              {isMainnet && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Advertencia Mainnet</AlertTitle>
                  <AlertDescription>
                    Estás en mainnet. Todos los trades usan fondos reales.
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="hl_api_url">API URL</Label>
                  <Input
                    id="hl_api_url"
                    type="url"
                    value={form.hl_api_url}
                    readOnly
                    className="font-mono text-sm bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hl_ws_url">WebSocket URL</Label>
                  <Input
                    id="hl_ws_url"
                    type="url"
                    value={form.hl_ws_url}
                    readOnly
                    className="font-mono text-sm bg-muted"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="size-5 text-muted-foreground" />
                <CardTitle>Seguridad</CardTitle>
              </div>
              <CardDescription>
                Modelo de seguridad del bot para la protección de claves y fondos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-border p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Billeteras Registradas</p>
                <p className="text-2xl font-bold text-foreground">{walletCount}</p>
              </div>

              <Separator />

              <ul className="space-y-3">
                {SECURITY_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-emerald-500" />
                    <span className="text-sm text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
