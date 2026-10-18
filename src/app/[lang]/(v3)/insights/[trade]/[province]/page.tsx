import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { getSession } from "@/lib/access/access";
import { BidAlertBox } from "@/components/growth/bid-alert-box";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { provinceSlug } from "@/lib/data/price-benchmarks";
import { loadMarketIndex, loadMarketMonth } from "@/lib/insights/load";
import { entitlementsOf, viewFacts, type Entitlements } from "@/lib/insights/gating";
import { fmtFor, gapText, renderView, type RenderedInsight } from "@/lib/insights/copy";
import { insightsUi } from "@/lib/insights/ui-copy";
import { INSIGHTS_PATH, benchmarkPath, insightsMarketPath, intelMarketPath } from "@/lib/insights/paths";
import { getT, setLangFrom } from "@/i18n/server";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { regionName, tradeName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";

type Params = Promise<{ lang: string; trade: string; province: string }>;
type SP = Promise<Record<string, string | undefined>>;

const monthLabel = (month: string, lang: Locale) => fmtFor(lang).monthYear(`${month}-15`);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, trade, province } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  const m = await loadMarketMonth(trade, province);
  if (!m) return { robots: { index: false } };
  const t = insightsUi(l).market;
  const tr = tradeName(m.trade.name, l);
  const place = regionName(m.province, l);
  const title = t.metaTitle(tr, place, monthLabel(m.month, l));
  const description = t.metaDesc(tr, place, m.tenders.month, m.awards.month);
  return {
    title: { absolute: title },
    description,
    alternates: alternatesFor(l, insightsMarketPath(m.trade.slug, m.province)),
    openGraph: { title, description, type: "article" },
    // Indexed only with enough records behind it; thin pages still render and can be shared.
    ...(m.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

function InsightBlock({ i, L }: { i: RenderedInsight; L: (p: string) => string }) {
  return (
    <div className={`s-callout${i.locked ? " locked" : ""}`} data-insight={i.locked ? undefined : i.kind} data-insight-locked={i.locked ? i.kind : undefined}>
      <p><b>{i.title}</b></p>
      <p>{i.text}</p>
      {i.items.length > 0 && (
        <ul>
          {i.items.map((it) => (
            <li key={`${it.href}${it.label}`}>
              {it.href ? <a href={L(it.href)}>{it.label}</a> : it.label}
              {it.meta ? ` · ${it.meta}` : ""}
            </li>
          ))}
        </ul>
      )}
      {(i.basis || i.links.length > 0) && (
        <p className="small muted">
          {i.basis}
          {i.links.map((l, k) => (
            <span key={l.href}>
              {i.basis || k > 0 ? " · " : ""}
              <a href={L(l.href)}>{l.label} →</a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export default async function InsightsMarketPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const { trade: tradeSlug, province: provSlug } = await params;
  const sp = await searchParams;
  const m = await loadMarketMonth(tradeSlug, provSlug);
  if (!m) notFound();

  const t = insightsUi(lang).market;
  const home = getT("v3Pages").simple.home;
  const c = fmtFor(lang);
  const L = (p: string) => localizePath(p, lang);
  const trade = tradeName(m.trade.name, lang);
  const place = regionName(m.province, lang);
  const month = monthLabel(m.month, lang);

  // Gating: central entitlement flags; demo mode (no Supabase) shows everything unless ?view=locked.
  const configured = isSupabaseConfigured();
  const session = configured ? await getSession() : null;
  const ent: Entitlements = configured ? entitlementsOf(session) : sp.view === "locked" ? { pro: false, intel: false } : { pro: true, intel: true };
  // The public summary is free for everyone (no weekly quota on this page).
  const views = viewFacts(m.facts, ent, { freeLimit: Number.POSITIVE_INFINITY });
  // Signed-out visitors unlock Trade Pro through sign-up, not billing.
  const proHref = session ? null : signUpHrefForPlan("pro", "monthly");
  const rendered = views.map((v) => {
    const r = renderView(v, lang);
    return { v, r: proHref && r.locked && r.unlock === "pro" ? { ...r, links: r.links.map((l) => ({ ...l, href: proHref })) } : r };
  });
  const tierOf = (id: string) => m.facts.find((f) => f.id === id)?.tier ?? "free";
  const free = rendered.filter(({ r }) => tierOf(r.id) === "free").map((x) => x.r);
  const pro = rendered.filter(({ r }) => tierOf(r.id) === "pro").map((x) => x.r);
  const intel = rendered.filter(({ r }) => tierOf(r.id) === "intel").map((x) => x.r);
  const gaps = [...new Map(m.gaps.filter((g) => ["seasonality", "price_move", "volume", "price_band"].includes(g.kind)).map((g) => [g.kind, g])).values()];

  const path = L(insightsMarketPath(m.trade.slug, m.province));
  const others = (await loadMarketIndex(m.country))
    .filter((e) => (e.trade.slug === m.trade.slug) !== (e.province === m.province))
    .slice(0, 10);
  let no = 0;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: t.crumb, path: L(INSIGHTS_PATH) },
          { name: `${trade} · ${place}`, path },
        ])}
      />
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: t.crumb, href: INSIGHTS_PATH }]}
        tabs={false}
        aside={false}
        title={t.h1(trade, place)}
        lead={t.lead(trade, place, month)}
      >
        <div className="s-facts">
          <div>
            <div className="k">{t.stats.tenders}</div>
            <div className="v" data-stat="tenders">{m.tenders.month === null ? "—" : c.n(m.tenders.month)}</div>
            <div className="small muted">
              {m.tenders.month === null || m.tenders.prev === null
                ? t.stats.noHistory
                : `${t.stats.prev(m.tenders.prev)} · ${m.tenders.lastYear === null ? t.stats.noLy : t.stats.ly(m.tenders.lastYear)}`}
              {m.tenders.month !== null && m.tenders.excludedSources > 0 ? ` · ${t.stats.excluded(m.tenders.excludedSources)}` : ""}
            </div>
          </div>
          <div>
            <div className="k">{t.stats.awards}</div>
            <div className="v" data-stat="awards">{c.n(m.awards.month)}</div>
            <div className="small muted">{t.stats.prev(m.awards.prev)}</div>
          </div>
          <div>
            <div className="k">{month}</div>
            <div className="v" data-stat="records">{t.records(m.records)}</div>
          </div>
        </div>
        {!m.indexable && <div className="s-callout" data-thin="market"><p>{t.thin}</p></div>}

        <SH2 no={++no} id="summary">{t.sec.summary}</SH2>
        {free.length ? free.map((i) => <InsightBlock key={i.id} i={i} L={L} />) : null}
        {gaps.length > 0 && (
          <div className="s-callout" data-gaps="market">
            {gaps.map((g) => <p key={g.kind}>{gapText(g, lang)}</p>)}
          </div>
        )}
        <p className="small">
          <a href={L(benchmarkPath(m.trade.slug, m.province))}>{insightsUi(lang).pos.full} →</a>{" · "}
          <a href={L(intelMarketPath(m.trade.slug, provinceSlug(m.province)))}>{t.sec.intel} →</a>
        </p>

        {pro.length > 0 && (
          <>
            <SH2 no={++no} id="pro">{t.sec.pro}</SH2>
            {pro.map((i) => <InsightBlock key={i.id} i={i} L={L} />)}
          </>
        )}

        {intel.length > 0 && (
          <>
            <SH2 no={++no} id="intel">{t.sec.intel}</SH2>
            {intel.map((i) => <InsightBlock key={i.id} i={i} L={L} />)}
          </>
        )}

        <BidAlertBox source="insights" province={m.province} trades={[m.trade.slug]} signedIn={Boolean(session)} />

        <SH2 no={++no} id="method">{t.sec.method}</SH2>
        <div className="s-callout"><p>{t.method}</p></div>

        {others.length > 0 && (
          <>
            <SH2 no={++no} id="others">{t.sec.others}</SH2>
            <ul>
              {others.map((e) => (
                <li key={`${e.trade.slug}${e.province}`}>
                  <a href={L(insightsMarketPath(e.trade.slug, e.province))}>{tradeName(e.trade.name, lang)} · {regionName(e.province, lang)}</a>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="small muted">{t.share}: {`${SITE.url.replace(/\/$/, "")}${path}`}</p>
      </SimplePage>
    </>
  );
}
