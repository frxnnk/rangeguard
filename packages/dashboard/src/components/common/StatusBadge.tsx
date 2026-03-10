import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  'in-range': 'border-green-500/50 bg-green-500/10 text-green-400',
  'out-of-range-below': 'border-red-500/50 bg-red-500/10 text-red-400',
  'out-of-range-above': 'border-orange-500/50 bg-orange-500/10 text-orange-400',
  monitoring: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
  error: 'border-red-500/50 bg-red-500/10 text-red-400',
  open: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
  closed: 'border-muted-foreground/50 bg-muted text-muted-foreground',
  liquidated: 'border-red-500/50 bg-red-500/10 text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  'in-range': 'In Range',
  'out-of-range-below': 'Below Range',
  'out-of-range-above': 'Above Range',
  monitoring: 'Monitoring',
  error: 'Error',
  open: 'Open',
  closed: 'Closed',
  liquidated: 'Liquidated',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status] || STATUS_STYLES['error'])}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}
