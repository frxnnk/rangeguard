import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface WalletCardProps {
  wallet: {
    id: string;
    alias: string;
    address: string;
    walletType: string;
    balanceAvailable?: string;
    balanceMarginUsed?: string;
    balanceTotal?: string;
    lowBalanceThreshold: string;
    lastBalanceCheck?: number;
  };
}

export function WalletCard({ wallet }: WalletCardProps) {
  const available = wallet.balanceAvailable ? parseFloat(wallet.balanceAvailable) : null;
  const marginUsed = wallet.balanceMarginUsed ? parseFloat(wallet.balanceMarginUsed) : null;
  const total = wallet.balanceTotal ? parseFloat(wallet.balanceTotal) : null;
  const threshold = parseFloat(wallet.lowBalanceThreshold);
  const isLow = available !== null && available < threshold;

  return (
    <Card className={cn(isLow && 'border-yellow-500/50')}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{wallet.alias}</h3>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              wallet.walletType === 'protection'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                : 'bg-purple-500/10 text-purple-400 border-purple-500/30',
            )}
          >
            {wallet.walletType}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {isLow && (
          <Alert className="border-yellow-500/30 text-yellow-400 mb-3">
            <AlertDescription className="text-xs">
              ¡Saldo bajo! Por debajo del umbral de ${threshold}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Disponible</p>
            <p className={`text-sm font-medium ${isLow ? 'text-yellow-400' : 'text-foreground'}`}>
              {available !== null ? `$${available.toFixed(2)}` : '--'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Margen Usado</p>
            <p className="text-sm font-medium text-foreground">
              {marginUsed !== null ? `$${marginUsed.toFixed(2)}` : '--'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-sm font-medium text-foreground">
              {total !== null ? `$${total.toFixed(2)}` : '--'}
            </p>
          </div>
        </div>

        {wallet.lastBalanceCheck && (
          <p className="text-xs text-muted-foreground mt-3">
            Actualizado {new Date(wallet.lastBalanceCheck).toLocaleTimeString('es-AR')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
