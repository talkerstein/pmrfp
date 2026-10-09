import Link from "@/i18n/link";
import { ArrowRight, Award, CalendarClock } from "lucide-react";
import type { TenderContext } from "@/lib/forum/tender-context";
import { closingState } from "@/lib/forum/tender-facts";
import { torontoToday } from "@/lib/forum/quiet";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";

/**
 * Structured facts for an automatic tender thread, straight from the real
 * listing (closing date, buyer, trade, place, source) plus similar past
 * contract awards from public award notices. Worth reading with zero replies.
 */
export function TenderCard({ ctx }: { ctx: TenderContext }) {
  const q = getT("forum").quiet.tender;
  const lang = getLang();
  const r = ctx.listing;
  const award = ctx.kind === "award";
  const close = award ? null : closingState(r.deadline, torontoToday());
  const place = [r.city, r.province].filter(Boolean).join(", ") || r.regionName;
  const status =
    !close || close.state === "unknown"
      ? null
      : close.state === "closed"
        ? q.closed
        : close.days === 0
          ? q.today
          : plural(close.days ?? 0, q.daysLeft);
  const money = (n: number) => formatNumber(n, lang, { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
  const rows: [string, string][] = [];
  if (award) {
    if (r.deadline) rows.push([q.awarded, formatDate(r.deadline, lang)]);
  } else {
    rows.push([q.closes, r.deadline ? formatDate(r.deadline, lang, { weekday: "short", month: "long", day: "numeric", year: "numeric" }) : q.noDate]);
  }
  if (ctx.buyer) rows.push([q.buyer, ctx.buyer]);
  if (r.categories.length) rows.push([q.trade, r.categories.join(", ")]);
  if (place) rows.push([q.where, place]);
  if (ctx.portal) rows.push([q.source, ctx.portal]);

  return (
    <section className="f-card" style={{ marginTop: 14 }} aria-labelledby="tender-facts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tender-facts" className="inline-flex items-center gap-2 text-base font-extrabold text-[#1B1D3A]">
          <CalendarClock className="size-4 text-teal-700" aria-hidden /> {q.title}
        </h2>
        {status && (
          <span className={close?.state === "closed" ? "rounded-full bg-[#EEEFF6] px-2.5 py-0.5 text-xs font-semibold text-[#4B4F6B]" : "rounded-full bg-[#DDFBF0] px-2.5 py-0.5 text-xs font-semibold text-teal-800"}>
            {status}
          </span>
        )}
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#4B4F6B]">{k}</dt>
            <dd className="break-words font-semibold text-[#1B1D3A]">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4">
        <Link href={`/rfps/${r.slug}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#1B1D3A] px-4 py-2 text-sm font-bold text-white hover:bg-[#282B59]">
          {q.view} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </p>

      {ctx.similar.length > 0 && (
        <div className="mt-6 border-t-2 border-[#E3E4EE] pt-4">
          <h3 className="inline-flex items-center gap-2 font-bold text-[#1B1D3A]">
            <Award className="size-4 text-amber-600" aria-hidden /> {q.similarTitle}
          </h3>
          <p className="mt-1 text-xs text-[#4B4F6B]">{fmt(q.similarLead, { trade: r.categories[0] ?? "" })}</p>
          <ul className="mt-3 divide-y divide-[#E3E4EE] text-sm">
            {ctx.similar.map((a) => (
              <li key={a.slug} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="min-w-0">
                  <Link href={`/rfps/${a.slug}`} className="font-semibold text-[#1B1D3A] hover:underline">{a.title}</Link>
                  <span className="block text-xs text-[#4B4F6B]">
                    {q.wonBy}{" "}
                    {a.winnerSlug ? (
                      <Link href={`/contract-winners/${a.winnerSlug}`} className="font-semibold text-[#282B59] hover:underline">{a.winner}</Link>
                    ) : (
                      <span className="font-semibold text-[#282B59]">{a.winner}</span>
                    )}
                    {[a.province, a.date ? formatDate(a.date, lang) : null].filter(Boolean).map((x) => ` · ${x}`).join("")}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-[#1B1D3A]">{a.amount ? money(a.amount) : <span className="text-xs text-[#4B4F6B]">{q.notDisclosed}</span>}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            <Link href="/contract-winners" className="font-bold">{q.allWinners} →</Link>
          </p>
        </div>
      )}
    </section>
  );
}
