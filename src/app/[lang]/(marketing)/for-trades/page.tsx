import type { Metadata } from "next";
import Image from "next/image";
import Link from "@/i18n/link";
import {
  Building2,
  Search,
  BellRing,
  Bookmark,
  Send,
  IdCard,
  CheckCircle2,
  BadgeCheck,
  ArrowRight,
} from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import {
  Section,
  SectionHeading,
  CTASection,
} from "@/components/public/section";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PRICING, SITE } from "@/lib/site";
import { PHOTOS } from "@/lib/photos";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { FoundingBanner } from "@/components/founding/banner";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).sales.forTrades.meta;
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/for-trades"),
  };
}

/** Card order and icons; the words live in messages/sales.ts (forTrades.included.items). */
const INCLUDED = [
  { icon: IdCard, key: "profile" },
  { icon: Building2, key: "directory" },
  { icon: Search, key: "feed" },
  { icon: Bookmark, key: "save" },
  { icon: Send, key: "bid" },
  { icon: BellRing, key: "alerts" },
  { icon: BadgeCheck, key: "badge" },
] as const;

export default async function ForTradesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("sales");
  const p = t.forTrades;
  const lang = getLang();
  return (
    <>
      <section className="border-b border-border bg-background">
        <Container className="py-20 sm:py-28">
          <div className="max-w-3xl">
            <Eyebrow>{p.eyebrow}</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              {p.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {fmt(p.lead, { site: SITE.name })}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                {p.join}
              </Link>
              <Link
                href="/pricing"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                {p.seePricing}
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Section>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <SectionHeading
              eyebrow={p.opportunity.eyebrow}
              title={p.opportunity.title}
              description={p.opportunity.description}
            />
            <p className="mt-6 max-w-2xl text-lg font-medium leading-relaxed text-foreground">
              {p.opportunity.punch}
            </p>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-indigo">
            <Image
              src={PHOTOS.floorCoating.src}
              alt={t.photoAlt.floorCoating}
              fill
              sizes="(min-width: 1152px) 540px, (min-width: 1024px) calc(50vw - 3.5rem), (min-width: 640px) calc(100vw - 4rem), calc(100vw - 2.5rem)"
              className="object-cover"
            />
          </div>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow={p.how.eyebrow}
          title={p.how.title}
          description={t.copy.tradeValue}
        />
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {p.how.body}
        </p>
      </Section>

      <Section>
        <SectionHeading
          eyebrow={p.included.eyebrow}
          title={p.included.title}
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((f) => (
            <Card key={f.key}>
              <CardHeader>
                <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">
                  <f.icon className="size-5" />
                </span>
                <CardTitle className="mt-3">{p.included.items[f.key].title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="leading-relaxed text-muted-foreground">{p.included.items[f.key].body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Verified badge callout */}
        <div className="mt-8 flex flex-col items-start gap-4 rounded-xl border border-teal-300 bg-teal-50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <BadgeCheck className="mt-0.5 size-6 shrink-0 text-teal-600" />
            <div>
              <h3 className="font-semibold text-indigo">{fmt(p.badge.title, { site: SITE.name })}</h3>
              <p className="mt-1 text-sm leading-relaxed text-teal-700">
                {p.badge.body}
              </p>
            </div>
          </div>
          <Link href="/badge" className={buttonVariants({ variant: "accent" })}>
            {p.badge.cta} <ArrowRight className="size-4" />
          </Link>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow={p.who.eyebrow}
          title={p.who.title}
        />
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {p.who.trades.map((trade) => (
            <li
              key={trade}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
            >
              <CheckCircle2 className="size-4 shrink-0 text-teal-600" />
              {trade}
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <div className="grid items-center gap-8 rounded-xl border border-border bg-card p-8 sm:p-10 md:grid-cols-2">
          <div>
            <Eyebrow>{p.pricing.eyebrow}</Eyebrow>
            <p className="mt-2 text-sm"><FoundingBanner variant="link" /></p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {fmt(p.pricing.title, { price: formatNumber(PRICING.proAnnual, lang), currency: PRICING.currency })}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {p.pricing.body}
            </p>
            <p className="mt-4 text-sm font-medium text-teal-600">
              {t.plans.earlyBird}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              {p.join}
            </Link>
            <Link
              href="/pricing"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              {p.comparePlans}
            </Link>
          </div>
        </div>
      </Section>

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

      <CTASection
        title={p.cta.title}
        primaryHref="/sign-up"
        primaryLabel={p.join}
        secondaryHref="/pricing"
        secondaryLabel={p.seePricing}
      />
    </>
  );
}
