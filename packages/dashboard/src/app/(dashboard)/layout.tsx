import { Sidebar } from '@/components/common/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 pt-16 md:pt-6 ml-0 md:ml-64">{children}</main>
    </div>
  );
}
