import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NetworkBadgeProps {
  chainName: string;
}

const CHAIN_COLORS: Record<string, string> = {
  Ethereum: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Arbitrum: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  Base: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  Polygon: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

export function NetworkBadge({ chainName }: NetworkBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md',
        CHAIN_COLORS[chainName] || 'bg-muted text-muted-foreground border-border',
      )}
    >
      {chainName}
    </Badge>
  );
}
