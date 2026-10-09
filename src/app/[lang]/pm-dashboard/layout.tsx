import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getSession } from "@/lib/access/access";
import { encodeAccountGeo } from "@/lib/visitor-geo";
import { getAccountGeo } from "@/lib/visitor-geo.server";
import { PM_NAV } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";

// Utility pages: keep them out of the index (links still followed).
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function PmDashboardLayout({
  children, params }: {
  children: React.ReactNode;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const accountCountry = encodeAccountGeo(await getAccountGeo(await getSession().catch(() => null)));
  const t = getT("pm");
  return (
    <DashboardShell accountCountry={accountCountry} nav={PM_NAV} area={t.area}>
      {children}
    </DashboardShell>
  );
}
