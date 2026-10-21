"use client";

import { useLocalePath } from "@/i18n/provider";
import Link from "@/i18n/link";
import { cn } from "@/lib/utils";

/** `badge`: a count shown next to the label (admin: posts waiting for review). */
type NavItem = { href: string; label: string; badge?: number };

export function SidebarNav({ items }: { items: readonly NavItem[] }) {
  const pathname = useLocalePath();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" &&
            item.href !== "/pm-dashboard" &&
            item.href !== "/admin" &&
            pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-indigo" aria-label={`${item.badge} waiting`} data-badge={item.badge}>
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
