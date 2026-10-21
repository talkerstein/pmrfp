import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { ByMarket } from "@/components/geo/by-market";
import { PricingPlans } from "@/components/v3-pages/pricing-plans";
import { FaqTabs } from "@/components/v3-pages/faq-tabs";
import { PriceLine } from "@/components/v3-pages/price";
import { boardStatsByCountry, countPostedLastNDays, countWinnersLastNDays } from "@/lib/data/site-counters";
import { getCategories } from "@/lib/data/taxonomy";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { daysUntil, isPastContract } from "@/lib/data/fomo";
import { rfpMarket } from "@/lib/visitor-geo";
import { publicTenderSource } from "@/lib/tenders/sources";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { FOUNDING, FOUNDING_LOW_SPOTS, FOUNDING_PATH, foundingScarcity, spotsLeft } from "@/lib/founding/config";
import { cachedLifetimeCount } from "@/lib/founding/server";
import { PRICING, SITE } from "@/lib/site";
import type { RfpListItem } from "@/lib/data/types";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { getMajorProjects } from "@/lib/major-projects/data";
import { AWARD_DAYS, isLiveLeadProject } from "@/lib/leads/match";
import { torontoToday } from "@/lib/data/monthly-winners-load";
import { startTrialAction } from "@/lib/entitlement/actions";
import { trialsOpen } from "@/lib/entitlement/server";
import { ServerMarketProvider } from "@/components/geo/server-market";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { getUsdPerCad } from "@/lib/fx";
import { MATRIX_GROUPS, PLAN_MATRIX, SOLD_TIERS, countCell } from "@/lib/pricing/plan-matrix";

// Dynamic: the visitor's country is read from the request (getVisitorCountry,
// same as /advertise and /rfps), so prices render in the server HTML in ONE
// currency, CAD in Canada and USD in the U.S. The board snapshot, Founding
// count and FX rate underneath are cached by their own loaders.

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).sales.pricing.meta;
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/pricing"),
  };
}

/** Three real open tenders from the busiest trade in one country, for the email preview. */
function previewItems(rfps: RfpListItem[], country: "CA" | "US"): { items: RfpListItem[]; trade: string } | null {
  const openCa = rfps.filter(
    (r) => r.status === "open" && !isPastContract(r) && rfpMarket(r) === country && (daysUntil(r.deadline) ?? 99) >= 3,
  );
  // English notices first: a French SEAO sample is the wrong first impression
  // for most buyers of this page. Fall back to everything if that's all there is.
  const english = openCa.filter((r) => r.sourceType !== "public_source" || publicTenderSource(r.slug).key !== "seao");
  const open = english.length >= 3 ? english : openCa;
  const counts = new Map<string, number>();
  for (const r of open) for (const c of r.categories.slice(0, 1)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const trade = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!trade) return null;
  const items = open
    .filter((r) => r.categories[0] === trade)
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
    .slice(0, 3);
  return items.length ? { items, trade } : null;
}

type Cell = 0 | 1 | string;
const Mark = ({ c, pro }: { c: Cell; pro?: boolean }) =>
  typeof c === "string" ? <>{c}</> : c ? (
    <span className={`ck${pro ? " pro" : ""}`}><svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke={pro ? "#91F2CF" : "#FFFFFF"} strokeWidth="2.5" aria-hidden><path d="M2.5 7.5l3 3 6-6.5" /></svg></span>
  ) : (
    <span className="ds" aria-hidden />
  );

export default async function PricingPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  const sales = getT("sales");
  const founding = getT("founding");
  const v = getT("v3Pages").pricing;
  const tl = getT("leads").pricing;
  const [visitor, fx, trialOpen] = await Promise.all([
    getVisitorCountry(),
    getUsdPerCad(),
    // No trade_trials table / service key yet: the page still renders, with Join free as the main button.
    trialsOpen().catch(() => false),
  ]);
  const serverMarket = { market: visitor.country, usdPerCad: fx.usdPerCad };
  const [rfps, categories, sold, projects] = await Promise.all([
    listAllRfpsCached().catch(() => [] as RfpListItem[]),
    getCategories().catch(() => []),
    cachedLifetimeCount().catch(() => null),
    // Shared cached snapshot; [] until the major-projects tables exist.
    getMajorProjects().catch(() => []),
  ]);
  // Lead counts from the data, per country (projects and permits are Canada only).
  const today = torontoToday();
  const liveProjects = projects.filter((p) => isLiveLeadProject(p, today)).length;
  // Site-wide counter rules (lib/data/site-counters), all from the board snapshot.
  const winners = { CA: countWinnersLastNDays(rfps, "CA", AWARD_DAYS, today), US: countWinnersLastNDays(rfps, "US", AWARD_DAYS, today) };
  // Country-first: the page is cached, so each country's numbers and preview
  // ship and the visitor's shows (ByMarket). Never the two added together.
  const boards = boardStatsByCountry(rfps);
  const previews = { CA: previewItems(rfps, "CA"), US: previewItems(rfps, "US") };
  const posted = { CA: countPostedLastNDays(rfps, "CA", 30), US: countPostedLastNDays(rfps, "US", 30) };
  const byMarket = (f: (c: "CA" | "US") => ReactNode) => <ByMarket ca={f("CA")} us={f("US")} />;
  const mailPreview = (preview: NonNullable<(typeof previews)["CA"]>) => (
        <section className="v3-wrap vp-mail">
          <div className="vp-mail-l">
            <div className="v3-eyebrow">{v.mail.eyebrow}</div>
            <h2 className="vp-h2">{sales.pricing.preview.title}</h2>
            <p className="vp-lead dark">{sales.pricing.preview.description}</p>
            <div className="ctas">
              <a href={proHref} className="v3-pill navy">{v.mail.cta}</a>
              <span><PriceLine tpl={proMonthly ? v.lineAnnualFirst : v.lineAnnual} cad={{ monthly: PRICING.proMonthly, annual: PRICING.proAnnual }} lang={lang} /></span>
            </div>
          </div>
          <div className="vp-mail-r">
            <div className="dot" aria-hidden />
            <div className="box">
              <div className="hd">
                <Image src="/brand/mark-white.svg" alt="" width={28} height={28} />
                <div className="t">
                  <b>{plural(preview.items.length, sales.email.subject, { n: num(preview.items.length), trade: tradeName(preview.trade, lang), site: SITE.name })}</b>
                  <span>{v.mail.from}</span>
                </div>
                <span className="ib">{v.mail.inbox}</span>
              </div>
              <p className="intro">{sales.email.intro}</p>
              {preview.items.map((r) => (
                <a key={r.slug} href={L(`/rfps/${r.slug}`)} className="it">
                  <span className="mt">
                    <span>{tradeName(preview.trade, lang)} · {regionName(r.city ?? r.regionName ?? r.province ?? "", lang)}</span>
                    <span>{r.deadline ? fmt(sales.email.closes, { date: formatDate(r.deadline, lang) }) : sales.email.noDeadline}</span>
                  </span>
                  <span className="ti">{r.title}</span>
                </a>
              ))}
              <div className="ft"><span className="v3-pill mint">{sales.email.cta}</span></div>
            </div>
          </div>
        </section>
  );
  const scarcity = foundingScarcity(sold == null ? null : spotsLeft(sold));
  const proMonthly = Boolean(process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY);
  const proHref = L(signUpHrefForPlan("pro", "annual"));
  const fv = { months: FOUNDING.discontinueRefundMonths, days: FOUNDING.refundDays, cap: FOUNDING.cap, low: FOUNDING_LOW_SPOTS };

  // Compare table, straight from the plan matrix (lib/pricing/plan-matrix):
  // a tick only where code grants it, and every tier includes the ones before it.
  const p = v.plans.plans;
  const rows: ({ group: string } | { label: string; c: Cell[] })[] = MATRIX_GROUPS.flatMap((g) => [
    { group: v.compare.groups[g] },
    ...PLAN_MATRIX.filter((r) => r.group === g).map((r) => ({
      label: v.compare.rows[r.id],
      c: SOLD_TIERS.map((tier): Cell => countCell(r, tier, v.compare.count, num) ?? (r.value[tier] > 0 ? 1 : 0)),
    })),
  ]);

  // Trades lead with the no-card trial; if trials aren't open yet, Join free is the main button and we say why.
  const trialForm = (cls: string) => (
    <form action={startTrialAction}>
      <input type="hidden" name="source" value="pricing" />
      <input type="hidden" name="lang" value={lang} />
      <button type="submit" className={cls} data-action="start-trial">{tl.trialCta}</button>
    </form>
  );
  const joinFreeHref = L("/sign-up?role=trade");

  const faqTabs = [
    { label: v.faq.tabPlans, items: [{ q: v.faq.refund.q, a: fmt(v.faq.refund.a, fv) }, ...v.faq.plans] },
    { label: v.faq.tabFounding, items: founding.faq.map((f) => ({ q: fmt(f.q, fv), a: fmt(f.a, fv) })) },
  ];

  return (
    <ServerMarketProvider value={serverMarket}>
      <div className="v3-top">
        <section className="v3-wrap vp-phero">
          <div className="vp-phero-main">
            <div className="vp-eyebrow"><span className="v3-dot" />{v.eyebrow}</div>
            <h1 className="vp-ph1">{v.title} <span className="mint">{v.titleMint}</span></h1>
            <p className="vp-lead">{sales.pricing.lead}</p>
          </div>
          <dl className="vp-pstats">
            {posted && posted.CA + posted.US > 0 && (
              <div><dd>{byMarket((c) => num(posted[c]))}</dd><dt>{v.stats.rfps}</dt></div>
            )}
            <div><dd>{sales.stats.daily}</dd><dt>{sales.stats.dailyLabel}</dt></div>
            {categories.length > 0 && (
              <div><dd>{num(categories.length)}</dd><dt>{v.stats.trades}</dt></div>
            )}
          </dl>
        </section>
        <PricingPlans
          t={v.plans}
          lang={lang}
          proMonthly={proMonthly}
          show={[0, 1]}
          actions={
            trialOpen ? (
              <>
                {trialForm("v3-pill mint")}
                <a href={joinFreeHref} className="v3-pill ghost">{v.plans.joinFree}</a>
              </>
            ) : (
              <a href={joinFreeHref} className="v3-pill mint">{v.plans.joinFree}</a>
            )
          }
          actionsNote={trialOpen ? tl.trialNote : v.plans.trialOff}
        />
      </div>

      <section className="v3-wrap vp-leads" data-section="pricing-leads">
        <div className="vp-leads-l">
          <div className="v3-eyebrow">{tl.eyebrow}</div>
          <h2 className="vp-h2">{byMarket((c) => (c === "CA" && liveProjects > 0 ? tl.title : tl.titleUs))}</h2>
          <p className="vp-lead dark">{byMarket((c) => (c === "US" ? tl.bodyUs : liveProjects > 0 ? tl.body : tl.bodyNoProjects))}</p>
          <div className="ctas">
            {trialOpen ? trialForm("v3-pill navy vp-big") : <a href={joinFreeHref} className="v3-pill navy vp-big">{v.mint.join}</a>}
            <span className="nt">{trialOpen ? tl.trialNote : v.plans.trialOff}</span>
          </div>
        </div>
        <div className="vp-leads-r">
        <dl>
          {liveProjects > 0 && (
            <ByMarket
              ca={<div><dd>{num(liveProjects)}</dd><dt>{tl.projects}</dt></div>}
              us={<></>}
            />
          )}
          {boards.CA.open + boards.US.open > 0 && <div><dd>{byMarket((c) => num(boards[c].open))}</dd><dt>{tl.bids}</dt></div>}
          {winners.CA + winners.US > 0 && (
            <div><dd>{byMarket((c) => num(winners[c]))}</dd><dt>{tl.winners}</dt></div>
          )}
        </dl>
        {liveProjects > 0 && <p className="note">{tl.canadaNote}</p>}
        </div>
      </section>

      <section className="vp-terms">
        <div className="v3-wrap">
          <div className="vp-terms-grid">
            <div><div className="v3-label">{v.terms.cancelTitle}</div><p>{sales.plans.guarantee}</p></div>
            <div><div className="v3-label">{v.terms.mathTitle}</div><p>{sales.plans.roi}</p></div>
            <div><div className="v3-label">{v.terms.postTitle}</div><p>{v.terms.post}</p></div>
          </div>
        </div>
      </section>

      <section className="vp-found" data-section="pricing-get-found">
        <div className="v3-wrap vp-sechead">
          <div>
            <div className="v3-eyebrow">{v.found.eyebrow}</div>
            <h2 className="vp-h2">{v.found.title}</h2>
          </div>
          <p className="vp-lead dark">{v.found.body}</p>
        </div>
        <PricingPlans t={v.plans} lang={lang} proMonthly={false} show={[2]} steps={false} />
      </section>

      <section className="v3-wrap vp-compare">
        <div className="vp-sechead">
          <div>
            <div className="v3-eyebrow">{v.compare.eyebrow}</div>
            <h2 className="vp-h2">{v.compare.title1}<br />{v.compare.title2}</h2>
          </div>
          <div className="vp-legend">
            <span><span className="ck"><svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#FFFFFF" strokeWidth="2.5" aria-hidden><path d="M2.5 7.5l3 3 6-6.5" /></svg></span>{v.compare.yes}</span>
            <span><span className="dsw"><span className="ds" /></span>{v.compare.no}</span>
          </div>
        </div>
        <div className="vp-table-scroll">
          <table className="vp-table">
            <caption className="v3-sr">{v.compare.eyebrow}</caption>
            <thead>
              <tr>
                <th scope="col" className="lbl">{v.compare.included}</th>
                <th scope="col"><b>{p[0].name}</b><span>{lang === "fr" ? "0 $" : "$0"} · {v.plans.forever}</span></th>
                <th scope="col" className="pro"><b>{p[1].name}</b><span><PriceLine tpl={v.compare.perYear} cad={{ price: PRICING.proAnnual }} lang={lang} w="7em" /></span></th>
                <th scope="col"><b>{p[2].name}</b><span><PriceLine tpl={v.compare.perYear} cad={{ price: PRICING.featuredAnnual }} lang={lang} w="7em" /></span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                "group" in r ? (
                  <tr key={r.group} className="grp"><th scope="colgroup" colSpan={4}>{r.group}</th></tr>
                ) : (
                  <tr key={r.label} className="rowhl">
                    <th scope="row">{r.label}</th>
                    {r.c.map((c, i) => (
                      <td key={i} className={i === 1 ? "pro" : undefined}>
                        <Mark c={c} pro={i === 1} />
                        {typeof c === "number" && <span className="v3-sr">{c ? v.compare.yes : v.compare.no}</span>}
                      </td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="note">{v.compare.cumulative} <PriceLine tpl={v.compare.currencyNote} cad={{}} lang={lang} w="16em" /></th>
                <td><a href={joinFreeHref}>{p[0].cta} →</a></td>
                <td className="pro"><a href={proHref} className="v3-pill ink">{p[1].cta}</a></td>
                <td><a href={L(signUpHrefForPlan("featured"))}>{p[2].cta} →</a></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="v3-wrap vp-postfree">
        <div className="vp-pf-card zoom">
          <Image src="/images/home/pm-lobby.webp" alt="" fill sizes="(max-width: 1023px) 100vw, 1136px" className="vp-img" />
          <div className="shade" />
          <div className="main">
            <div className="v3-eyebrow mint">{v.post.eyebrow}</div>
            <h2 className="vp-h2 light">{v.post.title}</h2>
            <p>{v.post.body}</p>
            <div className="ctas">
              <a href={L("/rfp-writer")} className="v3-pill mint">{v.post.cta}</a>
              <a href={L("/rfp-writer")} className="lnk">{v.post.writer}</a>
            </div>
          </div>
          <div className="side"><div className="z">{lang === "fr" ? "0 $" : "$0"}</div><div className="l">{v.post.zero}</div></div>
        </div>
      </section>

      {byMarket((c) => (previews[c] ? mailPreview(previews[c]!) : null))}

      <section className="vp-f500">
        <div className="v3-wrap vp-f500-in">
          <div className="l">
            <div className="v3-eyebrow mint">{founding.eyebrow}</div>
            <h2 className="vp-h2 light big">{v.founding.title}</h2>
            <p className="lead">{fmt(founding.lead, { cap: FOUNDING.cap })}</p>
            <div className="cmp">
              <div className="reg">
                <div className="k">{founding.compareRegular}</div>
                <div className="pv"><PriceLine tpl={v.founding.regular} cad={{ annual: PRICING.proAnnual }} lang={lang} w="7em" /></div>
                <div className="bars">{[0, 1, 2, 3, 4].map((i) => <span key={i} />)}</div>
                <div className="n">{v.founding.billedAgain}</div>
              </div>
              <div className="fnd">
                <div className="k">{founding.compareFounding}</div>
                <div className="pv"><PriceLine tpl={v.founding.once} cad={{}} lang={lang} w="7em" /></div>
                <div className="bars">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={i ? "lo" : undefined} />)}</div>
                <div className="n">{founding.compareNote}</div>
              </div>
            </div>
            <div className="inc-t">{founding.includedNote}</div>
            <div className="inc">
              {v.founding.included.map((x) => (
                <span key={x}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#91F2CF" strokeWidth="2.5" aria-hidden><path d="M2.5 7.5l3 3 6-6.5" /></svg>{x}</span>
              ))}
            </div>
            {scarcity === "soldout" ? (
              <div className="ctas">
                <div><b>{founding.soldOutTitle}</b><br />{founding.soldOutBody}</div>
              </div>
            ) : (
              <div className="ctas">
                <a href={L(FOUNDING_PATH)} className="v3-pill mint vp-big">{v.founding.cta}</a>
                <div className="nt">{v.founding.checkoutNote}</div>
              </div>
            )}
          </div>
          <div className="r">
            <div className="card">
              <div className="top">
                <div><div className="big">{num(FOUNDING.cap)}</div><div className="sub">{scarcity === "soldout" ? founding.soldOutTitle : scarcity === "low" ? fmt(founding.counter, { low: num(FOUNDING_LOW_SPOTS) }) : fmt(founding.counterUnknown, { cap: num(FOUNDING.cap) })}</div></div>
              </div>
              <div className="dots shim" aria-hidden />
              <div className="leg"><span><span className="d" />{v.founding.dots}</span></div>
              <div className="fine">{fmt(v.founding.fine, { days: FOUNDING.refundDays })}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="vp-faq">
        <FaqTabs
          tabs={faqTabs}
          head={
            <>
              <div className="v3-eyebrow">{sales.pricing.faqEyebrow}</div>
              <h2 className="vp-faq-h">{v.faq.title} <span className="hl">{v.faq.titleHl}</span></h2>
            </>
          }
          more={<div className="more">{v.faq.more} <a href={L("/contact")}>{v.faq.contact}</a></div>}
        />
      </section>

      <section className="vp-mint">
        <div className="v3-wrap vp-mint-in">
          <div className="big">{byMarket((c) => num(boards[c].open))}</div>
          <div>
            <h2 className="h">{byMarket((c) => <>{plural(boards[c].open, v.mint.open)}<br />{fmt(v.mint.closing, { n: num(boards[c].closingThisWeek) })}</>)}</h2>
            <p className="b">{v.mint.body}</p>
          </div>
          <div className="ctas">
            <a href={proHref} className="v3-pill ink">{v.mint.start}</a>
            <a href={L("/sign-up?role=trade")} className="vp-ghost ink">{v.mint.join}</a>
          </div>
        </div>
      </section>

      <section className="v3-wrap vp-disclaimer">{v.disclaimer}</section>

      <div className="v3-sticky">
        <div className="v3-sticky-in">
          <span className="v3-dot d" style={{ width: 10, height: 10 }} />
          <div className="txt">
            <b>Trade Pro: <PriceLine tpl={proMonthly ? v.lineAnnualFirst : v.lineAnnual} cad={{ monthly: PRICING.proMonthly, annual: PRICING.proAnnual }} lang={lang} /></b>{" "}
            <span className="c">{byMarket((c) => fmt(v.sticky, { n: num(boards[c].open) }))}</span>
          </div>
          <a href={joinFreeHref} className="v3-pill ghost">{v.mint.join}</a>
          {trialOpen ? trialForm("v3-pill mint") : <a href={proHref} className="v3-pill mint">{v.sticky2}</a>}
        </div>
      </div>
    </ServerMarketProvider>
  );
}
