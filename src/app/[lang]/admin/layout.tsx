import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ADMIN_NAV } from "@/lib/site";
import { setLangFrom } from "@/i18n/server";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { pendingReviewCount } from "@/lib/pm-jobs/server";
import { organizationReviewCounts } from "@/lib/organizations/review-server";

// Utility pages: keep them out of the index (links still followed).
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function AdminLayout({
  children, params }: {
  children: React.ReactNode;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  // Posts waiting at /admin/rfps: a count badge on "RFPs" so nothing sits unseen.
  // Same on "Organizations": new companies waiting for approval plus approved
  // companies whose profile edits are waiting for a look.
  const session = isServiceConfigured() ? await getSession().catch(() => null) : null;
  const isAdmin = Boolean(session && isAdminRole(session.profile.primary_role));
  const db = isAdmin ? createServiceClient() : null;
  const [pending, orgs] = db
    ? await Promise.all([
        pendingReviewCount(db).catch(() => 0),
        organizationReviewCounts(db).catch(() => ({ waiting: 0, edited: 0 })),
      ])
    : [0, { waiting: 0, edited: 0 }];
  const orgBadge = orgs.waiting + orgs.edited;
  const nav = ADMIN_NAV.map((item) => {
    if (item.href === "/admin/rfps" && pending > 0) return { ...item, badge: pending };
    if (item.href === "/admin/organizations" && orgBadge > 0) return { ...item, badge: orgBadge };
    return item;
  });
  return (
    <DashboardShell nav={nav} area="Admin">
      {children}
    </DashboardShell>
  );
}
