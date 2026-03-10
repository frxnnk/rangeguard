interface RangeIndicatorProps {
  lower: number;
  upper: number;
  current?: number;
}

export function RangeIndicator({ lower, upper, current }: RangeIndicatorProps) {
  const range = upper - lower;
  const padding = range * 0.2; // 20% padding on each side for display
  const displayMin = lower - padding;
  const displayMax = upper + padding;
  const displayRange = displayMax - displayMin;

  const lowerPercent = ((lower - displayMin) / displayRange) * 100;
  const upperPercent = ((upper - displayMin) / displayRange) * 100;
  const rangeWidth = upperPercent - lowerPercent;

  let currentPercent: number | undefined;
  let isInRange = false;
  if (current !== undefined) {
    currentPercent = Math.max(0, Math.min(100, ((current - displayMin) / displayRange) * 100));
    isInRange = current >= lower && current <= upper;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-gray-500">
        <span>${lower.toLocaleString()}</span>
        <span>${upper.toLocaleString()}</span>
      </div>
      <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
        {/* Range zone */}
        <div
          className="absolute h-full bg-green-500/30 border-x border-green-500/50"
          style={{ left: `${lowerPercent}%`, width: `${rangeWidth}%` }}
        />
        {/* Current price marker */}
        {currentPercent !== undefined && (
          <div
            className={`absolute top-0 h-full w-0.5 ${isInRange ? 'bg-green-400' : 'bg-red-400'}`}
            style={{ left: `${currentPercent}%` }}
          >
            <div
              className={`absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${isInRange ? 'bg-green-400' : 'bg-red-400'}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
