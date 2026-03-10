'use client';

import { Switch } from '@/components/ui/switch';

interface ProtectionToggleProps {
  active: boolean;
  onChange: (active: boolean) => void;
}

export function ProtectionToggle({ active, onChange }: ProtectionToggleProps) {
  return <Switch checked={active} onCheckedChange={onChange} />;
}
