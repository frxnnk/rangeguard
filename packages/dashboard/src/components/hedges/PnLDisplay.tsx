interface PnLDisplayProps {
  value: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PnLDisplay({ value, label, size = 'md' }: PnLDisplayProps) {
  const isPositive = value >= 0;
  const textSize = size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-xl' : 'text-sm';

  return (
    <div>
      {label && <p className="text-xs text-gray-500 mb-0.5">{label}</p>}
      <p
        className={`${textSize} font-bold font-mono ${isPositive ? 'text-green-400' : 'text-red-400'}`}
      >
        {isPositive ? '+' : ''}
        {value.toFixed(2)} USD
      </p>
    </div>
  );
}
