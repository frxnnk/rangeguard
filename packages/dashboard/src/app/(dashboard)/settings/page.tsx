'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { AlertTriangle, Info, RotateCcw, Save, Terminal } from 'lucide-react';

const DEFAULTS: Record<string, string> = {
  debounce_count: '3',
  polling_interval_ms: '5000',
  wallet_check_interval_ms: '30000',
  cooldown_minutes: '5',
  hl_api_url: 'https://api.hyperliquid-testnet.xyz',
  hl_ws_url: 'wss://api.hyperliquid-testnet.xyz/ws',
  log_level: 'info',
  hl_environment: 'testnet',
};

const HL_URLS: Record<string, { api: string; ws: string }> = {
  testnet: {
    api: 'https://api.hyperliquid-testnet.xyz',
    ws: 'wss://api.hyperliquid-testnet.xyz/ws',
  },
  mainnet: {
    api: 'https://api.hyperliquid.xyz',
    ws: 'wss://api.hyperliquid.xyz/ws',
  },
};

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

  const handleEnvironmentToggle = (checked: boolean) => {
    const env = checked ? 'mainnet' : 'testnet';
    const urls = HL_URLS[env];
    setForm((prev) => ({
      ...prev,
      hl_environment: env,
      hl_api_url: urls.api,
      hl_ws_url: urls.ws,
    }));
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
          <AlertDescription>Error al cargar configuración. ¿La base de datos es accesible?</AlertDescription>
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
          Reiniciá el bot después de cambiar la configuración para que los cambios tomen efecto.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="monitoring">
        <TabsList>
          <TabsTrigger value="monitoring">Monitoreo</TabsTrigger>
          <TabsTrigger value="hyperliquid">Hyperliquid</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="vault">Vault</TabsTrigger>
        </TabsList>

        <TabsContent value="monitoring">
          <Card>
            <CardHeader>
              <CardTitle>Parámetros de Monitoreo</CardTitle>
              <CardDescription>
                Configurá cómo el bot monitorea pools y wallets para detectar salidas de rango.
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
                  <Label htmlFor="wallet_check_interval_ms">Intervalo de Chequeo de Wallets (ms)</Label>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hyperliquid">
          <Card>
            <CardHeader>
              <CardTitle>Conexión Hyperliquid</CardTitle>
              <CardDescription>
                Configurá el entorno y endpoints del DEX Hyperliquid.
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
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Testnet</span>
                  <Switch checked={isMainnet} onCheckedChange={handleEnvironmentToggle} />
                  <span className="text-sm text-muted-foreground">Mainnet</span>
                </div>
              </div>

              {isMainnet && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Advertencia Mainnet</AlertTitle>
                  <AlertDescription>
                    Estás apuntando a mainnet. Todos los trades usarán fondos reales. Procedé con
                    precaución.
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
                    onChange={(e) => updateField('hl_api_url', e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hl_ws_url">WebSocket URL</Label>
                  <Input
                    id="hl_ws_url"
                    type="url"
                    value={form.hl_ws_url}
                    onChange={(e) => updateField('hl_ws_url', e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Logging y otros ajustes globales.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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

        <TabsContent value="vault">
          <Card>
            <CardHeader>
              <CardTitle>Vault y Billeteras</CardTitle>
              <CardDescription>
                Las claves privadas se almacenan en un vault encriptado con AES-256-GCM.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-border p-4 space-y-1">
                  <p className="text-sm text-muted-foreground">Billeteras Registradas</p>
                  <p className="text-2xl font-bold text-foreground">{walletCount}</p>
                </div>
                <div className="rounded-lg border border-border p-4 space-y-1">
                  <p className="text-sm text-muted-foreground">Ruta del Vault</p>
                  <p className="text-sm font-mono text-foreground">data/vault.enc</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Usá la herramienta CLI para agregar, listar o rotar claves privadas en el vault:
                </p>
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3">
                  <Terminal className="size-4 text-muted-foreground shrink-0" />
                  <code className="text-sm font-mono text-foreground">pnpm setup-keys</code>
                </div>
                <p className="text-xs text-muted-foreground">
                  Después de agregar una wallet al vault, registrala en la base de datos desde la
                  página de Billeteras para poder asignarla a un pool.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
