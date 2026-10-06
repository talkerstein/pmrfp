import type { Metadata } from "next";
import Link from "@/i18n/link";
import { Check, X } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { SpotlightBuyButton } from "@/components/spotlight/buy-button";
import { SPOTLIGHT } from "@/lib/spotlight/config";
import { SPOTLIGHTS } from "@/lib/spotlight/articles";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";

export const metadata: Metadata = {
  title: "Project Spotlight: feature a finished project on PMRFP",
  description: `A permanent, reviewed article about one of your finished commercial projects, published on PMRFP for $${SPOTLIGHT.priceCad} CAD one-time. Clearly labelled as a sponsored Spotlight.`,
  alternates: { canonical: "/spotlight" },
};

const INCLUDED = [
  "A permanent page about one finished project, written by you (400 to 800 words)",
  `Up to ${SPOTLIGHT.maxPhotos} project photos`,
  "A link to your website and to your PMRFP directory profile",
  "Structured data (Article markup) so search engines can read the page properly",
  "Light editing for clarity, and published within 2 business days",
];
const NOT_PROMISED = [
  "Rankings, traffic or leads",
  "Mentions in ChatGPT, Google AI or other AI answers",
  "Publishing anything we can't check, or that isn't your own work",
];
const FAQ = [
  { q: "Who writes the article?", a: "You do. You know the project. We review it, fix typos and unclear sentences, and publish it. If anything needs changing we'll ask you first." },
  { q: "What makes a good Spotlight?", a: "One real, finished project: what the building or client needed, what you did, problems you solved, and the result. Specific numbers (units, square feet, timeline) and real photos help most." },
  { q: "Is it labelled as paid?", a: "Yes. Every Spotlight is marked \"Sponsored Spotlight\" and outbound links are marked as sponsored, as advertising rules require. Readers still see a real project with real photos." },
  { q: "What if you don't publish it?", a: "If we can't publish your article (for example the project can't be verified or the photos aren't yours), you get a full refund." },
  { q: "Do I need a PMRFP account?", a: "No. Pay, then submit the article on the next screen. If you have a free directory listing, we link the Spotlight to it." },
];

export default function SpotlightPage() {
  return (
    <Container size="narrow" className="py-14">
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Project Spotlight", path: "/spotlight" }])} />
      <JsonLd data={faqSchema(FAQ)} />
      <Eyebrow>For trades and suppliers</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Show property managers a project you&apos;re proud of</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        A Project Spotlight is a permanent article on PMRFP about one finished job: the building, the problem, what you did and how it turned out. It sits next to the RFP board that property managers and condo boards already use to find contractors, and it links back to your website and your directory profile.
      </p>
      <SpotlightBuyButton className="mt-7" />
      <p className="mt-2 text-sm text-muted-foreground">One-time payment. Full refund if we can&apos;t publish it.</p>

      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold">What you get</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {INCLUDED.map((i) => (
              <li key={i} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-teal-600" />{i}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold">What we don&apos;t promise</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {NOT_PROMISED.map((i) => (
              <li key={i} className="flex gap-2"><X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{i}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>Pay securely through Stripe.</li>
          <li>Submit your write-up and photos on the next screen (about 5 minutes).</li>
          <li>We review it and publish within 2 business days, then email you the link to share.</li>
        </ol>
      </section>

      {SPOTLIGHTS.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">Recent Spotlights</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {SPOTLIGHTS.map((s) => (
              <li key={s.slug}><Link className="font-medium underline" href={`/spotlight/${s.slug}`}>{s.title}</Link> <span className="text-muted-foreground">· {s.company}, {s.city}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Questions</h2>
        <dl className="mt-3 space-y-4 text-sm">
          {FAQ.map((f) => (
            <div key={f.q}><dt className="font-medium">{f.q}</dt><dd className="mt-1 text-muted-foreground">{f.a}</dd></div>
          ))}
        </dl>
      </section>
    </Container>
  );
}
