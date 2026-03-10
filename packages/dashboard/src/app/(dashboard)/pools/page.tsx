'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PoolCard } from '@/components/pools/PoolCard';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Layers } from 'lucide-react';

export default function PoolsPage() {
  const queryClient = useQueryClient();

  const { data: pools = [], isLoading } = useQuery({
    queryKey: ['pools'],
    queryFn: () => fetch('/api/pools').then((r) => r.json()),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      fetch(`/api/pools/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pools'] });
      toast.success('Protection toggled');
    },
    onError: () => toast.error('Failed to toggle protection'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/pools/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pools'] });
      toast.success('Pool deleted');
    },
    onError: () => toast.error('Failed to delete pool'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pools</h1>
        <Button asChild>
          <Link href="/pools/new">+ Add Pool</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : pools.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Layers className="size-10 text-muted-foreground mb-3" aria-hidden="true" />
            <p className="text-muted-foreground mb-4">No pools configured yet.</p>
            <Button asChild>
              <Link href="/pools/new">Add your first pool</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pools.map((pool: any) => (
            <PoolCard
              key={pool.id}
              pool={pool}
              onToggle={(id, active) => toggleMutation.mutate({ id, active })}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
