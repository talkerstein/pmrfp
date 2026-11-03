import type { Metadata } from "next";
import { BoardBroken, BoardSheet } from "@/components/bid-compare/board";
import { lookupShared } from "@/lib/bid-compare/server";
import { buildSheet } from "@/lib/bid-compare/view";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: getDictionary(hasLocale(lang) ? lang : "en").bidCompare.board.metaTitle,
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

/**
 * /bid-sheet/s/[token] — the read-only board view a PM shares with their
 * board or owner. No account: the unguessable token (only its sha256 is
 * stored) opens this one comparison until the PM replaces or turns off the
 * link. Never indexed; no contact details, no files.
 */
export default async function SharedBoardPage({ params }: { params: Promise<{ token: string }> }) {
  await setLangFrom(params);
  const m = getT("bidCompare");
  const lang = getLang();
  const { token } = await params;
  const shared = await lookupShared(token);
  if (shared.state !== "open") return <BoardBroken m={m} />;
  const view = buildSheet({ scopeItems: shared.comparison.scope_items, bids: shared.bids, certs: shared.certs, orgs: shared.orgs, shared: true });
  return <BoardSheet company={shared.company.name} comparison={shared.comparison} view={view} country={shared.comparison.country} lang={lang} m={m} />;
}
