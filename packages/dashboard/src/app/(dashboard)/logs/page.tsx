'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface LogEntry {
  id: number;
  level: string;
  name: string;
  msg: string;
  data?: string;
  createdAt: number;
}

const LEVEL_BADGE: Record<string, 'destructive' | 'secondary' | 'outline' | 'default'> = {
  error: 'destructive',
  warn: 'default',
  info: 'secondary',
  debug: 'outline',
};

const LEVEL_LABELS: Record<string, string> = {
  error: 'Error',
  warn: 'Warn',
  info: 'Info',
  debug: 'Debug',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function fetchLogs(level: string): Promise<LogEntry[]> {
  const params = new URLSearchParams({ limit: '200' });
  if (level !== 'all') params.set('level', level);
  const res = await fetch(`/api/logs?${params}`);
  if (!res.ok) throw new Error('Failed to fetch logs');
  return res.json();
}

export default function LogsPage() {
  const [level, setLevel] = useState('all');

  const {
    data: logs,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['logs', level],
    queryFn: () => fetchLogs(level),
    refetchInterval: 5_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-5xl">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Error al cargar logs. ¿La base de datos es accesible?</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Logs del Bot</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filtrar por nivel:</span>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actividad reciente</CardTitle>
          <CardDescription>
            Últimos {logs?.length ?? 0} registros. Se actualiza cada 5 segundos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No hay logs registrados. Los logs aparecerán cuando el bot esté corriendo.
            </p>
          ) : (
            <div className="space-y-1 font-mono text-sm max-h-[600px] overflow-y-auto">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const badgeVariant = LEVEL_BADGE[log.level] ?? 'outline';
  const levelLabel = LEVEL_LABELS[log.level] ?? log.level;

  return (
    <div className="flex items-start gap-3 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors">
      <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
        {formatTime(log.createdAt)}
      </span>
      <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0 shrink-0 mt-0.5">
        {levelLabel}
      </Badge>
      <span className="text-xs text-muted-foreground shrink-0 mt-0.5">[{log.name}]</span>
      <span className="text-sm text-foreground break-all">{log.msg}</span>
    </div>
  );
}
