import Link from 'next/link';
import { PoolForm } from '@/components/pools/PoolForm';

export default function NewPoolPage() {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        <Link href="/pools" className="hover:text-foreground transition-colors">
          Pools
        </Link>
        {' / '}
        <span className="text-foreground">Nuevo</span>
      </p>
      <PoolForm />
    </div>
  );
}
