import Link from "next/link";
import { AppTabBar } from "@/components/dashboard/app-tab-bar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Logo } from "@/components/logo";
import { InstallApp, type InstallAudience } from "@/components/pwa/install-app";
import { signOutAction } from "@/lib/auth/actions";
import { SITE } from "@/lib/site";

type NavItem = { href: string; label: string };

/** Who's looking at this shell, judged by its nav (for the install card's pitch). */
function audienceFor(nav: readonly NavItem[]): InstallAudience {
  if (nav.some((item) => item.href === "/dashboard")) return "trade";
  if (nav.some((item) => item.href === "/pm-dashboard")) return "pm";
  return "other";
}

/**
 * Shared authenticated shell: indigo sidebar + content area.
 * Used by the trade dashboard, PM dashboard, and admin (each passes its nav).
 * On phones the sidebar gives way to a bottom tab bar (AppTabBar), so the
 * dashboards feel like an installed app; the install card sits in the sidebar
 * on larger screens and above the content on phones.
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
  const audience = audienceFor(nav);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-4 md:flex print:hidden">
        <Link href="/" className="mb-6 flex items-center px-2" aria-label="PMRFP home">
          <Logo className="text-teal-300" />
        </Link>
        <div className="eyebrow mb-3 px-3 text-teal-300/60">{area}</div>
        <SidebarNav items={nav} />
        <InstallApp variant="sidebar" audience={audience} className="mt-6" />
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
        {/* Below md the bottom padding clears the fixed tab bar (4rem + the phone's home-indicator inset). */}
        <main className="flex-1 p-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-8 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 print:p-0">
          <div className="md:hidden print:hidden">
            <InstallApp variant="banner" audience={audience} className="mb-5" />
          </div>
          {children}
        </main>
      </div>

      <AppTabBar nav={nav} area={area} />
    </div>
  );
}
