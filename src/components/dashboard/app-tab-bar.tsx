"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bookmark,
  Building2,
  CirclePlus,
  Ellipsis,
  FileText,
  House,
  LayoutDashboard,
  LayoutGrid,
  Rss,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { activeHref, pickTabs, tabLabel, type NavItem } from "@/lib/pwa/tabs";
import { cn } from "@/lib/utils";

const TAB_ICONS: Record<string, LucideIcon> = {
  "/dashboard": House,
  "/dashboard/rfps": Rss,
  "/dashboard/saved-rfps": Bookmark,
  "/dashboard/interests": Target,
  "/pm-dashboard": House,
  "/pm-dashboard/rfps": FileText,
  "/pm-dashboard/rfps/new": CirclePlus,
  "/pm-dashboard/saved-vendors": Users,
  "/admin": LayoutDashboard,
  "/admin/users": Users,
  "/admin/organizations": Building2,
  "/admin/rfps": FileText,
};

/**
 * Phone-only bottom tab bar for the dashboards: the four pages people use
 * most, plus "More", which opens the full sidebar nav as a bottom sheet (on
 * phones the sidebar is hidden). Hidden at md and up, and in print.
 */
export function AppTabBar({ nav, area }: { nav: readonly NavItem[]; area: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = pickTabs(nav);
  const current = activeHref(pathname, nav.map((item) => item.href));
  const onTab = tabs.some((tab) => tab.href === current);
  const moreActive = moreOpen || (current !== null && !onTab);

  return (
    <>
      <nav
        aria-label={`${area} tabs`}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.href] ?? LayoutGrid;
            const active = tab.href === current;
            return (
              <li key={tab.href} className="min-w-0">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className="group flex h-full flex-col items-center justify-center gap-1"
                >
                  <TabIcon icon={Icon} active={active} />
                  <TabText active={active}>{tabLabel(tab)}</TabText>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="group flex h-full w-full flex-col items-center justify-center gap-1"
            >
              <TabIcon icon={Ellipsis} active={moreActive} />
              <TabText active={moreActive}>More</TabText>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={(open) => setMoreOpen(open)}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] gap-2 rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="pb-0">
            <SheetTitle className="eyebrow text-muted-foreground">{area}</SheetTitle>
          </SheetHeader>
          <nav aria-label={area} className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                aria-current={item.href === current ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-3 text-base font-medium transition-colors",
                  item.href === current
                    ? "bg-secondary text-foreground"
                    : "text-foreground/80 hover:bg-secondary hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="mx-3 my-1 border-t border-border" />
            <Link
              href="/"
              onClick={() => setMoreOpen(false)}
              className="rounded-lg px-3 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              View site
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TabIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-7 w-14 items-center justify-center rounded-full transition-colors",
        active ? "bg-teal-300/70 text-indigo" : "text-muted-foreground group-hover:text-foreground",
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
    </span>
  );
}

function TabText({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "max-w-full truncate px-1 text-[11px] leading-tight",
        active ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
