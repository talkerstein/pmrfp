import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  CheckSquare,
  ClipboardList,
  Download,
  FileText,
  HelpCircle,
  KeySquare,
  Scale,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { buttonVariants } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { RFP_TEMPLATES, getRfpTemplate } from "@/lib/seo/rfp-templates";
import { COST_GUIDES } from "@/lib/seo/cost-guides";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

export const revalidate = 86400;

export async function generateStaticParams() {
  return RFP_TEMPLATES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = getRfpTemplate(slug);
  if (!t) return { title: "Not found" };
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: { canonical: `/rfp-templates/${t.slug}` },
  };
}

export default async function RfpTemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = getRfpTemplate(slug);
  if (!t) notFound();

  const costGuide = t.costGuideSlug
    ? COST_GUIDES.find((g) => g.slug === t.costGuideSlug)
    : undefined;

  const related = RFP_TEMPLATES.filter(
    (other) => other.slug !== t.slug && other.tradeSlug === t.tradeSlug,
  ).slice(0, 3);

  // Single CTA that does the right thing regardless of auth state.
  // /use-template/[slug] is a tiny server route that branches on session.
  const useTemplateHref = `/use-template/${t.slug}`;
  const signUpHref = `/sign-up?role=property_manager&next=${encodeURIComponent(
    `/pm-dashboard/rfps/new?template=${t.slug}`,
  )}`;
  const pdfHref = `/rfp-templates/${t.slug}/print`;

  // HowTo-style article schema (use Article — broadly understood) + FAQ + Breadcrumb.
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: t.query,
    description: t.metaDescription,
    step: t.timeline.map((phase, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: phase.label,
      text: phase.detail,
    })),
  };

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "RFP Templates", path: "/rfp-templates" },
          { name: t.name, path: `/rfp-templates/${t.slug}` },
        ])}
      />
      <JsonLd data={faqSchema(t.faqs)} />
      <JsonLd data={articleSchema} />

      {/* HERO */}
      <section className="border-b border-border bg-background">
        <Container className="py-14 sm:py-16">
          <Eyebrow>{t.tradeName} · RFP template</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            {t.name}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t.pitch}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={useTemplateHref}
              className={buttonVariants({ size: "lg" })}
            >
              Use this template <ArrowRight className="size-4" />
            </Link>
            <Link
              href={pdfHref}
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              <Download className="size-4" /> Download PDF
            </Link>
            <Link
              href={signUpHref}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Don&rsquo;t have an account? Sign up free →
            </Link>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <FactPill icon={<Sparkles className="size-4" />} label="Pre-filled scope + requirements" />
            <FactPill icon={<FileText className="size-4" />} label={`Tagged to /trades/${t.tradeSlug}`} />
            <FactPill icon={<Calendar className="size-4" />} label={`${t.timeline.length}-phase timeline`} />
          </div>
        </Container>
      </section>

      {/* WHEN TO USE */}
      <Container className="py-12">
        <div className="rounded-2xl border border-border bg-secondary/30 p-6 sm:p-8">
          <Eyebrow>When to use this template</Eyebrow>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-foreground/90">
            {t.whenToUse}
          </p>
        </div>
      </Container>

      {/* SAMPLE TITLE + SUMMARY */}
      <Container className="py-6">
        <h2 className="text-2xl font-semibold tracking-tight">Sample RFP title &amp; summary</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          What auto-fills when you click &ldquo;Use this template&rdquo; — you can edit anything.
        </p>
        <div className="mt-5 overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-secondary/40 px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Title
            </span>
            <p className="mt-1 text-base font-semibold text-foreground">{t.titleSample}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Summary
            </span>
            <p className="mt-1 text-sm leading-relaxed text-foreground/90">{t.summarySample}</p>
          </div>
        </div>
      </Container>

      {/* SCOPE */}
      <section className="border-t border-border bg-secondary/20">
        <Container className="py-12">
          <SectionHeading icon={<ClipboardList className="size-5" />} title="Scope of work" />
          <div className="mt-5 rounded-xl border border-border bg-card p-6 sm:p-8">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
              {t.scope}
            </pre>
          </div>
        </Container>
      </section>

      {/* REQUIREMENTS */}
      <Container className="py-12">
        <SectionHeading icon={<ShieldCheck className="size-5" />} title="Standard requirements" />
        <div className="mt-5 rounded-xl border border-border bg-card p-6 sm:p-8">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
            {t.requirements}
          </pre>
        </div>
      </Container>

      {/* TIMELINE */}
      <section className="border-t border-border bg-secondary/20">
        <Container className="py-12">
          <SectionHeading icon={<Calendar className="size-5" />} title="Suggested timeline" />
          <ol className="mt-6 grid gap-3 sm:grid-cols-2">
            {t.timeline.map((phase, i) => (
              <li
                key={phase.label}
                className="flex gap-4 rounded-lg border border-border bg-card p-5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-ink">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{phase.label}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {phase.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* SITE ACCESS */}
      <Container className="py-12">
        <SectionHeading icon={<KeySquare className="size-5" />} title="Site access &amp; logistics" />
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-foreground/90">{t.siteAccess}</p>
      </Container>

      {/* QUESTIONS TO ASK BIDDERS */}
      <section className="border-t border-border bg-secondary/20">
        <Container className="py-12">
          <SectionHeading
            icon={<HelpCircle className="size-5" />}
            title="Questions every bidder should answer"
          />
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Ask all bidders the same questions so you get apples-to-apples responses.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {t.questions.map((q, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-lg border border-border bg-card p-5 text-sm"
              >
                <CheckSquare className="size-4 shrink-0 text-teal-ink" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* EVALUATION CRITERIA */}
      <Container className="py-12">
        <SectionHeading icon={<Scale className="size-5" />} title="Evaluation criteria" />
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          How you&rsquo;ll weigh bids when you receive them.
        </p>
        <ol className="mt-6 grid gap-2 sm:grid-cols-2">
          {t.evaluationCriteria.map((c, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-lg border border-border bg-card p-4 text-sm"
            >
              <span className="text-sm font-semibold text-teal-ink">{i + 1}.</span>
              <span>{c}</span>
            </li>
          ))}
        </ol>
      </Container>

      {/* COST GUIDE CROSS-LINK */}
      {costGuide && (
        <section className="border-t border-border bg-indigo text-white">
          <Container className="py-10">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Eyebrow className="text-teal">Pair with the cost guide</Eyebrow>
                <h2 className="mt-2 text-xl font-semibold sm:text-2xl">
                  {costGuide.headline.replace(/\?$/, "")}
                </h2>
                <p className="mt-1 text-sm text-indigo-100/80">
                  Read what a typical {costGuide.tradeName.toLowerCase()} job runs in Canada before you
                  post — so you know the budget range to expect.
                </p>
              </div>
              <Link
                href={`/cost-guides/${costGuide.slug}`}
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white",
                )}
              >
                See the cost guide <ArrowRight className="size-4" />
              </Link>
            </div>
          </Container>
        </section>
      )}

      {/* MATCHING TRADES */}
      <Container className="py-12">
        <SectionHeading icon={<Wrench className="size-5" />} title="Trades who match this work" />
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Once you post, these are the kind of vendors who&rsquo;ll see your RFP and express interest.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/trades/${t.tradeSlug}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Browse {t.tradeName} companies <ArrowRight className="size-4" />
          </Link>
          <Link href="/directory" className={buttonVariants({ variant: "outline" })}>
            Full directory
          </Link>
        </div>
      </Container>

      {/* FAQS */}
      <section className="border-t border-border bg-secondary/20">
        <Container size="narrow" className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Common questions</h2>
          <Accordion className="mt-5">
            {t.faqs.map((f, i) => (
              <AccordionItem key={i} value={`q${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="mt-8">
            <TrustDisclaimer />
          </div>
        </Container>
      </section>

      {/* RELATED TEMPLATES */}
      {related.length > 0 && (
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            More {t.tradeName} RFP templates
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/rfp-templates/${r.slug}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
              >
                <Eyebrow>{r.tradeName}</Eyebrow>
                <h3 className="mt-3 text-base font-semibold leading-snug group-hover:text-teal-ink">
                  {r.name.replace(/ RFP Template$/, "")}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.pitch}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-ink">
                  See template{" "}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      )}

      <CTASection
        title={`Ready to post your ${t.tradeName.toLowerCase()} RFP?`}
        description={`Click below to start with the ${t.name.replace(
          / RFP Template$/,
          "",
        )} template pre-filled. Customize anything that doesn't fit your project and post free.`}
        primaryHref={useTemplateHref}
        primaryLabel="Use this template"
        secondaryHref="/rfp-templates"
        secondaryLabel="See all templates"
      />
    </>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-teal-100 text-teal-ink">
        {icon}
      </span>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

function FactPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <span className="text-teal-ink">{icon}</span>
      <span className="text-foreground/90">{label}</span>
    </div>
  );
}
