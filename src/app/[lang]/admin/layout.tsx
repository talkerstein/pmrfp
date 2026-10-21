import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ADMIN_NAV } from "@/lib/site";
import { setLangFrom } from "@/i18n/server";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { pendingReviewCount } from "@/lib/pm-jobs/server";

// Utility pages: keep them out of the index (links still followed).
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function AdminLayout({
  children, params }: {
  children: React.ReactNode;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  // Posts waiting at /admin/rfps: a count badge on "RFPs" so nothing sits unseen.
  const session = isServiceConfigured() ? await getSession().catch(() => null) : null;
  const pending = session && isAdminRole(session.profile.primary_role) ? await pendingReviewCount(createServiceClient()).catch(() => 0) : 0;
  const nav = ADMIN_NAV.map((item) => (item.href === "/admin/rfps" && pending > 0 ? { ...item, badge: pending } : item));
  return (
    <DashboardShell nav={nav} area="Admin">
      {children}
    </DashboardShell>
  );
}
