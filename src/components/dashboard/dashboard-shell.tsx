import Link from "next/link";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { SITE } from "@/lib/site";

type NavItem = { href: string; label: string };

/**
 * Shared authenticated shell: navy sidebar + content area.
 * Used by the trade dashboard, PM dashboard, and admin (each passes its nav).
 */
export function DashboardShell({
  nav,
  area,
  children,
}: {
  nav: readonly NavItem[];
  area: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-gold-500 text-[13px] font-bold tracking-tight text-navy">
            PM
          </span>
          <span className="text-base font-semibold tracking-tight text-white">
            {SITE.name}
          </span>
        </Link>
        <div className="eyebrow mb-3 px-3 text-slate-500">{area}</div>
        <SidebarNav items={nav} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-5">
          <div className="eyebrow text-muted-foreground md:hidden">
            {SITE.name} · {area}
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              View site
            </Link>
          </div>
        </header>
        <main className="flex-1 p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
