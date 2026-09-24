import Link from "next/link";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Logo } from "@/components/logo";
import { signOutAction } from "@/lib/auth/actions";
import { SITE } from "@/lib/site";

type NavItem = { href: string; label: string };

/**
 * Shared authenticated shell: indigo sidebar + content area.
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
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-4 md:flex print:hidden">
        <Link href="/" className="mb-6 flex items-center px-2" aria-label="PMRFP home">
          <Logo className="text-teal-300" />
        </Link>
        <div className="eyebrow mb-3 px-3 text-teal-300/60">{area}</div>
        <SidebarNav items={nav} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-5 print:hidden">
          <div className="eyebrow text-muted-foreground md:hidden">
            {SITE.name} · {area}
          </div>
          <div className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              View site
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-5 sm:p-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
