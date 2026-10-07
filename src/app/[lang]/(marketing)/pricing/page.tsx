import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import type { Metadata } from "next";
import { UsdHint } from "@/components/geo/usd-hint";
import { MarketPrice } from "@/components/geo/market-price";
import Image from "next/image";
import Link from "@/i18n/link";
import { Check, Sparkles } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { Section, SectionHeading } from "@/components/public/section";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { StatsStrip } from "@/components/public/stats-strip";
import { getPlatformStats } from "@/lib/data/stats";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRICING } from "@/lib/site";
import { PHOTOS } from "@/lib/photos";
import { TradeProCard } from "@/components/public/trade-pro-card";
import { SeoListingCard } from "@/components/public/seo-listing-card";
import { EmailPreview } from "@/components/public/email-preview";
import { listRfps } from "@/lib/data/rfps";
import { isPastContract, daysUntil } from "@/lib/data/fomo";
import { rfpMarket } from "@/lib/visitor-geo";
import { publicTenderSource } from "@/lib/tenders/sources";
import type { RfpListItem } from "@/lib/data/types";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { FoundingBanner } from "@/components/founding/banner";

/** The spots-left counter refreshes about once a minute. */
export const revalidate = 60;

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

/** Three real open tenders from the busiest trade, for the email preview. */
function previewItems(rfps: RfpListItem[]): { items: RfpListItem[]; trade: string } | null {
  const openCa = rfps.filter(
    (r) => r.status === "open" && !isPastContract(r) && rfpMarket(r) === "CA" && (daysUntil(r.deadline) ?? 99) >= 3,
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

export default async function PricingPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("sales");
  const p = t.pricing;
  const [stats, rfps] = await Promise.all([getPlatformStats(), listRfps().catch(() => [] as RfpListItem[])]);
  const preview = previewItems(rfps);
  return (
    <>
      <section className="border-b border-border bg-background">
        <Container className="grid items-center gap-12 py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
          <div className="max-w-3xl">
            <Eyebrow>{p.eyebrow}</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              {p.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {p.lead}
            </p>
            <StatsStrip stats={stats} className="mt-8" />
          </div>
          <div className="relative hidden aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-indigo lg:block">
            <Image
              src={PHOTOS.windowCleaners.src}
              alt={t.photoAlt.windowCleaners}
              fill
              loading="eager"
              sizes="400px"
              className="object-cover object-[28%_50%]"
            />
          </div>
        </Container>
      </section>

      <Section>
        <FoundingBanner className="mb-6" />
        <div className="mb-10 flex items-center gap-3 rounded-lg border border-teal-400/60 bg-teal-100/40 px-5 py-4">
          <Sparkles className="size-5 shrink-0 text-teal-600" />
          <p className="text-sm font-medium text-foreground">
            {t.plans.earlyBird}
          </p>
        </div>

        <p className="mb-8 text-center text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t.plans.guarantee}</span>{" "}
          {t.plans.roi}
        </p>

        <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Free */}
          <div className="flex h-full flex-col rounded-xl border border-border bg-card p-8">
            <h2 className="text-lg font-semibold text-foreground">{p.free.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {p.free.blurb}
            </p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-semibold text-foreground">{p.free.price}</span>
              <span className="text-sm text-muted-foreground">{p.free.per}</span>
            </div>
            <ul className="mt-6 flex-1 space-y-3">
              {p.free.features.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-teal-600" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "mt-8 w-full",
              )}
            >
              {p.free.cta}
            </Link>
          </div>

          {/* SEO Listing + Trade Pro — client components handle their own
              monthly/annual toggle. Each toggle is suppressed when its Stripe
              monthly price isn't configured, so we never promise an
              unsellable plan. */}
          <SeoListingCard monthlyEnabled={Boolean(process.env.STRIPE_PRICE_SEO_MONTHLY)} />
          <TradeProCard monthlyEnabled={Boolean(process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY)} />

          {/* Featured */}
          <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-indigo p-8 text-white shadow-xl">
            <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-teal-300/20 blur-2xl" />
            <div className="relative flex flex-1 flex-col">
              <h2 className="text-lg font-semibold text-white">{p.featured.name}</h2>
              <p className="mt-2 text-sm text-indigo-100/70">
                {p.featured.blurb}
              </p>
              <div className="mt-6 flex items-baseline gap-1">
                <MarketPrice
                  cad={PRICING.featuredAnnual}
                  per="year"
                  numberClassName="text-4xl font-semibold text-white"
                  perClassName="text-sm text-indigo-100/70"
                />
              </div>
              <UsdHint cad={PRICING.featuredAnnual} per="year" className="mt-1 text-teal-300" />
              <ul className="mt-6 flex-1 space-y-3">
                {p.featured.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-indigo-100">
                    <Check className="mt-0.5 size-4 shrink-0 text-teal-300" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={signUpHrefForPlan("featured")}
                className={cn(buttonVariants({ size: "lg", variant: "accent" }), "mt-8 w-full")}
              >
                {p.featured.cta}
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {preview && (
        <Section>
          <SectionHeading
            eyebrow={p.preview.eyebrow}
            title={p.preview.title}
            description={p.preview.description}
          />
          <div className="mt-10">
            <EmailPreview items={preview.items} tradeLabel={preview.trade} />
          </div>
        </Section>
      )}

      <Section tone="muted">
        <SectionHeading eyebrow={p.faqEyebrow} title={p.faqTitle} />
        <div className="mt-8 max-w-3xl">
          <Accordion>
            {p.faq.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-base">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
        <div className="mt-10 max-w-3xl">
          <TrustDisclaimer />
        </div>
      </Section>
    </>
  );
}
