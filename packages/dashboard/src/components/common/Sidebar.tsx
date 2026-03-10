'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: 'grid' },
  { href: '/pools', label: 'Pools', icon: 'layers' },
  { href: '/wallets', label: 'Wallets', icon: 'wallet' },
  { href: '/hedges', label: 'Hedges', icon: 'shield' },
  { href: '/history', label: 'History', icon: 'clock' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const ICONS: Record<string, string> = {
  grid: 'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5ZM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4Z',
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  wallet:
    'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  clock:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42V7z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm-9.46 2a9.97 9.97 0 0 1 .78-2.21l1.55.9a1 1 0 0 0 1.37-.36l.01-.02a1 1 0 0 0-.34-1.37l-1.55-.9a10.05 10.05 0 0 1 1.7-1.7l.9 1.55a1 1 0 0 0 1.37.36l.02-.01a1 1 0 0 0 .36-1.37l-.9-1.55A9.97 9.97 0 0 1 10 2.54V4.3a1 1 0 0 0 1 1h.02a1 1 0 0 0 1-1V2.54c.76.1 1.5.3 2.21.78l-.9 1.55a1 1 0 0 0 .36 1.37l.02.01a1 1 0 0 0 1.37-.36l.9-1.55a10.05 10.05 0 0 1 1.7 1.7l-1.55.9a1 1 0 0 0-.36 1.37l.01.02a1 1 0 0 0 1.37.36l1.55-.9c.36.7.62 1.44.78 2.21H17.7a1 1 0 0 0-1 1v.02a1 1 0 0 0 1 1h1.76a9.97 9.97 0 0 1-.78 2.21l-1.55-.9a1 1 0 0 0-1.37.36l-.01.02a1 1 0 0 0 .34 1.37l1.55.9a10.05 10.05 0 0 1-1.7 1.7l-.9-1.55a1 1 0 0 0-1.37-.36l-.02.01a1 1 0 0 0-.36 1.37l.9 1.55a9.97 9.97 0 0 1-2.21.78V19.7a1 1 0 0 0-1-1h-.02a1 1 0 0 0-1 1v1.76a9.97 9.97 0 0 1-2.21-.78l.9-1.55a1 1 0 0 0-.36-1.37l-.02-.01a1 1 0 0 0-1.37.36l-.9 1.55a10.05 10.05 0 0 1-1.7-1.7l1.55-.9a1 1 0 0 0 .36-1.37l-.01-.02a1 1 0 0 0-1.37-.36l-1.55.9A9.97 9.97 0 0 1 2.54 14H4.3a1 1 0 0 0 1-1v-.02a1 1 0 0 0-1-1H2.54z',
};

export function Sidebar() {
  const pathname = usePathname();

  const { data: botStatus } = useQuery<{ running: boolean; lastSeen: number | null }>({
    queryKey: ['bot-status'],
    queryFn: () => fetch('/api/bot-status').then((r) => r.json()),
    refetchInterval: 10_000,
  });

  const isRunning = botStatus?.running ?? false;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <h1 className="text-xl font-bold text-sidebar-foreground">Trading Bot</h1>
        <p className="text-xs text-muted-foreground mt-1">Liquidity Pool Hedging</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-sidebar-primary/20 text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
              </svg>
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
            {isRunning ? 'Bot Running' : 'Bot Offline'}
          </span>
        </div>
      </div>
    </aside>
  );
}
