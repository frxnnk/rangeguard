import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/common/Sidebar';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Trading Bot CGR',
  description: 'Hedging bot for concentrated liquidity pools',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground min-h-screen">
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-6 ml-64">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
