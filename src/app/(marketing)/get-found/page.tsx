import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { PRICING, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Get Found — SEO & AI Visibility for Trades",
  description: `Your company on the trade + city pages property managers find on Google — and in AI answers. ${SITE.name} member profiles have reached top-10 Google positions in their categories.`,
  alternates: { canonical: "/get-found" },
};

/**
 * The SEO/AEO pitch page for the tiered directory model. Claims here are
 * deliberately conservative: real Search Console positions, no invented
 * metrics, no ranking guarantees. Update the proof points from GSC exports,
 * never from imagination.
 */
const faqs = [
  {
    q: "What does an SEO Listing actually get me?",
    a: `Placement on the ${SITE.name} pages property managers find when they search for your trade in your city — plus your own profile page with your services, service areas, and Google rating. Search engines and AI assistants read these pages because they're structured data-first and kept honest: a page only exists where real companies are listed.`,
  },
  {
    q: "What's the AI (AEO) part?",
    a: `When someone asks ChatGPT or Google's AI for "commercial roofing contractors in Mississauga", the engines pull from structured, verifiable pages. ${SITE.name} publishes machine-readable data (schema.org markup on every page, an llms.txt index) and concrete evidence like project case studies — the kind of content answer engines cite.`,
  },
  {
    q: "Do you guarantee rankings?",
    a: "No — nobody honestly can. What we control: real pages, real structured data, real project evidence, and a directory Google already ranks in the top 10 for several member profiles. What we don't control: Google.",
  },
  {
    q: "How is this different from Trade Pro?",
    a: `SEO Listing is visibility only. Trade Pro ($${PRICING.proAnnual}/yr) adds the RFP board: see posted projects, get matching alerts, and express interest. You can start with visibility and upgrade any time.`,
  },
];

export default function GetFoundPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Get Found", path: "/get-found" },
      ])} />
      <JsonLd data={faqSchema(faqs)} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-14">
          <Eyebrow>For trades &amp; service companies</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Get found on Google — and in AI answers.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Property managers don&rsquo;t browse directories for fun. They search — on Google, and
            increasingly by asking AI. {SITE.name} puts your company on the pages both actually
            read: trade + city pages with real companies, real projects, and structured data on
            every one.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonVariants()}>Get listed free</Link>
            <Link href="/pricing" className={buttonVariants({ variant: "outline" })}>See pricing</Link>
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">Proof, not promises</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            {
              stat: "Top 10",
              line: "Google positions reached by member profile pages in their categories (Search Console, last 90 days).",
            },
            {
              stat: "Page 1",
              line: "positions held by our commercial cost guides — the pages property managers research budgets on.",
            },
            {
              stat: "Every page",
              line: "ships schema.org structured data, and the site publishes an llms.txt index for AI crawlers.",
            },
          ].map((p) => (
            <div key={p.stat} className="rounded-lg border border-border bg-card p-5">
              <p className="text-2xl font-semibold text-teal-ink">{p.stat}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.line}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Positions vary by query and region and are not guaranteed — see the FAQ for what we do
          and don&rsquo;t control.
        </p>
      </Container>

      <section className="bg-secondary/30">
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">How the visibility ladder works</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {[
              {
                name: "Free listing",
                price: "$0",
                lines: [
                  "Company profile in the directory",
                  "Appear in category + region search on the site",
                  "Submit project case studies",
                ],
              },
              {
                name: "SEO Listing",
                price: `$${PRICING.seoAnnual}/yr`,
                badge: "Founding pricing",
                lines: [
                  "Placement on your trade + city pages — the ones Google indexes",
                  "Google rating displayed on your profile (official Places data)",
                  "Case studies featured on your city pages",
                  "Priority ordering over free listings",
                ],
              },
              {
                name: `Trade Pro — $${PRICING.proAnnual}/yr`,
                price: "",
                lines: [
                  "Everything in SEO Listing",
                  "Full RFP board access + matching alerts",
                  "Express interest on posted projects",
                ],
              },
            ].map((t) => (
              <div key={t.name} className="flex flex-col rounded-lg border border-border bg-card p-6">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-base font-semibold">{t.name}</h3>
                  {t.price && <span className="text-lg font-semibold text-teal-ink">{t.price}</span>}
                </div>
                {t.badge && (
                  <span className="mt-1 w-fit rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                    {t.badge}
                  </span>
                )}
                <ul className="mt-4 space-y-2 text-sm">
                  {t.lines.map((l) => (
                    <li key={l} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-teal-600" />
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Start free today — upgrade from your dashboard when the paid tiers fit. Case studies
            and a complete profile do more for your visibility than any tier alone.
          </p>
        </Container>
      </section>

      <Container size="narrow" className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">Frequently asked</h2>
        <div className="mt-4 space-y-5">
          {faqs.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </Container>

      <CTASection
        title="Be on the page they find."
        description="List your company free in minutes. Add a case study and you're already ahead of most of your competition."
        primaryHref="/sign-up"
        primaryLabel="Get listed free"
        secondaryHref="/case-studies"
        secondaryLabel="See member case studies"
      />
    </>
  );
}
