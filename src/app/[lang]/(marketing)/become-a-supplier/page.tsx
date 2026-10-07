import type { Metadata } from "next";
import Link from "@/i18n/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Hammer,
  Home,
  Mail,
  Package,
  Search,
  Building2,
  Target,
} from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { Section, SectionHeading, CTASection } from "@/components/public/section";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SPONSOR_PACKAGES, cad } from "@/components/advertise/packages";
import { getCategories, type CategoryOption } from "@/lib/data/taxonomy";
import { getPlatformStats, type PlatformStats } from "@/lib/data/stats";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { boardStats, isPastContract } from "@/lib/data/fomo";
import type { RfpListItem } from "@/lib/data/types";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { PRICING, REFERRAL } from "@/lib/site";
import { SPOTLIGHT } from "@/lib/spotlight/config";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";

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

const WHY_ICONS = [Hammer, Building2, Target] as const;
const WHERE = [
  { icon: Search, key: "directory" },
  { icon: FileText, key: "rfp" },
  { icon: Home, key: "home" },
  { icon: Mail, key: "digest" },
] as const;

/** Trades with the most open (not past-award) RFPs right now. */
function busiestTrades(rfps: RfpListItem[], categories: CategoryOption[]) {
  const open = rfps.filter((r) => r.status === "open" && !isPastContract(r));
  return categories
    .map((c) => ({ slug: c.slug, name: c.name, open: open.filter((r) => r.categories.includes(c.name)).length }))
    .filter((c) => c.open > 0)
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
    .slice(0, 8);
}

export default async function BecomeASupplierPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const p = getT("sales").becomeSupplier;
  const crumbs = getT("partners").crumbs;
  const [rfps, categories, platform] = await Promise.all([
    listAllRfpsCached().catch(() => [] as RfpListItem[]),
    getCategories().catch(() => [] as CategoryOption[]),
    getPlatformStats().catch((): PlatformStats => ({ rfpsPostedLast30Days: 0, tradesListed: 0 })),
  ]);
  const open = boardStats(rfps).open;
  const busiest = busiestTrades(rfps, categories);
  const stats = [
    { n: open, label: p.stats.open },
    { n: platform.tradesListed, label: p.stats.trades },
    { n: categories.length, label: p.stats.categories },
  ].filter((s) => s.n > 0);
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

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: crumbs.home, path: localizePath("/", lang) },
          { name: p.crumb, path: localizePath("/become-a-supplier", lang) },
        ])}
      />
      <JsonLd data={faqSchema(p.faq)} />

      <section className="border-b border-border bg-background">
        <Container className="py-20 sm:py-28">
          <div className="max-w-3xl">
            <Eyebrow>{p.eyebrow}</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">{p.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{p.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up?role=supplier" className={buttonVariants({ size: "lg" })}>
                {p.primary}
              </Link>
              <Link href="/advertise" className={buttonVariants({ size: "lg", variant: "outline" })}>
                {p.secondary}
              </Link>
            </div>
          </div>
          {stats.length > 0 && (
            <dl className="mt-12 grid max-w-3xl gap-6 sm:grid-cols-3">
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col border-l-2 border-teal-500 pl-4">
                  <dt className="text-sm text-muted-foreground">{s.label}</dt>
                  <dd className="order-first text-3xl font-semibold tracking-tight text-foreground">
                    {formatNumber(s.n, lang)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Container>
      </section>

      <Section>
        <SectionHeading eyebrow={p.why.eyebrow} title={p.why.title} />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {p.why.items.map((item, i) => {
            const Icon = WHY_ICONS[i] ?? Package;
            return (
              <Card key={item.title}>
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">
                    <Icon className="size-5" />
                  </span>
                  <CardTitle className="mt-3">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="leading-relaxed text-muted-foreground">{item.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading eyebrow={p.where.eyebrow} title={p.where.title} />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {WHERE.map((w) => (
            <div key={w.key} className="flex gap-4 rounded-xl border border-border bg-card p-6">
              <w.icon className="mt-0.5 size-5 shrink-0 text-teal-600" />
              <div>
                <h3 className="font-semibold text-foreground">{p.where.items[w.key].title}</h3>
                <p className="mt-1 leading-relaxed text-muted-foreground">{p.where.items[w.key].body}</p>
              </div>
            </div>
          ))}
        </div>
        {busiest.length > 0 && (
          <div className="mt-12">
            <h3 className="text-xl font-semibold text-foreground">{p.busiest.title}</h3>
            <p className="mt-2 max-w-2xl text-muted-foreground">{p.busiest.body}</p>
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {busiest.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/trades/${c.slug}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:border-teal-400"
                  >
                    <span>{tradeName(c.name, lang)}</span>
                    <span className="font-mono text-teal-700">{formatNumber(c.open, lang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section>
        <SectionHeading eyebrow={p.plans.eyebrow} title={p.plans.title} />
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {plan.price}
                  {plan.per && <span className="ml-1 text-sm font-normal text-muted-foreground">{plan.per}</span>}
                </p>
              </CardHeader>
              <CardContent>
                <p className="leading-relaxed text-muted-foreground">{plan.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          {fmt(p.plans.currencyNote, { usd: formatNumber(SPOTLIGHT.priceUsd, lang) })}
        </p>
      </Section>

      <Section tone="muted">
        <SectionHeading eyebrow={p.who.eyebrow} title={p.who.title} />
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {p.who.list.map((kind) => (
            <li
              key={kind}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
            >
              <CheckCircle2 className="size-4 shrink-0 text-teal-600" />
              {kind}
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <div className="flex flex-col items-start gap-4 rounded-xl border border-teal-300 bg-teal-50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-indigo">{p.refer.title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-teal-700">
              {fmt(p.refer.body, { fee: REFERRAL.maxFee })}
            </p>
          </div>
          <Link href="/refer-a-trade" className={buttonVariants({ variant: "accent" })}>
            {p.refer.cta} <ArrowRight className="size-4" />
          </Link>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading eyebrow={p.faqEyebrow} title={p.faqTitle} />
        <div className="mt-8 max-w-3xl">
          <Accordion>
            {p.faq.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-base">{item.q}</AccordionTrigger>
                <AccordionContent>
                  <p className="leading-relaxed text-muted-foreground">{item.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
        <div className="mt-10 max-w-3xl">
          <TrustDisclaimer />
        </div>
      </Section>

      <CTASection
        title={p.cta.title}
        description={p.cta.description}
        primaryHref="/sign-up?role=supplier"
        primaryLabel={p.primary}
        secondaryHref="/advertise"
        secondaryLabel={p.secondary}
      />
    </>
  );
}
