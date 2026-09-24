import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import type { Metadata } from "next";
import { UsdHint } from "@/components/geo/usd-hint";
import Link from "next/link";
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
import { TradeProCard } from "@/components/public/trade-pro-card";
import { SeoListingCard } from "@/components/public/seo-listing-card";
import { EmailPreview } from "@/components/public/email-preview";
import { listRfps } from "@/lib/data/rfps";
import { isPastContract, daysUntil } from "@/lib/data/fomo";
import { rfpMarket } from "@/lib/visitor-geo";
import { publicTenderSource } from "@/lib/tenders/sources";
import type { RfpListItem } from "@/lib/data/types";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for trades in Canada and the U.S. Start with a free directory listing, or go Trade Pro for full RFP access.",
  alternates: { canonical: "/pricing" },
};

const FREE_FEATURES = [
  "Directory listing",
  "Basic company profile",
  "Appear in vendor searches",
];

const FEATURED_FEATURES = [
  "Everything in Trade Pro",
  "Featured placement — top of your categories",
  "Featured in your service regions",
  "Featured badge on your profile",
  "Priority in directory search results",
  "Maximum visibility to buyers",
];

const FAQ = [
  {
    q: "Do you offer refunds?",
    a: "Subscriptions are non-refundable, but you can cancel anytime from the billing portal — your access continues to the end of your paid period and you won't be charged again.",
  },
  {
    q: "Does PMRFP guarantee work?",
    a: "No. PMRFP is where property managers post RFPs and trades get found. We don't guarantee contracts, bid success, or revenue.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, your subscription stays active until the end of the billing period. Monthly plans can be cancelled any time.",
  },
  {
    q: "Where does PMRFP work?",
    a: "Across Canada and the United States. Public tenders come from CanadaBuys, the City of Toronto, Quebec's SEAO and Yukon in Canada, and from SAM.gov for U.S. federal building work. Property managers post RFPs in both countries.",
  },
  {
    q: "Can U.S. companies sign up and pay?",
    a: "Yes. Prices are in Canadian dollars and any major card works. At current exchange rates Trade Pro comes to about US$180 a year (or about US$21 a month); your card issuer does the conversion.",
  },
  {
    q: "Can property managers post for free?",
    a: "Yes. Property managers, builders, and owners can post RFPs at no cost.",
  },
  {
    q: "Can I join if I only serve one region?",
    a: "Yes. Choose the categories and regions you serve and you'll only be matched against relevant opportunities.",
  },
];

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

export default async function PricingPage() {
  const [stats, rfps] = await Promise.all([getPlatformStats(), listRfps().catch(() => [] as RfpListItem[])]);
  const preview = previewItems(rfps);
  return (
    <>
      <section className="border-b border-border bg-background">
        <Container className="py-20 sm:py-24">
          <div className="max-w-3xl">
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              Simple pricing, built for trades.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Get found for free, or unlock full RFP access with Trade Pro.
              Property managers, builders, and owners post projects at no cost.
            </p>
            <StatsStrip stats={stats} className="mt-8" />
          </div>
        </Container>
      </section>

      <Section>
        <div className="mb-10 flex items-center gap-3 rounded-lg border border-teal-400/60 bg-teal-100/40 px-5 py-4">
          <Sparkles className="size-5 shrink-0 text-teal-600" />
          <p className="text-sm font-medium text-foreground">
            {PRICING.earlyBirdNote}
          </p>
        </div>

        <p className="mb-8 text-center text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{PRICING.guaranteeNote}</span>{" "}
          {PRICING.roiNote}
        </p>

        <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Free */}
          <div className="flex h-full flex-col rounded-xl border border-border bg-card p-8">
            <h2 className="text-lg font-semibold text-foreground">Free</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Get listed and discoverable — no RFP access.
            </p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-semibold text-foreground">$0</span>
              <span className="text-sm text-muted-foreground">/forever</span>
            </div>
            <ul className="mt-6 flex-1 space-y-3">
              {FREE_FEATURES.map((f) => (
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
              Join free
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
              <h2 className="text-lg font-semibold text-white">Featured</h2>
              <p className="mt-2 text-sm text-indigo-100/70">
                Maximum visibility — rank at the top where buyers look first.
              </p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-semibold text-white">
                  ${PRICING.featuredAnnual}
                </span>
                <span className="text-sm text-indigo-100/70">
                  {PRICING.currency}/year
                </span>
              </div>
              <UsdHint cad={PRICING.featuredAnnual} per="year" className="mt-1 text-teal-300" />
              <ul className="mt-6 flex-1 space-y-3">
                {FEATURED_FEATURES.map((f) => (
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
                Get Featured
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {preview && (
        <Section>
          <SectionHeading
            eyebrow="What you get"
            title="One email every morning. Every match in your trade and area."
            description="This is the Trade Pro alert, filled with real open tenders from today's board. No more checking a dozen portals."
          />
          <div className="mt-10">
            <EmailPreview items={preview.items} tradeLabel={preview.trade} />
          </div>
        </Section>
      )}

      <Section tone="muted">
        <SectionHeading eyebrow="FAQ" title="Pricing questions" />
        <div className="mt-8 max-w-3xl">
          <Accordion>
            {FAQ.map((item) => (
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
