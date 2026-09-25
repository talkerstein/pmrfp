import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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
import { COPY, PRICING, SITE } from "@/lib/site";
import { PHOTOS } from "@/lib/photos";

export const metadata: Metadata = {
  title: "For Trade Companies",
  description:
    "Get discovered for commercial property work. PMRFP helps trades and contractors get listed, monitor RFP opportunities, and express interest in one focused place.",
};

const INCLUDED = [
  {
    icon: IdCard,
    title: "Company profile",
    body: "A structured, professional profile showing your services, categories, and regions.",
  },
  {
    icon: Building2,
    title: "Directory listing",
    body: "Become discoverable to property managers, builders, and building owners searching for vendors.",
  },
  {
    icon: Search,
    title: "RFP feed",
    body: "See the RFPs property managers post in your categories and regions.",
  },
  {
    icon: Bookmark,
    title: "Save RFPs",
    body: "Bookmark RFPs you want to revisit and keep your shortlist organized.",
  },
  {
    icon: Send,
    title: "Bid on RFPs",
    body: "Show interest on RFPs that fit and track every submission you make.",
  },
  {
    icon: BellRing,
    title: "Matching alerts",
    body: "Get notified when new RFPs match your services so you never miss a fit.",
  },
  {
    icon: BadgeCheck,
    title: "Verified vendor badge",
    body: "Embed a PMRFP badge on your website so visitors can open your company profile and see the details recorded there.",
  },
];

const TRADES = [
  "Electricians",
  "HVAC & mechanical",
  "Roofers",
  "Cleaning & janitorial",
  "Snow removal",
  "Landscaping & grounds",
  "General contractors",
  "Plumbing",
  "Painting & coatings",
  "Fire & life safety",
  "Security & access",
  "Restoration",
];

const FAQ = [
  {
    q: "Does PMRFP guarantee work?",
    a: "No. PMRFP is where property managers post RFPs and trades get found. We don't guarantee contracts, bid success, or revenue.",
  },
  {
    q: "Can I cancel?",
    a: "Yes. You can cancel anytime. Your subscription stays active until the end of your current billing period.",
  },
  {
    q: "Which regions do you cover?",
    a: "Pick the exact regions and categories you serve and you'll only be matched to relevant work. We're live in major metros and adding more — if your area is still building out, join the founding list and we'll alert you as opportunities come online.",
  },
  {
    q: "Can I join if I only serve one region?",
    a: "Absolutely. Choose the categories and regions you actually serve, and you'll only be matched against relevant opportunities.",
  },
];

export default function ForTradesPage() {
  return (
    <>
      <section className="border-b border-border bg-background">
        <Container className="py-20 sm:py-28">
          <div className="max-w-3xl">
            <Eyebrow>For trade companies</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              Get discovered for commercial property work.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Most building work goes to whoever the property manager already knows.{" "}
              {SITE.name} is where they post RFPs — get listed, watch your trade and region,
              and bid.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                Join as a Trade Company
              </Link>
              <Link
                href="/pricing"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                See pricing
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Section>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <SectionHeading
              eyebrow="The opportunity"
              title="Why commercial property work matters"
              description="Commercial properties need a steady roster of reliable trades — for maintenance, upgrades, emergencies, and capital projects. The work is consistent and high-value, but it rarely reaches companies that aren't already known."
            />
            <p className="mt-6 max-w-2xl text-lg font-medium leading-relaxed text-foreground">
              Most commercial property opportunities never reach your inbox unless
              you are already known.
            </p>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-indigo">
            <Image
              src={PHOTOS.floorCoating.src}
              alt={PHOTOS.floorCoating.alt}
              fill
              sizes="(min-width: 1152px) 540px, (min-width: 1024px) calc(50vw - 3.5rem), (min-width: 640px) calc(100vw - 4rem), calc(100vw - 2.5rem)"
              className="object-cover"
            />
          </div>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow="How it works"
          title="How PMRFP helps"
          description={COPY.tradeValue}
        />
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          PMRFP makes you easier to find and gives you one place to watch the
          RFPs that match.
        </p>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="What's included"
          title="Everything you need to get found and win building work"
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">
                  <f.icon className="size-5" />
                </span>
                <CardTitle className="mt-3">{f.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="leading-relaxed text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Verified badge callout */}
        <div className="mt-8 flex flex-col items-start gap-4 rounded-xl border border-teal-300 bg-teal-50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <BadgeCheck className="mt-0.5 size-6 shrink-0 text-teal-600" />
            <div>
              <h3 className="font-semibold text-indigo">Show you&apos;re a verified {SITE.name} vendor</h3>
              <p className="mt-1 text-sm leading-relaxed text-teal-700">
                Grab a copy-paste badge for your website that links visitors to your profile,
                so they can see your services, areas and the details recorded there.
              </p>
            </div>
          </div>
          <Link href="/badge" className={buttonVariants({ variant: "accent" })}>
            Get your badge <ArrowRight className="size-4" />
          </Link>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Who should join"
          title="Built for the trades that keep commercial properties running"
        />
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {TRADES.map((t) => (
            <li
              key={t}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
            >
              <CheckCircle2 className="size-4 shrink-0 text-teal-600" />
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <div className="grid items-center gap-8 rounded-xl border border-border bg-card p-8 sm:p-10 md:grid-cols-2">
          <div>
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              ${PRICING.proAnnual} {PRICING.currency}/year for Trade Pro
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Start with a free directory listing, or go Pro for full RFP
              access, saved RFPs, bidding, and matching alerts.
            </p>
            <p className="mt-4 text-sm font-medium text-teal-600">
              {PRICING.earlyBirdNote}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              Join as a Trade Company
            </Link>
            <Link
              href="/pricing"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Compare plans
            </Link>
          </div>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading eyebrow="FAQ" title="Common questions" />
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

      <CTASection
        title="Get listed before your competitors do."
        primaryHref="/sign-up"
        primaryLabel="Join as a Trade Company"
        secondaryHref="/pricing"
        secondaryLabel="See pricing"
      />
    </>
  );
}
