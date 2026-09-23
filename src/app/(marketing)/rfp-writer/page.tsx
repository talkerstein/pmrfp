import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/container";
import { Markdown } from "@/components/public/markdown";
import { RfpWizard } from "@/components/rfp-writer/wizard";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { getSession } from "@/lib/access/access";
import { getCategories, getPropertyTypes } from "@/lib/data/taxonomy";
import { RFP_TEMPLATES } from "@/lib/seo/rfp-templates";
import { SITE } from "@/lib/site";

const TITLE = "Free RFP Writer for Property Managers";
const DESCRIPTION =
  "Answer four quick questions and get a complete commercial property RFP — scope, insurance and WSIB requirements, submission instructions and bid scoring — ready to send or post free. Built for Canadian property managers.";

export const metadata: Metadata = {
  title: `${TITLE} (Canada)`,
  description: DESCRIPTION,
  alternates: { canonical: "/rfp-writer" },
};

const FAQS = [
  {
    q: "Is the RFP writer really free?",
    a: "Yes. Anyone can write RFPs from our expert templates. With a free property manager account, AI also tailors each RFP to your specific building and job. Posting on PMRFP to get bids is free for property managers too.",
  },
  {
    q: "Do I need an account?",
    a: "No account is needed to write an RFP from our templates. A free property manager account adds AI tailoring and lets you post the RFP on PMRFP so trades in your region can bid.",
  },
  {
    q: "Can I use the RFP outside PMRFP?",
    a: "Yes. It's yours: send it to your own vendor list, attach it to an email or paste it into your company template.",
  },
  {
    q: "Is this legal advice?",
    a: "No. It's a well-structured starting draft based on how Canadian property managers run competitive bids. Review it before sending, and have a lawyer review the contract you sign with the winning bidder on larger or multi-year work.",
  },
];

const ABOUT = `## What the RFP writer gives you

A complete request for proposal that gets **real, comparable bids**, because every contractor prices the same job:

- **A clear title and summary** that tell a busy contractor in two seconds whether the job is for them.
- **A full scope**: the property, the work, what's included, what's excluded, and add-alternates priced separately.
- **Bidder requirements**: liability insurance with you as additional insured, WSIB or provincial WCB clearance, the licences the trade needs, and references.
- **Submission instructions** with your deadline, site visit, question cut-off and budget guidance.
- **Published scoring weights**, so bidders know how you'll decide and your board can see why you picked the winner.
- **Questions for bidders** that separate strong contractors from weak ones for that exact job.

## How it works

1. Pick the trade and describe the job in plain words.
2. Tell us about the property: type, city, size, whether it's occupied.
3. Set the timing, bid deadline and (optionally) your budget.
4. Choose the insurance level, site visit and what matters most in picking a winner.

It starts from our [expert RFP templates](/rfp-templates) for that trade and tailors them to your answers. Want the reasoning behind each section? Read [how to post an RFP that gets real bids](/resources/how-to-post-a-quality-rfp).`;

export default async function RfpWriterPage() {
  const [categories, propertyTypes, session] = await Promise.all([
    getCategories(),
    getPropertyTypes(),
    getSession(),
  ]);
  const postPath = "/pm-dashboard/rfps/new?draft=1";
  const isPm = session?.profile.primary_role === "property_manager";
  const postHref = isPm
    ? postPath
    : `/sign-up?role=property_manager&next=${encodeURIComponent(postPath)}`;
  const templates = RFP_TEMPLATES.map((t) => ({ slug: t.slug, name: t.name, tradeSlug: t.tradeSlug }));

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "RFP Writer", path: "/rfp-writer" },
        ])}
      />
      <JsonLd data={faqSchema(FAQS)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: `${SITE.name} RFP Writer`,
          url: `${SITE.url}/rfp-writer`,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any",
          description: DESCRIPTION,
          offers: { "@type": "Offer", price: "0", priceCurrency: "CAD" },
          inLanguage: "en-CA",
        }}
      />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Free tool · For property managers</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Write a complete RFP in about two minutes.
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Answer four quick questions. Get the scope, insurance and WSIB requirements, submission
            instructions and bid scoring, ready to send to your vendors or post free on {SITE.name}.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo px-3 py-1 text-sm text-white">
            <span className="size-1.5 rounded-full bg-teal-300" />
            Property managers: sign in and our AI tailors it to your exact building — free.
          </p>
        </Container>
      </section>

      <Container className="py-10">
        <RfpWizard categories={categories} propertyTypes={propertyTypes} templates={templates} postHref={postHref} />
      </Container>

      <Container size="narrow" className="pb-16">
        <Markdown content={ABOUT} />
        <h2 className="mt-10 text-2xl font-semibold tracking-tight">FAQ</h2>
        <div className="mt-4 divide-y divide-border border-y border-border">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none font-medium">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Prefer to start from a finished example?{" "}
          <Link href="/rfp-templates" className="font-medium text-teal-700 hover:underline">Browse the RFP templates</Link>.
        </p>
      </Container>
    </>
  );
}
