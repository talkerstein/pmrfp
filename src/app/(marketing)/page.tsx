import Link from "next/link";
import {
  Building2,
  FileSearch,
  Network,
  Search,
  Send,
  UserCheck,
} from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { Section, SectionHeading, CTASection } from "@/components/public/section";
import { CategoryGrid } from "@/components/public/category-grid";
import { buttonVariants } from "@/components/ui/button";
import { COPY, PRICING, SITE } from "@/lib/site";
import { getCategories } from "@/lib/data/taxonomy";

const STATS = ["Canada-first", "Commercial property focused", "Vendor directory", "RFP visibility"];

export default async function HomePage() {
  const categories = await getCategories();

  return (
    <>
      {/* Hero */}
      <section className="border-b border-border bg-background">
        <Container className="py-20 sm:py-28">
          <div className="max-w-3xl">
            <Eyebrow>Commercial property RFP network</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              Find Commercial Property RFPs and Get Discovered by Property Decision-Makers
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {SITE.name} helps Canadian trades, contractors, and service companies get listed,
              monitor commercial property opportunities, and connect with property managers,
              builders, and building owners.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                Join as a Trade Company
              </Link>
              <Link href="/for-property-managers" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Post an RFP
              </Link>
            </div>
            <p className="mt-5 max-w-xl text-xs text-muted-foreground">{COPY.disclaimer}</p>
          </div>
        </Container>
      </section>

      {/* Stats strip */}
      <section className="border-b border-border bg-secondary/50">
        <Container className="flex flex-wrap items-center gap-x-8 gap-y-3 py-5">
          {STATS.map((s) => (
            <span key={s} className="flex items-center gap-2 text-sm font-medium text-ink-2">
              <span className="size-1.5 rounded-full bg-teal-500" />
              {s}
            </span>
          ))}
        </Container>
      </section>

      {/* Problem */}
      <Section tone="muted">
        <SectionHeading
          eyebrow="The problem"
          title="Commercial property work is relationship-driven — and fragmented"
          description="Opportunities move through preferred-vendor lists, referrals, emails, and portals. Trades miss work they never see; property managers waste time finding reliable vendors."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Network, t: "Fragmented opportunities" },
            { icon: UserCheck, t: "Hard-to-reach decision-makers" },
            { icon: Search, t: "Manual vendor searches" },
            { icon: Send, t: "Missed follow-ups" },
          ].map(({ icon: Icon, t }) => (
            <div key={t} className="rounded-lg border border-border bg-card p-5">
              <Icon className="size-5 text-teal-600" />
              <p className="mt-3 text-sm font-medium">{t}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Solution */}
      <Section>
        <SectionHeading eyebrow="What PMRFP does" title="A focused place to get found and find work" />
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            { icon: Building2, t: "Get Listed", d: "Build your company profile, choose your categories and regions, and become easy to find for property decision-makers." },
            { icon: FileSearch, t: "Find RFPs", d: "Monitor commercial property opportunities across key categories and regions in one focused place." },
            { icon: Send, t: "Express Interest", d: "Signal interest on opportunities that match your services and track every submission." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-lg border border-border bg-card p-6">
              <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Audience split */}
      <Section tone="muted">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-8">
            <Eyebrow>For trade companies</Eyebrow>
            <h3 className="mt-3 text-xl font-semibold">Become easier to find. Monitor real opportunities.</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{COPY.tradeValue}</p>
            <Link href="/for-trades" className={buttonVariants({ className: "mt-5" })}>Explore for trades</Link>
          </div>
          <div className="rounded-xl border border-border bg-card p-8">
            <Eyebrow>For property managers</Eyebrow>
            <h3 className="mt-3 text-xl font-semibold">Post once. Discover vendors. No obligation.</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{COPY.pmValue}</p>
            <Link href="/for-property-managers" className={buttonVariants({ variant: "outline", className: "mt-5" })}>
              Explore for property managers
            </Link>
          </div>
          <div className="rounded-xl border border-border bg-card p-8">
            <Eyebrow>For suppliers</Eyebrow>
            <h3 className="mt-3 text-xl font-semibold">Reach the trades and builders who buy what you sell.</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              List your products in a searchable directory and track commercial project demand across Canada.
            </p>
            <Link href="/for/suppliers" className={buttonVariants({ variant: "outline", className: "mt-5" })}>
              Explore for suppliers
            </Link>
          </div>
        </div>
      </Section>

      {/* Categories */}
      <Section>
        <SectionHeading eyebrow="Categories" title="Built for the trades that keep buildings running" />
        <div className="mt-8">
          <CategoryGrid categories={categories} limit={16} />
        </div>
        <Link href="/directory" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
          Browse the full directory
        </Link>
      </Section>

      {/* Pricing preview */}
      <Section tone="muted" containerSize="narrow">
        <div className="rounded-2xl border border-teal-200 bg-card p-8 text-center">
          <Eyebrow>Early member pricing</Eyebrow>
          <p className="mt-4 text-4xl font-semibold">
            ${PRICING.proAnnual}
            <span className="text-base font-normal text-muted-foreground"> CAD/year</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Trade Pro membership — directory visibility, full RFP access, and the ability to express
            interest. {PRICING.earlyBirdNote}
          </p>
          <Link href="/pricing" className={buttonVariants({ size: "lg", className: "mt-6" })}>
            See pricing
          </Link>
        </div>
      </Section>

      <CTASection
        title="Get listed before your competitors do."
        description={`Free directory listing, or go Pro for $${PRICING.proAnnual} CAD/year.`}
        primaryHref="/sign-up"
        primaryLabel={`Join ${SITE.name}`}
        secondaryHref="/rfps"
        secondaryLabel="Browse opportunities"
      />
    </>
  );
}
