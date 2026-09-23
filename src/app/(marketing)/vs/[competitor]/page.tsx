import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { RfpCard } from "@/components/public/rfp-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { COMPETITORS, getCompetitor } from "@/lib/seo/competitors";
import { PRICING, SITE } from "@/lib/site";
import { listRfps } from "@/lib/data/rfps";
import { publicTenderSource } from "@/lib/tenders/sources";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";

export const revalidate = 86400;

export async function generateStaticParams() {
  return COMPETITORS.map((c) => ({ competitor: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ competitor: string }>;
}): Promise<Metadata> {
  const { competitor } = await params;
  const c = getCompetitor(competitor);
  if (!c) return { title: "Comparison not found" };
  // Lead with the competitor's name, not ours. Search Console shows these pages
  // earn their impressions on "<competitor>", "<competitor> pricing" and
  // "<competitor> alternative" queries — searchers who have never heard of us.
  // Putting our brand first buried the term they actually typed, and the layout
  // already appends "— PMRFP", so the old title spent its budget saying our name
  // twice. "Pricing" is in the title because it's the top comparison query.
  const title = c.seoTitle ?? `${c.name} vs ${SITE.name}: Pricing & Which Fits Canadian Trades`;
  return {
    title,
    description:
      c.seoDescription ??
      `Compare ${c.name} and ${SITE.name} on price, focus, and what each is actually built for. ${SITE.name} is $${PRICING.proAnnual} CAD/yr flat.`,
    alternates: { canonical: `/vs/${c.slug}` },
  };
}

export default async function VersusPage({
  params,
}: {
  params: Promise<{ competitor: string }>;
}) {
  const { competitor } = await params;
  const c = getCompetitor(competitor);
  if (!c) notFound();

  // Competitors that sell tender access get live proof: what's open on PMRFP
  // right now from public sources, soonest-closing first.
  const openTenders = c.publicTenderProof
    ? (await listRfps().catch(() => [])).filter(
        // Canadian sources only — the copy below names them, and these
        // competitors sell Canadian tender access.
        (r) => r.status === "open" && r.sourceType === "public_source" && !publicTenderSource(r.slug).past && publicTenderSource(r.slug).key !== "sam",
      )
    : [];
  const sample = [...openTenders]
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
    .slice(0, 3);
  const proHref = signUpHrefForPlan("pro", "annual");

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Compare", path: "/vs" },
        { name: `vs ${c.name}`, path: `/vs/${c.slug}` },
      ])} />
      <JsonLd data={faqSchema(c.faqs)} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-14">
          <nav className="mb-3 text-xs text-muted-foreground">
            <Link href="/vs" className="hover:text-foreground">Compare</Link> / {SITE.name} vs {c.name}
          </nav>
          <Eyebrow>Comparison</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {c.name} vs {SITE.name}{c.publicTenderProof ? ": price, coverage and a cheaper option" : ""}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">{c.angle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={proHref} className={buttonVariants()}>Start Trade Pro — ${PRICING.proAnnual}/yr</Link>
            <Link href={openTenders.length ? "/rfps" : "/pricing"} className={buttonVariants({ variant: "outline" })}>
              {openTenders.length ? `See ${openTenders.length} open tenders free` : "See pricing"}
            </Link>
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">At a glance</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left">
                <th className="p-3 font-medium">Feature</th>
                <th className="p-3 font-semibold text-foreground">{SITE.name}</th>
                <th className="p-3 font-medium text-muted-foreground">{c.name}</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.feature} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{r.feature}</td>
                  <td className="p-3 text-foreground">{r.pmrfp}</td>
                  <td className="p-3 text-muted-foreground">{r.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>

      {sample.length > 0 && (
        <Container className="pb-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            {openTenders.length} public building tenders open on {SITE.name} right now
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Imported every morning from CanadaBuys, the City of Toronto, Quebec&apos;s SEAO and Yukon. Titles and
            deadlines are free to browse; Trade Pro emails you the day a match posts.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {sample.map((r) => (
              <RfpCard key={r.slug} rfp={r} locked />
            ))}
          </div>
        </Container>
      )}

      <section className="bg-secondary/30">
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">What {c.name} is — and where it fits</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-foreground/90">{c.whatItIs}</p>
          <p className="mt-2 text-sm text-muted-foreground"><strong>Best for:</strong> {c.whoFor} · <strong>Pricing:</strong> {c.pricing}</p>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold">{c.name} strengths</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {c.strengths.map((s) => (
                  <li key={s} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{s}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold">Where {SITE.name} wins</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {c.weaknesses.map((w) => (
                  <li key={w} className="flex gap-2"><X className="mt-0.5 size-4 shrink-0 text-teal-600" />{w}</li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      <Container size="narrow" className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
        <Accordion className="mt-4">
          {c.faqs.map((f, i) => (
            <AccordionItem key={i} value={`q${i}`}>
              <AccordionTrigger>{f.q}</AccordionTrigger>
              <AccordionContent>{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="mt-6 text-xs text-muted-foreground">
          Comparison reflects publicly available information as of 2026 and PMRFP&apos;s own positioning.
          Competitor names and trademarks belong to their respective owners. {SITE.name} does not
          guarantee work or outcomes.
        </p>
      </Container>

      <CTASection
        title={`Ready to try the commercial & residential property network?`}
        description={`Free directory listing, or go Pro for $${PRICING.proAnnual} CAD/year.`}
        primaryHref={proHref}
        primaryLabel="Start Trade Pro"
        secondaryHref="/vs"
        secondaryLabel="See all comparisons"
      />
    </>
  );
}
