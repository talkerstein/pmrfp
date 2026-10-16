/**
 * Award Intelligence page bodies. Pure server components (no data loading):
 * each takes an IntelView, either the full data (subscribers) or the teaser
 * (everyone else). A teaser body only ever receives the teaser object, so
 * gated numbers can't reach a non-subscriber's HTML (unit tested).
 */
import type { ReactNode } from "react";
import { localizePath, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/dictionaries";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { provinceSlug } from "@/lib/data/price-benchmarks";
import type { CountryCode } from "@/lib/visitor-geo";
import type {
  BuyerIndexRow,
  BuyerProfile,
  CompanyIndexRow,
  CompanyProfile,
  Currency,
  IntelAward,
  MarketIndexRow,
  MarketShare,
  RenewalItem,
  Tally,
  TermEstimate,
} from "@/lib/intel/model";
import { rebidMonths } from "@/lib/intel/model";
import { BLUR_ROWS, type BuyerTeaser, type CompanyTeaser, type ExampleAward, type IndexTeaser, type IntelView, type MarketTeaser, type RenewalExample, type RenewalTeaser } from "@/lib/intel/view";
import { intelDay, intelMoney, intelMonth, intelPct, intelShortMoney } from "@/lib/intel/format";

export type IntelMessages = Messages["intel"];

export interface CtaState {
  signedIn: boolean;
  hasOrg: boolean;
  intel: boolean;
  country: CountryCode;
  monthly: { price: string; payable: boolean };
  annual: { price: string; payable: boolean };
  launch: boolean;
  /** Path (unlocalized) to come back to after signing up. */
  next: string;
}

export interface IntelCtx {
  lang: Locale;
  t: IntelMessages;
  cta: CtaState;
}

const n = (x: number, lang: Locale) => formatNumber(x, lang);

/* ------------------------------------------------------------------ pieces */

export function H2({ no, id, children }: { no?: number; id?: string; children: ReactNode }) {
  return (
    <h2 className="s-h2" id={id}>
      {no != null && <span className="no">{String(no).padStart(2, "0")}</span>}
      <span>{children}</span>
    </h2>
  );
}

export type IntelSection = "home" | "companies" | "buyers" | "renewals" | "markets";

export function IntelNav({ ctx, current }: { ctx: IntelCtx; current: IntelSection }) {
  const L = (p: string) => localizePath(p, ctx.lang);
  const items: [IntelSection, string][] = [
    ["home", "/intel"],
    ["companies", "/intel/companies"],
    ["buyers", "/intel/buyers"],
    ["renewals", "/intel/renewals"],
    ["markets", "/intel/markets"],
  ];
  return (
    <nav className="in-nav" aria-label={ctx.t.crumb}>
      {items.map(([k, href]) => (
        <a key={k} href={L(href)} aria-current={k === current ? "page" : undefined}>
          {ctx.t.nav[k]}
        </a>
      ))}
    </nav>
  );
}

export function Facts({ items }: { items: { k: string; v: string; s?: string }[] }) {
  return (
    <div className="in-facts">
      {items.map((f) => (
        <div key={f.k}>
          <div className="k">{f.k}</div>
          <div className="v">{f.v}</div>
          {f.s && <div className="s">{f.s}</div>}
        </div>
      ))}
    </div>
  );
}

/** Subscribe / sign up / ask: what the viewer can do next. */
export function IntelCta({ ctx }: { ctx: IntelCtx }) {
  const { t, lang, cta } = ctx;
  const L = (p: string) => localizePath(p, lang);
  if (cta.intel) {
    return (
      <div className="in-cta">
        <span className="in-note">{t.cta.youHave}</span>
        {cta.signedIn && (
          <form method="post" action="/api/stripe/intel-portal">
            <input type="hidden" name="lang" value={lang} />
            <button type="submit" className="btn ink">{t.cta.manage}</button>
          </form>
        )}
      </div>
    );
  }
  if (!cta.signedIn) {
    return (
      <div className="in-cta">
        <a className="btn mint lg" href={L(`/sign-up?role=trade&next=${encodeURIComponent(cta.next)}`)}>{t.cta.signUp}</a>
        <a href={L(`/sign-in?next=${encodeURIComponent(cta.next)}`)}>{t.cta.signIn}</a>
        <span className="in-note">{fmt(t.cta.monthly, { price: cta.monthly.price })} · {fmt(t.cta.annual, { price: cta.annual.price })}</span>
      </div>
    );
  }
  if (!cta.hasOrg) {
    return (
      <div className="in-cta">
        <span className="in-note">{t.cta.noOrg}</span>
        <a className="btn mint" href={L("/onboarding")}>{t.cta.finishProfile}</a>
      </div>
    );
  }
  const plans = (["monthly", "annual"] as const).filter((iv) => cta[iv].payable);
  if (!plans.length) {
    return (
      <div className="in-cta">
        <span className="in-note">{t.cta.ask}</span>
        <a className="btn mint" href={L("/contact?topic=award-intelligence")}>{t.cta.askLink}</a>
      </div>
    );
  }
  return (
    <div className="in-cta">
      {plans.map((iv) => (
        <form key={iv} method="post" action="/api/stripe/intel-checkout">
          <input type="hidden" name="interval" value={iv} />
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="next" value={cta.next} />
          <button type="submit" className={iv === "monthly" ? "btn mint" : "btn navy"}>
            {fmt(iv === "monthly" ? t.cta.payMonthly : t.cta.payAnnual, { price: cta[iv].price })}
          </button>
        </form>
      ))}
      {plans.includes("annual") && <span className="in-note">{t.cta.saving}</span>}
    </div>
  );
}

function NoticeCell({ a, t }: { a: { noticeUrl: string | null; noticeExact: boolean }; t: IntelMessages }) {
  return a.noticeUrl ? (
    <a className="ext" href={a.noticeUrl} target="_blank" rel="noopener noreferrer">{a.noticeExact ? t.official : t.portal}</a>
  ) : (
    <>—</>
  );
}

function place(a: { city: string | null; province: string | null }, lang: Locale) {
  return [a.city ? regionName(a.city, lang) : null, a.province ? regionName(a.province, lang) : null].filter(Boolean).join(", ");
}

function AwardHead({ t }: { t: IntelMessages }) {
  return (
    <thead>
      <tr>
        <th scope="col">{t.col.contract}</th>
        <th scope="col">{t.col.winner}</th>
        <th scope="col" className="r">{t.col.value}</th>
        <th scope="col">{t.col.date}</th>
        <th scope="col">{t.col.notice}</th>
      </tr>
    </thead>
  );
}

function AwardRow({ a, ctx }: { a: IntelAward | ExampleAward; ctx: IntelCtx }) {
  const { t, lang } = ctx;
  const L = (p: string) => localizePath(p, lang);
  return (
    <tr>
      <td>
        <a href={L(`/rfps/${a.slug}`)}>{a.title}</a>
        <span className="sub">{[a.buyer, place(a, lang)].filter(Boolean).join(" · ")}</span>
      </td>
      <td className="nm">{a.winner ? (a.winnerSlug ? <a href={L(`/intel/companies/${a.winnerSlug}`)}>{a.winner}</a> : a.winner) : <span className="bm-muted">{t.individual}</span>}</td>
      <td className="r">{a.amount !== null ? intelMoney(a.amount, a.currency, lang) : <span className="bm-muted">{t.notDisclosed}</span>}</td>
      <td className="nw">{intelDay(a.date, lang)}</td>
      <td><NoticeCell a={a} t={t} /></td>
    </tr>
  );
}

function AwardTable({ awards, ctx, list }: { awards: readonly IntelAward[]; ctx: IntelCtx; list: string }) {
  return (
    <div className="s-dtw">
      <table className="s-dt bm-wide" data-list={list}>
        <AwardHead t={ctx.t} />
        <tbody>{awards.map((a) => <AwardRow key={a.slug} a={a} ctx={ctx} />)}</tbody>
      </table>
    </div>
  );
}

function TallyTable({ rows, ctx, label, currency, href, list, translate }: {
  rows: readonly Tally[];
  ctx: IntelCtx;
  label: string;
  currency: Currency;
  href?: (r: Tally) => string | null;
  list: string;
  translate?: (name: string) => string;
}) {
  const { t, lang } = ctx;
  const L = (p: string) => localizePath(p, lang);
  return (
    <div className="s-dtw">
      <table className="s-dt" data-list={list}>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col" className="r">{t.col.awards}</th>
            <th scope="col" className="r">{t.col.total}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const link = href?.(r);
            const name = translate ? translate(r.name) : r.name;
            return (
              <tr key={r.key}>
                <td className="nm">{link ? <a href={L(link)}>{name}</a> : name}</td>
                <td className="r">{n(r.awards, lang)}</td>
                <td className="r">{r.valued ? intelMoney(r.value, currency, lang) : <span className="bm-muted">{t.notDisclosed}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The teaser block: counts, ONE example row and a blurred placeholder table
 * (empty shapes, no data), then the call to action.
 */
export function IntelTeaser({ ctx, total, counts, head, example }: {
  ctx: IntelCtx;
  total: number;
  counts: { k: string; v: number }[];
  head: string[];
  example: ReactNode | null;
}) {
  const { t, lang } = ctx;
  const hidden = Math.max(0, total - (example ? 1 : 0));
  return (
    <div className="in-lock" data-locked="intel">
      <div className="hd">{t.teaser.title}</div>
      <p>{plural(total, t.teaser.body, { n: n(total, lang) })} {t.teaser.bodyMore}</p>
      {counts.length > 0 && <Facts items={counts.map((c) => ({ k: c.k, v: n(c.v, lang) }))} />}
      {(example || hidden > 0) && (
        <>
          {example && <div className="ex">{t.teaser.example}</div>}
          <div className="s-dtw">
            <table className="s-dt bm-wide" data-list="teaser">
              <thead>
                <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
              </thead>
              <tbody>
                {example}
                {Array.from({ length: Math.min(hidden, BLUR_ROWS) }, (_, i) => (
                  <tr key={i} className="in-blur" aria-hidden>
                    {head.map((h) => <td key={h}><span /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <IntelCta ctx={ctx} />
    </div>
  );
}

const awardHeadLabels = (t: IntelMessages) => [t.col.contract, t.col.winner, t.col.value, t.col.date, t.col.notice];

/* ------------------------------------------------------------------ company */

const trendText = (p: CompanyProfile, ctx: IntelCtx) => {
  const { t, lang } = ctx;
  const d = p.trend.direction;
  if (d === "short-history") return fmt(t.trend.short, { date: p.historyFrom ? intelDay(p.historyFrom, lang) : "—" });
  if (d === "up" || d === "down") return fmt(t.trend[d], { pct: intelPct(p.trend.changePct ?? 0, lang) });
  return t.trend[d];
};

export function CompanyBody({ view, ctx, csvHref }: { view: IntelView<CompanyProfile, CompanyTeaser>; ctx: IntelCtx; csvHref: string }) {
  const { t, lang } = ctx;
  const L = (p: string) => localizePath(p, lang);
  const other: CountryCode = view.data.country === "US" ? "CA" : "US";
  const otherLink = view.data.otherCountryAwards > 0 && (
    <p className="small">
      {plural(view.data.otherCountryAwards, t.otherCountry, { n: n(view.data.otherCountryAwards, lang), country: t.country[other] })}{" "}
      <a href={L(`/intel/companies/${view.data.slug}?country=${other.toLowerCase()}`)}>{fmt(t.otherCountryLink, { country: t.country[other] })} →</a>
    </p>
  );

  if (!view.intel) {
    const d = view.data;
    return (
      <>
        <IntelTeaser
          ctx={ctx}
          total={d.awards}
          counts={[
            { k: t.company.fact.awards, v: d.awards },
            { k: t.company.fact.buyers, v: d.buyers },
            { k: t.company.sec.trades, v: d.trades },
          ]}
          head={awardHeadLabels(t)}
          example={d.example ? <AwardRow a={d.example} ctx={ctx} /> : null}
        />
        {otherLink}
        {d.publicPage && <div className="s-links"><a href={L(`/contract-winners/${d.slug}`)}>{t.publicPage} →</a></div>}
      </>
    );
  }

  const p = view.data;
  const money = (x: number) => intelMoney(x, p.currency, lang);
  let no = 0;
  if (!p.stats.awards) return <>{otherLink}<div className="s-callout"><p>{fmt(t.noIndex, { country: t.country[p.country] })}</p></div></>;
  return (
    <>
      <Facts
        items={[
          { k: t.company.fact.awards, v: n(p.stats.awards, lang), s: p.firstDate && p.lastDate ? `${intelMonth(p.firstDate, lang)} – ${intelMonth(p.lastDate, lang)}` : undefined },
          { k: t.company.fact.total, v: p.stats.valued ? intelShortMoney(p.stats.total, p.currency, lang) : t.company.noValue, s: p.stats.valued !== p.stats.awards ? `${n(p.stats.valued, lang)} ${t.col.valued.toLowerCase()}` : undefined },
          { k: t.company.fact.average, v: p.stats.average !== null ? intelShortMoney(p.stats.average, p.currency, lang) : "—", s: p.stats.median !== null ? `${t.col.median}: ${intelShortMoney(p.stats.median, p.currency, lang)}` : undefined },
          { k: t.company.fact.buyers, v: n(p.buyers.length, lang) },
        ]}
      />
      {otherLink}

      <H2 no={++no} id="trend">{t.company.sec.trend}</H2>
      <p data-trend={p.trend.direction}>{trendText(p, ctx)}</p>
      <div className="s-dtw">
        <table className="s-dt" data-list="trend">
          <thead><tr><th scope="col" /><th scope="col" className="r">{t.col.awards}</th><th scope="col" className="r">{t.col.total}</th></tr></thead>
          <tbody>
            <tr><td className="nm">{t.company.last12}</td><td className="r">{n(p.trend.last12.awards, lang)}</td><td className="r">{money(p.trend.last12.value)}</td></tr>
            <tr><td className="nm">{t.company.prev12}</td><td className="r">{n(p.trend.prev12.awards, lang)}</td><td className="r">{money(p.trend.prev12.value)}</td></tr>
          </tbody>
        </table>
      </div>

      <H2 no={++no} id="years">{t.company.sec.years}</H2>
      <TallyTable list="years" ctx={ctx} label={t.col.year} currency={p.currency} rows={p.byYear.map((y) => ({ key: y.year, name: y.year, slug: null, awards: y.awards, valued: y.valued, value: y.value }))} />

      <H2 no={++no} id="buyers">{t.company.sec.buyers}</H2>
      <TallyTable list="buyers" ctx={ctx} label={t.col.buyer} currency={p.currency} rows={p.buyers} href={(r) => (r.slug ? `/intel/buyers/${r.slug}` : null)} />

      <H2 no={++no} id="trades">{t.company.sec.trades}</H2>
      <TallyTable list="trades" ctx={ctx} label={t.col.trade} currency={p.currency} rows={p.trades} translate={(x) => tradeName(x, lang)} />

      {(p.provinces.length > 0 || p.cities.length > 0) && (
        <>
          <H2 no={++no} id="places">{t.company.sec.places}</H2>
          <TallyTable list="places" ctx={ctx} label={t.col.place} currency={p.currency} rows={[...p.provinces, ...p.cities]} translate={(x) => regionName(x, lang)} />
        </>
      )}

      <H2 no={++no} id="awards">{t.company.sec.awards}</H2>
      <AwardTable awards={p.awards} ctx={ctx} list="awards" />
      <p className="small"><a href={csvHref} download>{t.csv} ↓</a></p>
      {p.historyFrom && <p className="small muted">{fmt(t.history, { country: t.country[p.country], date: intelDay(p.historyFrom, lang) })}</p>}
      {p.publicPage && <div className="s-links"><a href={L(`/contract-winners/${p.slug}`)}>{t.publicPage} →</a></div>}
    </>
  );
}

/* ------------------------------------------------------------------ buyer */

export function BuyerBody({ view, ctx, csvHref }: { view: IntelView<BuyerProfile, BuyerTeaser>; ctx: IntelCtx; csvHref: string }) {
  const { t, lang } = ctx;
  if (!view.intel) {
    const d = view.data;
    return (
      <IntelTeaser
        ctx={ctx}
        total={d.awards}
        counts={[
          { k: t.buyer.fact.awards, v: d.awards },
          { k: t.buyer.fact.suppliers, v: d.suppliers },
          { k: t.col.trade, v: d.trades },
        ]}
        head={awardHeadLabels(t)}
        example={d.example ? <AwardRow a={d.example} ctx={ctx} /> : null}
      />
    );
  }
  const p = view.data;
  const money = (x: number) => intelMoney(x, p.currency, lang);
  let no = 0;
  return (
    <>
      <Facts
        items={[
          { k: t.buyer.fact.awards, v: n(p.stats.awards, lang), s: p.firstDate && p.lastDate ? `${intelMonth(p.firstDate, lang)} – ${intelMonth(p.lastDate, lang)}` : undefined },
          { k: t.buyer.fact.spend, v: p.stats.valued ? intelShortMoney(p.stats.total, p.currency, lang) : "—", s: p.stats.valued !== p.stats.awards ? `${n(p.stats.valued, lang)} ${t.col.valued.toLowerCase()}` : undefined },
          { k: t.buyer.fact.median, v: p.stats.median !== null ? intelShortMoney(p.stats.median, p.currency, lang) : "—" },
          { k: t.buyer.fact.suppliers, v: n(p.suppliers.length + p.individuals, lang) },
        ]}
      />

      <H2 no={++no} id="trade-year">{t.buyer.sec.tradeYear}</H2>
      <div className="s-dtw">
        <table className="s-dt" data-list="trade-year">
          <thead>
            <tr>
              <th scope="col">{t.col.trade}</th>
              {p.years.map((y) => <th key={y} scope="col" className="r">{y}</th>)}
              <th scope="col" className="r">{t.col.total}</th>
            </tr>
          </thead>
          <tbody>
            {p.tradeYear.map((r) => (
              <tr key={r.tradeSlug}>
                <td className="nm">{tradeName(r.trade, lang)}</td>
                {p.years.map((y) => {
                  const c = r.years[y];
                  return <td key={y} className="r">{c ? (c.value ? intelShortMoney(c.value, p.currency, lang) : `${n(c.awards, lang)} ×`) : "—"}</td>;
                })}
                <td className="r">{r.value ? money(r.value) : `${n(r.awards, lang)} ×`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 no={++no} id="years">{t.buyer.sec.years}</H2>
      <TallyTable list="years" ctx={ctx} label={t.col.year} currency={p.currency} rows={p.byYear.map((y) => ({ key: y.year, name: y.year, slug: null, awards: y.awards, valued: y.valued, value: y.value }))} />

      <H2 no={++no} id="incumbents">{t.buyer.sec.incumbents}</H2>
      {p.incumbents.length ? (
        <TallyTable list="incumbents" ctx={ctx} label={t.col.company} currency={p.currency} rows={p.incumbents} href={(r) => (r.slug ? `/intel/companies/${r.slug}` : null)} />
      ) : (
        <div className="s-callout"><p>{t.buyer.noIncumbents}</p></div>
      )}

      <H2 no={++no} id="suppliers">{t.buyer.sec.suppliers}</H2>
      <TallyTable list="suppliers" ctx={ctx} label={t.col.company} currency={p.currency} rows={p.suppliers} href={(r) => (r.slug ? `/intel/companies/${r.slug}` : null)} />
      {p.individuals > 0 && <p className="small muted">{plural(p.individuals, t.buyer.individuals, { n: n(p.individuals, lang) })}</p>}

      <H2 no={++no} id="awards">{t.buyer.sec.awards}</H2>
      <AwardTable awards={p.awards} ctx={ctx} list="awards" />
      <p className="small"><a href={csvHref} download>{t.csv} ↓</a></p>
      {p.historyFrom && <p className="small muted">{fmt(t.history, { country: t.country[p.country], date: intelDay(p.historyFrom, lang) })}</p>}
    </>
  );
}

/* ------------------------------------------------------------------ renewals */

export function termLabel(term: TermEstimate, t: IntelMessages): string {
  const how = t.renewals.how;
  const base =
    term.source === "stated-years"
      ? fmt(how["stated-years"], { from: term.startYear ?? "", to: term.endYear ?? "" })
      : term.source === "stated-seasons"
        ? fmt(how["stated-seasons"], { n: term.seasons ?? "" })
        : term.source === "stated-duration"
          ? fmt(how["stated-duration"], { months: term.months })
          : how.typical;
  const years = term.optionMonths ? Math.round(term.optionMonths / 12) : 0;
  return years ? base + plural(years, t.renewals.options, { n: years }) : base;
}

const renewalHead = (t: IntelMessages) => [t.col.window, t.col.status, t.col.how, t.col.trade, t.col.contract, t.col.holder, t.col.value, t.col.notice];

function RenewalRow({ r, ctx }: { r: RenewalItem | RenewalExample; ctx: IntelCtx }) {
  const { t, lang } = ctx;
  const L = (p: string) => localizePath(p, lang);
  const a = r.award;
  return (
    <tr>
      <td className="nw">{intelMonth(r.windowStart, lang)} – {intelMonth(r.windowEnd, lang)}</td>
      <td><span className={`in-tag ${r.status === "due" ? "due" : r.status === "past" ? "past" : ""}`}>{t.renewals.status[r.status]}</span></td>
      <td className="small">{termLabel(r.term, t)}</td>
      <td>{tradeName(r.trade, lang)}</td>
      <td>
        <a href={L(`/rfps/${a.slug}`)}>{a.title}</a>
        <span className="sub">{[a.buyer, place(a, lang), intelDay(a.date, lang)].filter(Boolean).join(" · ")}</span>
      </td>
      <td className="nm">{a.winner ? (a.winnerSlug ? <a href={L(`/intel/companies/${a.winnerSlug}`)}>{a.winner}</a> : a.winner) : <span className="bm-muted">{t.individual}</span>}</td>
      <td className="r">{a.amount !== null ? intelMoney(a.amount, a.currency, lang) : <span className="bm-muted">{t.notDisclosed}</span>}</td>
      <td><NoticeCell a={a} t={t} /></td>
    </tr>
  );
}

export function RenewalsBody({ view, ctx, csvHref }: { view: IntelView<RenewalItem[], RenewalTeaser>; ctx: IntelCtx; csvHref: string }) {
  const { t, lang } = ctx;
  const method = (
    <>
      <h3 className="s-h2 sm">{t.renewals.methodTitle}</h3>
      <div className="s-callout">{t.renewals.method.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}</div>
    </>
  );
  if (!view.intel) {
    const d = view.data;
    return (
      <>
        <IntelTeaser
          ctx={ctx}
          total={d.items}
          counts={d.byTrade.slice(0, 4).map((x) => ({ k: tradeName(x.trade, lang), v: x.items }))}
          head={renewalHead(t)}
          example={d.example ? <RenewalRow r={d.example} ctx={ctx} /> : null}
        />
        {method}
      </>
    );
  }
  const items = view.data;
  return (
    <>
      <p data-count={items.length}>{plural(items.length, t.renewals.count, { n: n(items.length, lang) })}</p>
      {items.length > 0 && (
        <p className="small" data-list="rebid-months">
          {t.renewals.rebidMonths}:{" "}
          {rebidMonths(items)
            .map((m) => `${formatDate(`2026-${String(m.month).padStart(2, "0")}-15T12:00:00Z`, lang, { month: "short" })} (${n(m.items, lang)})`)
            .join(" · ")}
        </p>
      )}
      {items.length ? (
        <div className="s-dtw">
          <table className="s-dt bm-wide" data-list="renewals">
            <thead><tr>{renewalHead(t).map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{items.map((r) => <RenewalRow key={r.award.slug} r={r} ctx={ctx} />)}</tbody>
          </table>
        </div>
      ) : (
        <div className="s-callout"><p>{t.renewals.none}</p></div>
      )}
      {items.length > 0 && <p className="small"><a href={csvHref} download>{t.csv} ↓</a></p>}
      {method}
    </>
  );
}

/* ------------------------------------------------------------------ market share */

export function MarketBody({ view, ctx, csvHref }: { view: IntelView<MarketShare, MarketTeaser>; ctx: IntelCtx; csvHref: string }) {
  const { t, lang } = ctx;
  const L = (p: string) => localizePath(p, lang);
  if (!view.intel) {
    const d = view.data;
    return (
      <IntelTeaser
        ctx={ctx}
        total={d.winners}
        counts={[
          { k: t.market.fact.awards, v: d.awards },
          { k: t.market.fact.companies, v: d.winners },
        ]}
        head={awardHeadLabels(t)}
        example={d.example ? <AwardRow a={d.example} ctx={ctx} /> : null}
      />
    );
  }
  const m = view.data;
  const money = (x: number) => intelMoney(x, m.currency, lang);
  let no = 0;
  const winnerTable = (rows: MarketShare["winners"], list: string) => (
    <div className="s-dtw">
      <table className="s-dt" data-list={list}>
        <thead>
          <tr>
            <th scope="col">{t.col.rank}</th>
            <th scope="col">{t.col.company}</th>
            <th scope="col" className="r">{t.col.awards}</th>
            <th scope="col" className="r">{t.col.share}</th>
            <th scope="col" className="r">{t.col.total}</th>
            <th scope="col" className="r">{t.col.shareValue}</th>
            <th scope="col">{t.col.firstAward}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => (
            <tr key={w.key}>
              <td>{i + 1}</td>
              <td className="nm">{w.slug ? <a href={L(`/intel/companies/${w.slug}`)}>{w.name}</a> : w.name}</td>
              <td className="r">{n(w.awards, lang)}</td>
              <td className="r">{intelPct(w.shareCount, lang)}</td>
              <td className="r">{w.valued ? money(w.value) : <span className="bm-muted">{t.notDisclosed}</span>}</td>
              <td className="r">{w.shareValue !== null && w.valued ? intelPct(w.shareValue, lang) : "—"}</td>
              <td className="nw">{w.firstDate ? intelDay(w.firstDate, lang) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <Facts
        items={[
          { k: t.market.fact.awards, v: n(m.stats.awards, lang), s: m.from && m.to ? `${intelMonth(m.from, lang)} – ${intelMonth(m.to, lang)}` : undefined },
          { k: t.market.fact.companies, v: n(m.winners.length, lang) },
          { k: t.market.fact.top3, v: intelPct(m.top3ShareValue ?? m.top3ShareCount, lang), s: m.top3ShareValue !== null ? t.col.shareValue : t.col.share },
          { k: t.market.fact.concentration, v: t.market.concentration[m.concentration] },
        ]}
      />
      <div className="s-summary">
        <p>{m.top3ShareValue !== null ? fmt(t.market.top3, { count: intelPct(m.top3ShareCount, lang), value: intelPct(m.top3ShareValue, lang) }) : fmt(t.market.top3Count, { count: intelPct(m.top3ShareCount, lang) })}</p>
        {m.hhi !== null && m.concentration !== "thin" && <p>{fmt(t.market.hhi, { hhi: n(m.hhi, lang), basis: t.market.basis[m.hhiBasis] })}</p>}
      </div>

      <H2 no={++no} id="winners">{t.market.sec.winners}</H2>
      {winnerTable(m.winners, "winners")}
      {m.individuals > 0 && <p className="small muted">{plural(m.individuals, t.market.individuals, { n: n(m.individuals, lang) })}</p>}
      <p className="small"><a href={csvHref} download>{t.csv} ↓</a></p>

      <H2 no={++no} id="entrants">{fmt(t.market.sec.entrants, { year: m.year })}</H2>
      {m.newEntrants.length ? winnerTable(m.newEntrants, "entrants") : <div className="s-callout"><p>{fmt(t.market.noEntrants, { year: m.year })}</p></div>}
      {m.shortHistory && m.historyFrom && <p className="small muted">{fmt(t.market.shortHistory, { date: intelDay(m.historyFrom, lang) })}</p>}
    </>
  );
}

/* ------------------------------------------------------------------ indexes */

export type IndexKind = "companies" | "buyers" | "markets";

export function IndexBody({ kind, view, ctx, csvHref, currency }: {
  kind: IndexKind;
  view: IntelView<(CompanyIndexRow | BuyerIndexRow | MarketIndexRow)[], IndexTeaser>;
  ctx: IntelCtx;
  csvHref: string;
  currency: Currency;
}) {
  const { t, lang } = ctx;
  const L = (p: string) => localizePath(p, lang);
  const head =
    kind === "companies"
      ? [t.col.company, t.col.awards, t.col.total, t.col.buyers, t.col.latest]
      : kind === "buyers"
        ? [t.col.buyer, t.col.awards, t.col.spend, t.col.suppliers, t.col.latest]
        : [t.col.trade, t.col.province, t.col.awards, t.col.companies];
  if (!view.intel) {
    const d = view.data;
    return (
      <IntelTeaser
        ctx={ctx}
        total={d.total}
        counts={[]}
        head={head}
        example={d.example ? (
          <tr>
            <td className="nm">{d.example.name}</td>
            <td className="r">{n(d.example.awards, lang)}</td>
            {head.slice(2).map((h) => <td key={h} className="bm-muted">—</td>)}
          </tr>
        ) : null}
      />
    );
  }
  const rows = view.data;
  if (!rows.length) return <div className="s-callout"><p>{fmt(t.empty, { country: t.country[ctx.cta.country] })}</p></div>;
  return (
    <>
      <div className="s-dtw">
        <table className="s-dt" data-list={kind}>
          <thead>
            <tr>{head.map((h, i) => <th key={h} scope="col" className={(kind === "markets" ? i >= 2 : i >= 1 && i <= 3) ? "r" : undefined}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {kind === "markets"
              ? (rows as MarketIndexRow[]).map((r) => (
                  <tr key={`${r.tradeSlug}|${r.province}`}>
                    <td className="nm"><a href={L(`/intel/markets/${r.tradeSlug}/${provinceSlug(r.province)}`)}>{tradeName(r.trade, lang)}</a></td>
                    <td>{regionName(r.province, lang)}</td>
                    <td className="r">{n(r.awards, lang)}</td>
                    <td className="r">{n(r.winners, lang)}</td>
                  </tr>
                ))
              : (rows as (CompanyIndexRow | BuyerIndexRow)[]).map((r) => (
                  <tr key={r.key}>
                    <td className="nm"><a href={L(`/intel/${kind}/${r.slug}`)}>{r.name}</a></td>
                    <td className="r">{n(r.awards, lang)}</td>
                    <td className="r">{r.valued ? intelShortMoney(r.value, currency, lang) : <span className="bm-muted">{t.notDisclosed}</span>}</td>
                    <td className="r">{n("buyers" in r ? r.buyers : r.suppliers, lang)}</td>
                    <td className="nw">{r.lastDate ? intelDay(r.lastDate, lang) : "—"}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <p className="small"><a href={csvHref} download>{t.csv} ↓</a></p>
    </>
  );
}
