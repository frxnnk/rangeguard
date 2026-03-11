'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, TrendingUp, TrendingDown, Activity, Zap, Trash2 } from 'lucide-react';

interface Trade {
  id: string;
  asset: string;
  side: 'short' | 'long';
  size: string;
  entryPrice: string;
  exitPrice?: string;
  realizedPnl?: string;
  walletType: 'protection' | 'profit';
  isFalseBreakout: boolean;
  closeReason?: string;
  openedAt: number;
  closedAt?: number;
}

function formatPnl(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}$${value.toFixed(2)}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDuration(openedAt: number, closedAt: number): string {
  const diff = closedAt - openedAt;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default function HistoryPage() {
  const [showFalseBreakoutsOnly, setShowFalseBreakoutsOnly] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['trades'],
    queryFn: () => fetch('/api/trades?limit=100').then((r) => r.json()),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => fetch('/api/trades', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Historial eliminado');
    },
    onError: () => toast.error('Error al eliminar historial'),
  });

  const trades: Trade[] = data?.trades || [];
  const falseBreakoutCount: number = data?.falseBreakouts || 0;

  const filtered = showFalseBreakoutsOnly ? trades.filter((t) => t.isFalseBreakout) : trades;

  const stats = useMemo(() => {
    if (trades.length === 0) return null;
    let wins = 0;
    let losses = 0;
    let totalPnl = 0;
    for (const t of trades) {
      if (t.realizedPnl) {
        const pnl = parseFloat(t.realizedPnl);
        totalPnl += pnl;
        if (pnl >= 0) wins++;
        else losses++;
      }
    }
    const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
    return { total: trades.length, wins, losses, totalPnl, winRate };
  }, [trades]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Historial de Trades</h1>
        <div className="flex items-center gap-4">
          {trades.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-destructive"
              onClick={() => {
                if (confirm('¿Eliminar todo el historial de trades? Esta acción no se puede deshacer.')) {
                  deleteAllMutation.mutate();
                }
              }}
              disabled={deleteAllMutation.isPending}
            >
              <Trash2 className="size-3.5 mr-1" />
              {deleteAllMutation.isPending ? 'Eliminando...' : 'Borrar todo'}
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Falsas rupturas:{' '}
            <span className="text-orange-400 font-medium tabular-nums">{falseBreakoutCount}</span>
          </span>
          <div className="flex items-center gap-2">
            <Switch
              id="false-breakouts"
              checked={showFalseBreakoutsOnly}
              onCheckedChange={setShowFalseBreakoutsOnly}
            />
            <Label
              htmlFor="false-breakouts"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Solo falsas rupturas
            </Label>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded" />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 && !showFalseBreakoutsOnly ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="size-10 text-muted-foreground/40 mb-3" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">No hay historial de trades.</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Las coberturas cerradas aparecerán aquí con detalles de PnL.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard
                label="Total Trades"
                value={stats.total.toString()}
                icon={Activity}
                accent="text-muted-foreground"
              />
              <StatCard
                label="Tasa de Acierto"
                value={`${stats.winRate}%`}
                sub={`${stats.wins}G / ${stats.losses}P`}
                icon={Zap}
                accent={stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}
              />
              <StatCard
                label="PnL Total"
                value={formatPnl(stats.totalPnl)}
                icon={stats.totalPnl >= 0 ? TrendingUp : TrendingDown}
                accent={stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}
              />
              <StatCard
                label="Promedio"
                value={
                  stats.wins + stats.losses > 0
                    ? formatPnl(stats.totalPnl / (stats.wins + stats.losses))
                    : '--'
                }
                icon={stats.totalPnl >= 0 ? TrendingUp : TrendingDown}
                accent={stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}
              />
            </div>
          )}

          {/* Empty filtered state */}
          {filtered.length === 0 && showFalseBreakoutsOnly ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground text-sm">No hay falsas rupturas registradas.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Fecha</TableHead>
                      <TableHead>Activo</TableHead>
                      <TableHead>Lado</TableHead>
                      <TableHead className="text-right">Tamaño</TableHead>
                      <TableHead className="text-right">Entrada</TableHead>
                      <TableHead className="text-right">Salida</TableHead>
                      <TableHead className="text-right">PnL</TableHead>
                      <TableHead className="text-center">Duración</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((trade) => {
                      const pnl = trade.realizedPnl ? parseFloat(trade.realizedPnl) : null;
                      const duration =
                        trade.openedAt && trade.closedAt
                          ? formatDuration(trade.openedAt, trade.closedAt)
                          : null;
                      return (
                        <TableRow key={trade.id}>
                          {/* Date */}
                          <TableCell className="tabular-nums">
                            {trade.closedAt ? (
                              <div>
                                <span className="text-foreground text-xs">
                                  {formatDate(trade.closedAt)}
                                </span>
                                <span className="text-muted-foreground/60 text-[11px] ml-1.5">
                                  {formatTime(trade.closedAt)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>

                          {/* Asset */}
                          <TableCell>
                            <span className="font-medium text-foreground">{trade.asset}</span>
                          </TableCell>

                          {/* Side */}
                          <TableCell>
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium ${
                                trade.side === 'short' ? 'text-red-400' : 'text-green-400'
                              }`}
                            >
                              <span
                                className={`size-1.5 rounded-full ${
                                  trade.side === 'short' ? 'bg-red-400' : 'bg-green-400'
                                }`}
                              />
                              {trade.side.toUpperCase()}
                            </span>
                          </TableCell>

                          {/* Size */}
                          <TableCell className="text-right tabular-nums font-mono text-xs text-muted-foreground">
                            {parseFloat(trade.size).toFixed(4)}
                          </TableCell>

                          {/* Entry */}
                          <TableCell className="text-right tabular-nums text-xs">
                            ${parseFloat(trade.entryPrice).toLocaleString()}
                          </TableCell>

                          {/* Exit */}
                          <TableCell className="text-right tabular-nums text-xs">
                            {trade.exitPrice ? (
                              `$${parseFloat(trade.exitPrice).toLocaleString()}`
                            ) : (
                              <span className="text-muted-foreground/40">--</span>
                            )}
                          </TableCell>

                          {/* P&L */}
                          <TableCell className="text-right tabular-nums">
                            {pnl !== null ? (
                              <span
                                className={`text-xs font-semibold ${
                                  pnl >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}
                              >
                                {formatPnl(pnl)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">--</span>
                            )}
                          </TableCell>

                          {/* Duration */}
                          <TableCell className="text-center">
                            {duration ? (
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {duration}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">--</span>
                            )}
                          </TableCell>

                          {/* Type */}
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                trade.walletType === 'protection'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                              }`}
                            >
                              {trade.walletType}
                            </Badge>
                          </TableCell>

                          {/* Reason */}
                          <TableCell>
                            {trade.isFalseBreakout ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/20"
                              >
                                Falsa Ruptura
                              </Badge>
                            ) : trade.closeReason ? (
                              <span className="text-[11px] text-muted-foreground">
                                {trade.closeReason === 'range_return'
                                  ? 'Retorno al rango'
                                  : trade.closeReason === 'manual'
                                    ? 'Manual'
                                    : trade.closeReason}
                              </span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Footer */}
              <div className="border-t border-border px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground/60">
                  {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
                  {showFalseBreakoutsOnly ? ' (filtrado)' : ''}
                </span>
                {stats && filtered.length > 0 && !showFalseBreakoutsOnly && (
                  <span
                    className={`text-xs font-medium tabular-nums ${
                      stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    Neto: {formatPnl(stats.totalPnl)}
                  </span>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            {label}
          </span>
          <Icon className={`size-3.5 ${accent}`} aria-hidden="true" />
        </div>
        <p className={`text-lg font-bold tabular-nums ${accent}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{sub}</p>}
      </CardContent>
    </Card>
  );
}
