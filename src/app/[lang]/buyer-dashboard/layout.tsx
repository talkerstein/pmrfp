import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PUBLIC_BUYER_NAV } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";

// Utility pages: keep them out of the index (links still followed).
export const metadata: Metadata = { robots: { index: false, follow: true } };

/** The public-buyer dashboard (towns, cities, school boards…), in the page's language. */
export default async function BuyerDashboardLayout({ children, params }: { children: React.ReactNode } & { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("towns").dashboard;
  const nav = PUBLIC_BUYER_NAV.map((n) => ({ href: n.href, label: t.nav[n.key] }));
  return (
    <DashboardShell nav={nav} area={t.area} localized>
      {children}
    </DashboardShell>
  );
}
