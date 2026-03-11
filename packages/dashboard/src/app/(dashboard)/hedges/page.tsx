'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HedgeCard } from '@/components/hedges/HedgeCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck } from 'lucide-react';

interface HedgeRow {
  id: string;
  asset: string;
  side: string;
  size: string;
  entryPrice: string;
  leverage: number;
  status: string;
  walletType: string;
  fees: string;
  realizedPnl?: string;
  unrealizedPnl?: string;
  unrealizedPnlUpdatedAt?: number;
  openedAt: number;
}

export default function HedgesPage() {
  const queryClient = useQueryClient();

  const { data: hedges = [], isLoading } = useQuery({
    queryKey: ['hedges'],
    queryFn: () => fetch('/api/hedges').then((r) => r.json()),
    refetchInterval: 30_000, // Refresh every 30s for live unrealized PnL
  });

  const closeMutation = useMutation({
    mutationFn: async (hedgeId: string) => {
      const res = await fetch(`/api/hedges/${hedgeId}/close`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to close hedge');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['hedges'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast.success(`Cobertura cerrada. PnL: $${data.realizedPnl}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Coberturas Activas</h1>

      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : hedges.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShieldCheck className="size-10 text-muted-foreground mb-3" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">No hay coberturas activas.</p>
            <p className="text-muted-foreground text-xs mt-1">
              Las coberturas se abren automáticamente cuando el precio sale del rango.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {hedges.map((hedge: HedgeRow) => (
            <div key={hedge.id}>
              <HedgeCard hedge={hedge} />
              <div className="flex justify-end mt-2">
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-destructive"
                  onClick={() => {
                    if (
                      confirm(
                        '¿Cerrar esta cobertura manualmente? Se registrará el cierre en la base de datos.',
                      )
                    ) {
                      closeMutation.mutate(hedge.id);
                    }
                  }}
                  disabled={closeMutation.isPending}
                >
                  {closeMutation.isPending ? 'Cerrando\u2026' : 'Cerrar Manualmente'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
