'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HedgeCard } from '@/components/hedges/HedgeCard';

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
      <h1 className="text-2xl font-bold text-white mb-6">Active Hedges</h1>

      {closeMutation.isError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          {closeMutation.error.message}
        </div>
      )}

      {closeMutation.isSuccess && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm mb-4">
          Hedge closed. P&L: ${closeMutation.data.realizedPnl}
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-500">Loading hedges...</div>
      ) : hedges.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No active hedges. Hedges open automatically when price exits a pool's range.
        </div>
      ) : (
        <div className="grid gap-4">
          {hedges.map((hedge: any) => (
            <div key={hedge.id}>
              <HedgeCard hedge={hedge} />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => {
                    if (confirm('Close this hedge manually? This will record the close in DB.')) {
                      closeMutation.mutate(hedge.id);
                    }
                  }}
                  disabled={closeMutation.isPending}
                  className="text-xs text-red-500 hover:text-red-400 disabled:text-red-500/50 transition-colors"
                >
                  {closeMutation.isPending ? 'Closing...' : 'Close Manually'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
