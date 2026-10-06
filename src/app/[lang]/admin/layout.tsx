import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ADMIN_NAV } from "@/lib/site";
import { setLangFrom } from "@/i18n/server";

// Utility pages: keep them out of the index (links still followed).
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function AdminLayout({
  children, params }: {
  children: React.ReactNode;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  return (
    <DashboardShell nav={ADMIN_NAV} area="Admin">
      {children}
    </DashboardShell>
  );
}
