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
  ScrollText,
  Settings,
  Info,
  Menu,
  LogOut,
  FlaskConical,
  BookOpen,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface NavItem {
  href: string;
  label: string;
  icon: ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Simulación',
    items: [{ href: '/backtest', label: 'Backtest', icon: FlaskConical }],
  },
  {
    title: 'Conocimiento',
    items: [{ href: '/docs', label: 'Documentación', icon: BookOpen }],
  },
  {
    title: 'Operaciones',
    items: [
      { href: '/', label: 'Resumen', icon: LayoutGrid },
      { href: '/pools', label: 'Pools', icon: Layers },
      { href: '/wallets', label: 'Billeteras', icon: Wallet },
      { href: '/hedges', label: 'Coberturas', icon: Shield },
      { href: '/history', label: 'Historial', icon: Clock },
      { href: '/logs', label: 'Logs', icon: ScrollText },
      { href: '/settings', label: 'Configuración', icon: Settings },
    ],
  },
];

const BOTTOM_ITEM: NavItem = { href: '/about', label: 'Acerca de', icon: Info };

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const { data: botStatus } = useQuery<{ running: boolean; lastSeen: number | null; env?: string }>(
    {
      queryKey: ['bot-status'],
      queryFn: () => fetch('/api/bot-status').then((r) => r.json()),
      refetchInterval: 10_000,
    },
  );

  const isRunning = botStatus?.running ?? false;

  return (
    <>
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-sidebar-foreground">RangeGuard</h1>
          <Badge
            variant={botStatus?.env === 'mainnet' ? 'destructive' : 'secondary'}
            className="text-[10px]"
          >
            {(botStatus?.env || 'testnet').toUpperCase()}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Cobertura de Pools de Liquidez</p>
      </div>

      <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              {section.title}
            </span>
            <div className="mt-1.5 space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-sidebar-primary/20 text-sidebar-primary'
                        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Bottom standalone link */}
        <div className="pt-2">
          <Link
            href={BOTTOM_ITEM.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith(BOTTOM_ITEM.href)
                ? 'bg-sidebar-primary/20 text-sidebar-primary'
                : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
            }`}
          >
            <BOTTOM_ITEM.icon className="size-4" aria-hidden="true" />
            {BOTTOM_ITEM.label}
          </Link>
        </div>
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'
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
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
