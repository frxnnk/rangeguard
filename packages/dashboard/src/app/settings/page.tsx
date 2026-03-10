'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
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
      toast.success('Settings saved successfully');
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
          <AlertDescription>Failed to load settings. Is the database accessible?</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Toaster />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <Badge variant={isMainnet ? 'destructive' : 'secondary'}>
            {isMainnet ? 'Mainnet' : 'Testnet'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={mutation.isPending}>
            <RotateCcw className="size-4 mr-1" />
            Reset to Defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || mutation.isPending}>
            <Save className="size-4 mr-1" />
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertTitle>Restart required</AlertTitle>
        <AlertDescription>
          Restart the bot after changing settings for them to take effect.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="monitoring">
        <TabsList>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="hyperliquid">Hyperliquid</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="vault">Vault Info</TabsTrigger>
        </TabsList>

        <TabsContent value="monitoring">
          <Card>
            <CardHeader>
              <CardTitle>Monitoring Parameters</CardTitle>
              <CardDescription>
                Configure how the bot monitors pools and wallets for range breaches.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="debounce_count">Debounce Count</Label>
                  <Input
                    id="debounce_count"
                    type="number"
                    min="1"
                    max="20"
                    value={form.debounce_count}
                    onChange={(e) => updateField('debounce_count', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Consecutive out-of-range updates before triggering a hedge.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cooldown_minutes">Cooldown Minutes</Label>
                  <Input
                    id="cooldown_minutes"
                    type="number"
                    min="0"
                    max="60"
                    value={form.cooldown_minutes}
                    onChange={(e) => updateField('cooldown_minutes', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Wait time after closing a hedge before re-opening.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="polling_interval_ms">Polling Interval (ms)</Label>
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
                    How often to poll pool prices via slot0.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wallet_check_interval_ms">Wallet Check Interval (ms)</Label>
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
                    How often to refresh wallet balances from Hyperliquid.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hyperliquid">
          <Card>
            <CardHeader>
              <CardTitle>Hyperliquid Connection</CardTitle>
              <CardDescription>
                Configure the Hyperliquid DEX environment and endpoints.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-1">
                  <Label>Environment</Label>
                  <p className="text-xs text-muted-foreground">
                    {isMainnet
                      ? 'Connected to Hyperliquid mainnet. Real funds at risk.'
                      : 'Connected to Hyperliquid testnet. Safe for testing.'}
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
                  <AlertTitle>Mainnet Warning</AlertTitle>
                  <AlertDescription>
                    You are targeting the mainnet. All trades will use real funds. Proceed with
                    caution.
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
              <CardDescription>Logging and other global settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="log_level">Log Level</Label>
                <Select
                  value={form.log_level}
                  onValueChange={(value) => updateField('log_level', value)}
                >
                  <SelectTrigger id="log_level" className="w-full">
                    <SelectValue placeholder="Select log level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debug">Debug</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warn">Warn</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Controls the verbosity of bot logging output.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vault">
          <Card>
            <CardHeader>
              <CardTitle>Vault &amp; Wallets</CardTitle>
              <CardDescription>
                Wallet private keys are stored in an AES-256-GCM encrypted vault.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-border p-4 space-y-1">
                  <p className="text-sm text-muted-foreground">Wallets Registered</p>
                  <p className="text-2xl font-bold text-foreground">{walletCount}</p>
                </div>
                <div className="rounded-lg border border-border p-4 space-y-1">
                  <p className="text-sm text-muted-foreground">Vault Path</p>
                  <p className="text-sm font-mono text-foreground">data/vault.enc</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Use the CLI tool to add, list, or rotate wallet private keys in the vault:
                </p>
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3">
                  <Terminal className="size-4 text-muted-foreground shrink-0" />
                  <code className="text-sm font-mono text-foreground">pnpm setup-keys</code>
                </div>
                <p className="text-xs text-muted-foreground">
                  After adding a wallet to the vault, register it in the database through the
                  Wallets page to make it available for pool assignment.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
