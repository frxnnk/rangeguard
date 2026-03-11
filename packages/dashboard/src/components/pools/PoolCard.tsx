'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/common/StatusBadge';
import { NetworkBadge } from '@/components/common/NetworkBadge';
import { RangeIndicator } from './RangeIndicator';
import { ProtectionToggle } from './ProtectionToggle';
import { PoolEditSheet } from './PoolEditSheet';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';

interface PoolCardProps {
  pool: {
    id: string;
    name: string;
    chainName: string;
    token0Symbol: string;
    token1Symbol: string;
    feeTier: number;
    rangeLower: number;
    rangeUpper: number;
    poolAmount: string;
    hedgeAsset: string;
    leverage: number;
    protectionDirection: string;
    protectionActive: boolean;
    status: string;
    currentPrice?: string;
  };
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}

const FEE_LABELS: Record<number, string> = {
  100: '0.01%',
  500: '0.05%',
  3000: '0.3%',
  10000: '1%',
};

export function PoolCard({ pool, onToggle, onDelete }: PoolCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const currentPrice = pool.currentPrice ? parseFloat(pool.currentPrice) : undefined;

  return (
    <>
      <Card className="hover:border-muted-foreground/20 transition-colors">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-foreground">
                  {pool.token0Symbol}/{pool.token1Symbol}
                </h3>
                <NetworkBadge chainName={pool.chainName} />
                <span className="text-xs text-muted-foreground">
                  {FEE_LABELS[pool.feeTier] || `${pool.feeTier}`}
                </span>
              </div>
              {pool.name && <p className="text-sm text-muted-foreground">{pool.name}</p>}
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={pool.status} />
              <ProtectionToggle
                active={pool.protectionActive}
                onChange={(active) => onToggle(pool.id, active)}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <RangeIndicator lower={pool.rangeLower} upper={pool.rangeUpper} current={currentPrice} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <div>
              <p className="text-xs text-muted-foreground">Monto del Pool</p>
              <p className="text-sm font-medium text-foreground">
                ${parseFloat(pool.poolAmount).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Activo de Cobertura</p>
              <p className="text-sm font-medium text-foreground">{pool.hedgeAsset}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Apalancamiento</p>
              <p className="text-sm font-medium text-foreground">{pool.leverage}x</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dirección</p>
              <p className="text-sm font-medium text-foreground capitalize">
                {pool.protectionDirection}
              </p>
            </div>
          </div>
        </CardContent>

        {currentPrice !== undefined && (
          <CardContent>
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">Precio Actual</p>
              <p className="text-lg font-mono font-bold text-foreground">
                $
                {currentPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </CardContent>
        )}

        <CardFooter className="justify-between border-t pt-4">
          <div className="flex items-center gap-3">
            <Button variant="link" asChild className="h-auto p-0 text-xs">
              <Link href={`/pools/${pool.id}`}>Ver detalles</Link>
            </Button>
            <Button
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-3 mr-1" />
              Editar
            </Button>
          </div>
          <Button
            variant="link"
            className="h-auto p-0 text-xs text-destructive"
            onClick={() => {
              if (
                confirm(`¿Eliminar pool "${pool.name || `${pool.token0Symbol}/${pool.token1Symbol}`}"?`)
              ) {
                onDelete(pool.id);
              }
            }}
          >
            Eliminar pool
          </Button>
        </CardFooter>
      </Card>

      <PoolEditSheet poolId={pool.id} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
