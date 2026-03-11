'use client';

import { useState, useEffect, type ElementType } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutGrid,
  Layers,
  Wallet,
  Shield,
  Clock,
  Settings,
  Info,
  Menu,
  LogOut,
} from 'lucide-react';

const NAV_ITEMS: { href: string; label: string; icon: ElementType }[] = [
  { href: '/', label: 'Resumen', icon: LayoutGrid },
  { href: '/pools', label: 'Pools', icon: Layers },
  { href: '/wallets', label: 'Billeteras', icon: Wallet },
  { href: '/hedges', label: 'Coberturas', icon: Shield },
  { href: '/history', label: 'Historial', icon: Clock },
  { href: '/settings', label: 'Configuración', icon: Settings },
  { href: '/about', label: 'Acerca de', icon: Info },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const { data: botStatus } = useQuery<{ running: boolean; lastSeen: number | null }>({
    queryKey: ['bot-status'],
    queryFn: () => fetch('/api/bot-status').then((r) => r.json()),
    refetchInterval: 10_000,
  });

  const isRunning = botStatus?.running ?? false;

  return (
    <>
      <div className="p-6 border-b border-sidebar-border">
        <h1 className="text-xl font-bold text-sidebar-foreground">Trading Bot</h1>
        <p className="text-xs text-muted-foreground mt-1">Cobertura de Pools de Liquidez</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-sidebar-primary/20 text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-muted-foreground">
            {isRunning ? 'Bot Activo' : 'Bot Inactivo'}
          </span>
        </div>
        <button
          onClick={async () => {
            await fetch('/api/auth', { method: 'DELETE' });
            router.push('/login');
            router.refresh();
          }}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
        >
          <LogOut className="size-3.5" />
          Cerrar sesión
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-lg bg-card border border-border"
        aria-label="Abrir menú"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            className="absolute inset-0 bg-black/60 cursor-default"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          />
          <aside className="relative z-50 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:left-0 md:top-0 md:h-screen md:w-64 md:flex md:flex-col bg-sidebar border-r border-sidebar-border">
        <SidebarContent />
      </aside>
    </>
  );
}
