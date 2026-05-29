import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
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
import { VERTICALS, getVertical } from "@/lib/seo/verticals";
import { SITE } from "@/lib/site";

export const revalidate = 86400;

export async function generateStaticParams() {
  return VERTICALS.map((v) => ({ vertical: v.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ vertical: string }>;
}): Promise<Metadata> {
  const { vertical } = await params;
  const v = getVertical(vertical);
  if (!v) return { title: "Not found" };
  return {
    title: v.metaTitle,
    description: v.metaDescription,
    alternates: { canonical: `/for/${v.slug}` },
  };
}

export default async function VerticalPage({
  params,
}: {
  params: Promise<{ vertical: string }>;
}) {
  const { vertical } = await params;
  const v = getVertical(vertical);
  if (!v) notFound();

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Solutions", path: "/for" },
        { name: v.name, path: `/for/${v.slug}` },
      ])} />
      <JsonLd data={faqSchema(v.faqs)} />

      <section className="border-b border-border bg-background">
        <Container className="py-16 sm:py-20">
          <Eyebrow>For {v.who}</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            {v.headline}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{v.positioning}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={v.cta.href} className={buttonVariants({ size: "lg" })}>{v.cta.label}</Link>
            <Link href={v.secondaryCta.href} className={buttonVariants({ size: "lg", variant: "outline" })}>
              {v.secondaryCta.label}
            </Link>
          </div>
        </Container>
      </section>

      <section className="bg-secondary/30">
        <Container className="py-14">
          <h2 className="text-2xl font-semibold tracking-tight">The problem today</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {v.pains.map((p) => (
              <li key={p} className="rounded-lg border border-border bg-card p-4 text-sm text-foreground/90">{p}</li>
            ))}
          </ul>
        </Container>
      </section>

      <Container className="py-14">
        <h2 className="text-2xl font-semibold tracking-tight">How {SITE.name} helps</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {v.valueProps.map((vp) => (
            <div key={vp.title} className="rounded-lg border border-border bg-card p-6">
              <Check className="size-5 text-success" />
              <h3 className="mt-3 text-base font-semibold">{vp.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{vp.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          {v.features.map((f) => (
            <span key={f} className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium text-slate-ink">
              {f}
            </span>
          ))}
        </div>
      </Container>

      <section className="border-t border-border">
        <Container size="narrow" className="py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <Accordion className="mt-4">
            {v.faqs.map((f, i) => (
              <AccordionItem key={i} value={`q${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="mt-8"><TrustDisclaimer /></div>
        </Container>
      </section>

      <CTASection
        title={v.headline}
        description={v.positioning}
        primaryHref={v.cta.href}
        primaryLabel={v.cta.label}
        secondaryHref={v.secondaryCta.href}
        secondaryLabel={v.secondaryCta.label}
      />
    </>
  );
}
