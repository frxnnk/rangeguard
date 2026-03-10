'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PoolCard } from '@/components/pools/PoolCard';
import Link from 'next/link';

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pools'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/pools/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pools'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Pools</h1>
        <Link
          href="/pools/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add Pool
        </Link>
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading pools...</div>
      ) : pools.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No pools configured yet.</p>
          <Link href="/pools/new" className="text-blue-400 hover:text-blue-300">
            Add your first pool
          </Link>
        </div>
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
