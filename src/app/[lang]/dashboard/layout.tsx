import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getSession } from "@/lib/access/access";
import { encodeAccountGeo } from "@/lib/visitor-geo";
import { getAccountGeo } from "@/lib/visitor-geo.server";
import { TRADE_NAV } from "@/lib/site";
import { setLangFrom } from "@/i18n/server";

// Utility pages: keep them out of the index (links still followed).
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function TradeDashboardLayout({
  children, params }: {
  children: React.ReactNode;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const accountCountry = encodeAccountGeo(await getAccountGeo(await getSession().catch(() => null)));
  return (
    <DashboardShell accountCountry={accountCountry} nav={TRADE_NAV} area="Trade Dashboard">
      {children}
    </DashboardShell>
  );
}
