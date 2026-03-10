'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HedgeCard } from '@/components/hedges/HedgeCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function HedgesPage() {
  const queryClient = useQueryClient();

  const { data: hedges = [], isLoading } = useQuery({
    queryKey: ['hedges'],
    queryFn: () => fetch('/api/hedges').then((r) => r.json()),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hedges'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Active Hedges</h1>

      {closeMutation.isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertDescription>{closeMutation.error.message}</AlertDescription>
        </Alert>
      )}

      {closeMutation.isSuccess && (
        <Alert className="mb-4 border-green-500/30 text-green-400 [&>svg]:text-green-400">
          <CheckCircle2 className="size-4" />
          <AlertDescription>Hedge closed. P&L: ${closeMutation.data.realizedPnl}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : hedges.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No active hedges. Hedges open automatically when price exits a pool's range.
        </div>
      ) : (
        <div className="grid gap-4">
          {hedges.map((hedge: any) => (
            <div key={hedge.id}>
              <HedgeCard hedge={hedge} />
              <div className="flex justify-end mt-2">
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-destructive"
                  onClick={() => {
                    if (confirm('Close this hedge manually? This will record the close in DB.')) {
                      closeMutation.mutate(hedge.id);
                    }
                  }}
                  disabled={closeMutation.isPending}
                >
                  {closeMutation.isPending ? 'Closing...' : 'Close Manually'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
