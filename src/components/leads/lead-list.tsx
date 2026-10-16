import type { LeadView } from "@/lib/leads/view";
import type leadsMessages from "@/i18n/messages/leads";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";
import { compactDollars } from "@/lib/data/fomo";
import { safeUrl } from "@/lib/major-projects/model";

type T = (typeof leadsMessages)["en"];

const KIND_TONE: Record<LeadView["kind"], string> = {
  bid: "bg-teal-50 text-teal-800 border-teal-200",
  package: "bg-teal-50 text-teal-800 border-teal-200",
  award: "bg-amber-50 text-amber-900 border-amber-200",
  project: "bg-indigo-50 text-indigo-900 border-indigo-200",
  permit: "bg-indigo-50 text-indigo-900 border-indigo-200",
  application: "bg-slate-50 text-slate-800 border-slate-200",
};

/**
 * The lead list. Takes leads already cut for the viewer (lib/leads/view):
 * a free member's leads arrive with `pro: null`, so nothing Pro-only can
 * render. Pure (no hooks, plain links), so it is rendered in tests.
 */
export function LeadList({
  leads,
  t,
  lang,
  tradeNames,
}: {
  leads: LeadView[];
  t: T;
  lang: Locale;
  /** slug → display name for the "for your trade" chip. */
  tradeNames: ReadonlyMap<string, string>;
}) {
  if (!leads.length) return null;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card" data-section="lead-list">
      {leads.map((l) => {
        const place = [l.city, l.province].filter(Boolean).join(", ");
        const when = l.kind === "bid" || l.kind === "package"
          ? l.deadline ? fmt(t.lead.closes, { date: formatDate(l.deadline, lang) }) : t.lead.noDeadline
          : l.date ? formatDate(l.date, lang) : null;
        const trades = l.trades.map((s) => tradeName(tradeNames.get(s) ?? s, lang)).slice(0, 2).join(", ");
        const bidList = safeUrl(l.pro?.bidListUrl);
        const source = safeUrl(l.pro?.sourceUrl);
        return (
          <li key={l.key} className="p-4" data-lead-kind={l.kind}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-2 py-0.5 font-medium ${KIND_TONE[l.kind]}`}>{t.kinds[l.kind]}</span>
              <span className="text-muted-foreground">{t.areas[l.area]}{place ? ` · ${place}` : ""}</span>
              {when && <span className="text-muted-foreground">· {when}</span>}
              {l.valueCad ? <span className="font-medium text-foreground">· {compactDollars(l.valueCad, lang)}</span> : null}
            </div>
            <a href={localizePath(l.href, lang)} className="mt-1.5 block font-semibold leading-snug text-foreground hover:text-teal-700 hover:underline">
              {l.title}
            </a>
            {l.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.summary}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {trades && <span>{l.tradeMatch === "typical" ? `${t.lead.typical}: ${trades}` : trades}</span>}
              {l.pro ? (
                <>
                  {l.pro.contractor && (
                    <span className="text-foreground">
                      {l.kind === "award" ? t.lead.wonBy : t.lead.contractor}: <strong>{l.pro.contractor}</strong>
                    </span>
                  )}
                  {l.pro.buyer && (
                    <span>
                      {l.kind === "award" ? t.lead.buyer : t.lead.owner}: {l.pro.buyer}
                    </span>
                  )}
                  {bidList && (
                    <a href={bidList} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-teal-700 hover:underline">
                      {t.lead.bidList}
                    </a>
                  )}
                  {l.pro.bidRoute && <span>{t.lead.bidRoute}: {l.pro.bidRoute}</span>}
                  {source && (
                    <a href={source} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                      {t.lead.source}
                    </a>
                  )}
                </>
              ) : (
                <>
                  {l.kind === "award" && <span>{t.lead.winnerLocked}</span>}
                  {l.kind !== "award" && l.hasContractor && <span>{t.lead.gcLocked}</span>}
                  {l.kind !== "award" && l.kind !== "bid" && l.kind !== "package" && l.hasBidRoute && <span>{t.lead.routeLocked}</span>}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
