import type { Metadata } from "next";
import { AudienceLanding } from "@/components/v3/audience";
import { SPONSOR_PACKAGES, cad } from "@/components/advertise/packages";
import { getCategories, type CategoryOption } from "@/lib/data/taxonomy";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { isPastContract } from "@/lib/data/fomo";
import type { RfpListItem } from "@/lib/data/types";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { PHOTOS } from "@/lib/photos";
import { PRICING, REFERRAL } from "@/lib/site";
import { SPOTLIGHT } from "@/lib/spotlight/config";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).sales.becomeSupplier.meta;
  return {
    title: { absolute: t.title },
    description: t.description,
    alternates: alternatesFor(l, "/become-a-supplier"),
  };
}

/** Trades with the most open (not past-award) RFPs right now. */
function busiestTrades(rfps: RfpListItem[], categories: CategoryOption[]) {
  const open = rfps.filter((r) => r.status === "open" && !isPastContract(r));
  return categories
    .map((c) => ({ slug: c.slug, name: c.name, open: open.filter((r) => r.categories.includes(c.name)).length }))
    .filter((c) => c.open > 0)
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
    .slice(0, 8);
}

/** Supplier recruitment page on the v3 audience-landing template. */
export default async function BecomeASupplierPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const L = (path: string) => localizePath(path, lang);
  const p = getT("sales").becomeSupplier;
  const crumbs = getT("partners").crumbs;
  const [rfps, categories] = await Promise.all([
    listAllRfpsCached().catch(() => [] as RfpListItem[]),
    getCategories().catch(() => [] as CategoryOption[]),
  ]);
  const busiest = busiestTrades(rfps, categories);
  const money = (n: number) => cad(n, lang);
  const sponsorFrom = Math.min(...SPONSOR_PACKAGES.map((s) => s.monthly));
  const plans = [
    { ...p.plans.free, price: p.plans.free.price, per: "" },
    { ...p.plans.seo, price: money(PRICING.seoAnnual), per: `${p.plans.perYear} · ${money(PRICING.seoMonthly)}${p.plans.perMonth}` },
    { ...p.plans.featured, price: money(PRICING.featuredAnnual), per: p.plans.perYear },
    { ...p.plans.sponsor, price: `${p.plans.from} ${money(sponsorFrom)}`, per: p.plans.perMonth },
    { ...p.plans.spotlight, price: money(SPOTLIGHT.priceCad), per: p.plans.oneTime },
    { ...p.plans.marketplace, price: p.plans.marketplace.price, per: "" },
  ];
  const where = (["directory", "rfp", "home", "digest"] as const).map((k) => p.where.items[k]);

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: crumbs.home, path: localizePath("/", lang) },
          { name: p.crumb, path: localizePath("/become-a-supplier", lang) },
        ])}
      />
      <JsonLd data={faqSchema(p.faq)} />
      <AudienceLanding
        lang={lang}
        c={{
          key: "suppliers",
          side: "seller",
          label: p.eyebrow,
          h1: p.title,
          sub: p.lead,
          cta: { label: p.primary, href: "/sign-up?role=supplier" },
          cta2: { label: p.secondary, href: "/advertise" },
          img: PHOTOS.loadingDocks.src,
          f1Img: PHOTOS.floorCrew.src,
          getLabel: p.where.eyebrow,
          getHead: p.where.title,
          tags: p.who.list,
          features: where.map((x) => ({ t: x.title, d: x.body })),
          steps: p.why.items.map((x) => ({ t: x.title, d: x.body })),
          faq: p.faq,
          disclaimer: getT("common").disclaimer,
          endHead: p.cta.title,
          endSub: p.cta.description,
          endImg: PHOTOS.floorCrew.src,
          hidePrice: true,
          extra: (
            <div className="flex flex-col gap-16">
              <div>
                <div className="eb">{p.plans.eyebrow}</div>
                <h2 className="h2" style={{ fontSize: 34 }}>{p.plans.title}</h2>
                <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {plans.map((plan) => (
                    <div key={plan.name} className="rounded-2xl border p-6" style={{ borderColor: "#D5D7E6" }}>
                      <h3 style={{ fontFamily: "var(--fp)", fontWeight: 700, fontSize: 20, color: "#282B59" }}>{plan.name}</h3>
                      <p className="mt-2" style={{ fontFamily: "var(--fp)", fontWeight: 700, fontSize: 26 }}>
                        {plan.price}
                        {plan.per && <span className="ml-1" style={{ fontSize: 14, fontWeight: 400, color: "#4B4F6B" }}>{plan.per}</span>}
                      </p>
                      <p className="mt-3" style={{ color: "#4B4F6B" }}>{plan.body}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4" style={{ fontSize: 14, color: "#4B4F6B" }}>{fmt(p.plans.currencyNote, { usd: formatNumber(SPOTLIGHT.priceUsd, lang) })}</p>
              </div>
              {busiest.length > 0 && (
                <div>
                  <h2 className="h2" style={{ fontSize: 34 }}>{p.busiest.title}</h2>
                  <p className="mt-3 max-w-2xl" style={{ color: "#4B4F6B" }}>{p.busiest.body}</p>
                  <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {busiest.map((c) => (
                      <li key={c.slug}>
                        <a href={L(`/trades/${c.slug}`)} className="nu lift flex items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "#D5D7E6", fontWeight: 700 }}>
                          <span>{tradeName(c.name, lang)}</span>
                          <span className="mono">{formatNumber(c.open, lang)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-col items-start gap-4 rounded-2xl p-8 sm:flex-row sm:items-center sm:justify-between" style={{ background: "#91F2CF" }}>
                <div>
                  <h2 style={{ fontFamily: "var(--fp)", fontWeight: 700, fontSize: 24 }}>{p.refer.title}</h2>
                  <p className="mt-1 max-w-2xl">{fmt(p.refer.body, { fee: REFERRAL.maxFee })}</p>
                </div>
                <a href={L("/refer-a-trade")} className="btn ink md">{p.refer.cta} →</a>
              </div>
            </div>
          ),
        }}
      />
    </>
  );
}
