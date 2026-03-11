import { PoolForm } from '@/components/pools/PoolForm';

export default function NewPoolPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Agregar Pool</h1>
      <PoolForm />
    </div>
  );
}
