import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ADMIN_NAV } from "@/lib/site";
import { setLangFrom } from "@/i18n/server";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { pendingReviewCount } from "@/lib/pm-jobs/server";
import { organizationReviewCounts } from "@/lib/organizations/review-server";
import { buyerReviewCounts } from "@/lib/buyers/admin-notify";

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
  // And on "Buyer Sources": public-buyer page claims to check plus new "list your tenders" requests.
  const [pending, orgs, buyers] = db
    ? await Promise.all([
        pendingReviewCount(db).catch(() => 0),
        organizationReviewCounts(db).catch(() => ({ waiting: 0, edited: 0 })),
        buyerReviewCounts(db).catch(() => ({ claims: 0, requests: 0 })),
      ])
    : [0, { waiting: 0, edited: 0 }, { claims: 0, requests: 0 }];
  const orgBadge = orgs.waiting + orgs.edited;
  const buyerBadge = buyers.claims + buyers.requests;
  const nav = ADMIN_NAV.map((item) => {
    if (item.href === "/admin/rfps" && pending > 0) return { ...item, badge: pending };
    if (item.href === "/admin/organizations" && orgBadge > 0) return { ...item, badge: orgBadge };
    if (item.href === "/admin/buyer-sources" && buyerBadge > 0) return { ...item, badge: buyerBadge };
    return item;
  });
  return (
    <DashboardShell nav={nav} area="Admin">
      {children}
    </DashboardShell>
  );
}
