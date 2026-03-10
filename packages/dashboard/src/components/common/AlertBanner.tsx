import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

interface AlertBannerProps {
  type: 'warning' | 'error' | 'info';
  message: string;
  onDismiss?: () => void;
}

const ALERT_STYLES = {
  warning: 'border-yellow-500/30 text-yellow-400 [&>svg]:text-yellow-400',
  error: 'border-red-500/30 text-red-400 [&>svg]:text-red-400',
  info: 'border-blue-500/30 text-blue-400 [&>svg]:text-blue-400',
};

const ALERT_ICONS = {
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
};

export function AlertBanner({ type, message, onDismiss }: AlertBannerProps) {
  const Icon = ALERT_ICONS[type];

  return (
    <Alert className={cn('flex items-center', ALERT_STYLES[type])}>
      <Icon className="size-4" />
      <AlertDescription className="flex-1">{message}</AlertDescription>
      {onDismiss && (
        <button onClick={onDismiss} className="ml-4 hover:opacity-70">
          <X className="size-4" />
        </button>
      )}
    </Alert>
  );
}
