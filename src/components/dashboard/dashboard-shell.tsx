import Link from "@/i18n/link";
import { AppTabBar } from "@/components/dashboard/app-tab-bar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Logo } from "@/components/logo";
import { InstallApp, type InstallAudience } from "@/components/pwa/install-app";
import { signOutAction } from "@/lib/auth/actions";
import { AccountCountrySync } from "@/components/geo/account-country-sync";
import { SITE } from "@/lib/site";
import { getDictionary, type Messages } from "@/i18n/dictionaries";
import { getLang } from "@/i18n/server";
import { fmt } from "@/i18n/format";

type NavItem = { href: string; label: string };
type Shell = Messages["dash"]["shell"];

/** TRADE_NAV / PM_NAV hrefs (src/lib/site.ts) -> translated label. Admin stays English. */
const NAV_KEY: Record<string, keyof Shell["nav"]> = {
  "/dashboard": "home",
  "/dashboard/company": "company",
  "/dashboard/rfps": "rfps",
  "/dashboard/saved-rfps": "savedRfps",
  "/dashboard/interests": "interests",
  "/dashboard/projects": "projects",
  "/jobs/manage": "hiring",
  "/dashboard/billing": "billing",
  "/dashboard/settings": "settings",
  "/pm-dashboard": "home",
  "/pm-dashboard/rfps": "pmRfps",
  "/pm-dashboard/rfps/new": "pmPost",
  "/rfp-writer": "pmWriter",
  "/pm-dashboard/saved-vendors": "pmTrusted",
};

/** Phone tab-bar short names (src/lib/pwa/tabs.ts TAB_LABELS), by href. */
const TAB_KEY: Record<string, keyof Shell["tabs"]> = {
  "/dashboard": "home",
  "/dashboard/rfps": "feed",
  "/dashboard/saved-rfps": "saved",
  "/dashboard/interests": "interests",
  "/pm-dashboard": "home",
  "/pm-dashboard/rfps": "pmRfps",
  "/pm-dashboard/rfps/new": "pmPost",
  "/pm-dashboard/saved-vendors": "pmTrades",
};

const AREA_KEY: Record<string, keyof Shell["area"]> = {
  "Trade Dashboard": "trade",
  "Property Manager": "pm",
};

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
  accountCountry = null,
  children,
}: {
  nav: readonly NavItem[];
  area: string;
  /** The company's location as the account cookie value ("CA-ON"), so public pages follow it. */
  accountCountry?: string | null;
  children: React.ReactNode;
}) {
  const audience = audienceFor(nav);
  // The admin area stays English; trade and PM dashboards follow the page language.
  const lang = audience === "other" ? "en" : getLang();
  const t = getDictionary(lang).dash.shell;
  // English keeps the labels from src/lib/site.ts as they are.
  const items = lang === "en" ? nav : nav.map((item) => ({ ...item, label: NAV_KEY[item.href] ? t.nav[NAV_KEY[item.href]] : item.label }));
  const areaLabel = lang !== "en" && AREA_KEY[area] ? t.area[AREA_KEY[area]] : area;
  const tabLabels: Record<string, string> = {};
  if (lang !== "en") for (const [href, key] of Object.entries(TAB_KEY)) tabLabels[href] = t.tabs[key];
  return (
    <div className="flex min-h-screen bg-background">
      <AccountCountrySync value={accountCountry} />
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-4 md:flex print:hidden">
        <Link href="/" className="mb-6 flex items-center px-2" aria-label={t.home}>
          <Logo className="text-teal-300" />
        </Link>
        <div className="eyebrow mb-3 px-3 text-teal-300/60">{areaLabel}</div>
        <SidebarNav items={items} />
        <InstallApp variant="sidebar" audience={audience} className="mt-6" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-5 print:hidden">
          <div className="eyebrow text-muted-foreground md:hidden">
            {SITE.name} · {areaLabel}
          </div>
          <div className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              {t.viewSite}
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="hover:text-foreground">
                {t.signOut}
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

      <AppTabBar
        nav={items}
        area={areaLabel}
        labels={{ more: t.more, viewSite: t.viewSite, tabs: fmt(t.tabsAria, { area: areaLabel }), short: tabLabels }}
      />
    </div>
  );
}
