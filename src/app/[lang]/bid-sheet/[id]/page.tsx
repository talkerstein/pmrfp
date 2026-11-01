import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { BoardSheet } from "@/components/bid-compare/board";
import { bidderOrgs, loadComparison, trackerCerts } from "@/lib/bid-compare/server";
import { buildSheet } from "@/lib/bid-compare/view";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").bidCompare.board.metaTitle, robots: { index: false, follow: false } };
}

/**
 * /bid-sheet/[id] — the owner's board view (print / save as PDF). Members
 * of the PM company only (RLS); no dashboard chrome. The bidders' contact
 * details and files aren't on it.
 */
export default async function OwnerBoardPage({ params }: { params: Promise<{ id: string }> }) {
  await setLangFrom(params);
  const m = getT("bidCompare");
  const lang = getLang();
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const { id } = await params;
  if (isDemoMode() || !session.organization || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();
  const { comparison: c, bids } = await loadComparison(db, id);
  if (!c) notFound();
  const [certs, orgs] = await Promise.all([trackerCerts(db, c.organization_id), bidderOrgs(db, bids.map((b) => b.bidder_organization_id))]);
  const view = buildSheet({ scopeItems: c.scope_items, bids, certs, orgs, shared: true });
  return <BoardSheet company={session.organization.name} comparison={c} view={view} country={c.country} lang={lang} m={m} backHref={`/pm-dashboard/bid-comparisons/${c.id}`} />;
}
