import type { ReactNode } from "react";
import { Users } from "lucide-react";
import Link from "@/i18n/link";
import { Block } from "./blocks";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

export interface RelatedItem {
  slug: string;
  title: string;
  deadline: string | null;
  /** First trade and place, already plain text, for the same-trade list. */
  trade?: string | null;
  place?: string | null;
}

/**
 * "More like this" (depth plan, Step 2, block 9): the buyer's other open
 * bids, the same trade nearby, and the Follow-buyer control. The free
 * one-field alert form (BidAlertBox) is rendered right after this block by
 * the page. Everything here is free.
 */
export function RelatedBlock({
  buyerName,
  moreFromBuyer,
  nearby,
  follow,
}: {
  buyerName: string | null;
  moreFromBuyer: RelatedItem[];
  nearby: RelatedItem[];
  follow: ReactNode;
}) {
  const t = getT("rfpDepth").related;
  const b = getT("rfpDepth").buyer;
  const lang = getLang();
  const when = (d: string | null) => (d ? fmt(t.closes, { date: formatDate(d, lang, { month: "short", day: "numeric" }) }) : "");
  const list = (items: RelatedItem[]) => (
    <ul className="mt-2 space-y-2 text-sm">
      {items.map((r) => (
        <li key={r.slug}>
          <Link href={`/rfps/${r.slug}`} className="font-medium hover:text-teal-700 hover:underline">{r.title}</Link>
          <span className="block text-xs text-muted-foreground">{[r.trade ? tradeName(r.trade, lang) : null, r.place ? regionName(r.place, lang) : null, when(r.deadline)].filter(Boolean).join(" · ")}</span>
        </li>
      ))}
    </ul>
  );
  if (!buyerName && !nearby.length) return null;
  return (
    <Block id="related" icon={<Users className="size-4 text-teal-700" aria-hidden />} title={t.title}>
      {buyerName && (
        <div className="mt-3" data-section="more-from-buyer">
          <h3 className="text-sm font-semibold">{fmt(t.moreFrom, { buyer: buyerName })}</h3>
          {moreFromBuyer.length ? list(moreFromBuyer) : <p className="mt-1 text-sm text-muted-foreground">{t.none}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground" data-section="follow">
            {follow}
            <span>{b.follow}</span>
          </div>
        </div>
      )}
      {nearby.length > 0 && (
        <div className="mt-4 border-t border-border pt-3" data-section="same-trade">
          <h3 className="text-sm font-semibold">{t.nearby}</h3>
          {list(nearby)}
        </div>
      )}
    </Block>
  );
}
