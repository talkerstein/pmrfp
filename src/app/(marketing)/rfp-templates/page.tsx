import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Download, Sparkles } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { JsonLd, breadcrumbSchema, itemListSchema } from "@/lib/seo/jsonld";
import { RFP_TEMPLATES } from "@/lib/seo/rfp-templates";
import { SITE } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Free RFP Templates for Commercial & Residential Property (Canada)",
  description:
    "20 ready-to-use RFP templates for Canadian property managers — roofing, HVAC, snow, paving, painting, elevator service, mold, and more. Customize and post in 60 seconds.",
  alternates: { canonical: "/rfp-templates" },
};

export default function RfpTemplatesIndexPage() {
  // Group templates by trade for the secondary view.
  const byTrade = RFP_TEMPLATES.reduce<Record<string, typeof RFP_TEMPLATES>>((acc, t) => {
    (acc[t.tradeName] ??= []).push(t);
    return acc;
  }, {});
  const tradeNames = Object.keys(byTrade).sort();

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "RFP Templates", path: "/rfp-templates" },
        ])}
      />
      <JsonLd
        data={itemListSchema(
          "Commercial & Residential RFP Templates",
          RFP_TEMPLATES.map((t) => ({ name: t.name, path: `/rfp-templates/${t.slug}` })),
        )}
      />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-14 sm:py-16">
          <Eyebrow>RFP Templates</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Free RFP templates — go from zero to posted in 60 seconds
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Stop writing RFPs from scratch. These 20 templates cover the most common
            commercial and residential property jobs Canadian PMs put out to bid — pre-filled
            scope, requirements, timeline, and evaluation criteria. Click any template, customize
            in seconds, and post for free.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-3 py-1 font-medium text-teal-ink">
              <FileText className="size-3.5" /> 20 templates
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-medium text-foreground/80">
              <Sparkles className="size-3.5" /> Pre-filled scope + requirements
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-medium text-foreground/80">
              <Download className="size-3.5" /> Free PDF download
            </span>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Want it written for your exact job?{" "}
            <Link href="/rfp-writer" className="font-semibold text-teal-700 hover:underline">
              Use the free RFP Writer →
            </Link>{" "}
            Four questions, two minutes.
          </p>
        </Container>
      </section>

      <Container className="py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RFP_TEMPLATES.map((t) => (
            <Link
              key={t.slug}
              href={`/rfp-templates/${t.slug}`}
              className="group flex flex-col rounded-xl border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
            >
              <Eyebrow>{t.tradeName}</Eyebrow>
              <h2 className="mt-3 text-lg font-semibold leading-snug group-hover:text-teal-ink">
                {t.name.replace(/ RFP Template$/, "")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.pitch}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-teal-ink">
                Use this template{" "}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </Container>

      <section className="border-t border-border bg-secondary/30">
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Browse by trade</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Looking for a specific kind of work? Jump straight to the templates for that trade.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tradeNames.map((trade) => (
              <div key={trade} className="rounded-lg border border-border bg-card p-5">
                <h3 className="text-sm font-semibold tracking-tight">{trade}</h3>
                <ul className="mt-3 space-y-1.5">
                  {byTrade[trade].map((t) => (
                    <li key={t.slug}>
                      <Link
                        href={`/rfp-templates/${t.slug}`}
                        className="text-sm text-muted-foreground hover:text-teal-ink"
                      >
                        {t.name.replace(/ RFP Template$/, "")}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
            From template to posted RFP in 60 seconds
          </h2>
          <ol className="mt-5 grid gap-5 sm:grid-cols-3">
            <li>
              <div className="text-xs font-semibold uppercase tracking-wide text-teal-ink">
                Step 1
              </div>
              <h3 className="mt-1 text-base font-semibold">Pick a template</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Browse the 20 most common commercial and residential property jobs. Each is a real,
                ready-to-use scope of work — not a fill-in-the-blank stub.
              </p>
            </li>
            <li>
              <div className="text-xs font-semibold uppercase tracking-wide text-teal-ink">
                Step 2
              </div>
              <h3 className="mt-1 text-base font-semibold">Customize in seconds</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Click &ldquo;Use this template&rdquo; — the title, scope, and requirements get
                pre-filled into the post-an-RFP form. Edit anything that doesn&rsquo;t fit and save.
              </p>
            </li>
            <li>
              <div className="text-xs font-semibold uppercase tracking-wide text-teal-ink">
                Step 3
              </div>
              <h3 className="mt-1 text-base font-semibold">Get bids from real trades</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Your RFP goes live on {SITE.name}. Qualified Canadian trades see it and express
                interest — you pick who to talk to. Posting is free.
              </p>
            </li>
          </ol>
        </div>

        <div className="mt-8">
          <TrustDisclaimer />
        </div>
      </Container>

      <CTASection
        title="Got a project? There's a template for that."
        description={`Pick a template above, or post your own RFP from scratch on ${SITE.name}. Either way, qualified Canadian trades respond — free to post.`}
        primaryHref="/sign-up?role=property_manager"
        primaryLabel="Post an RFP"
        secondaryHref="/directory"
        secondaryLabel="Browse the directory"
      />
    </>
  );
}
