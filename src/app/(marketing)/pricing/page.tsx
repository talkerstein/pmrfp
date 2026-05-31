import type { Metadata } from "next";
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
import { PRICING, SITE } from "@/lib/site";
import { TradeProCard } from "@/components/public/trade-pro-card";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for Canadian trades. Start with a free directory listing, or go Trade Pro for full RFP access.",
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
    q: "Does PMRFP guarantee work?",
    a: "No. PMRFP is a vendor discovery and RFP visibility platform. We help you get found and monitor opportunities — we do not guarantee contracts, bid success, or revenue.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, your subscription stays active until the end of the billing period.",
  },
  {
    q: "Is this Canada-wide?",
    a: "We start Canada-wide with a strong Ontario/GTA focus.",
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

export default async function PricingPage() {
  const stats = await getPlatformStats();
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
              Get found for free, or unlock full RFP visibility with Trade Pro.
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

        <div className="grid items-start gap-6 md:grid-cols-3">
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

          {/* Trade Pro — client component handles monthly/annual toggle.
              Monthly toggle is suppressed when the Stripe monthly price isn't
              configured yet, so we don't promise a plan we can't sell. */}
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
              <ul className="mt-6 flex-1 space-y-3">
                {FEATURED_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-indigo-100">
                    <Check className="mt-0.5 size-4 shrink-0 text-teal-300" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={cn(buttonVariants({ size: "lg", variant: "accent" }), "mt-8 w-full")}
              >
                Get Featured
              </Link>
            </div>
          </div>
        </div>
      </Section>

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
