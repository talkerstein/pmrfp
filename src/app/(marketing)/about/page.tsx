import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/container";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { JsonLd, organizationSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import {
  OGL_CANADA_ATTRIBUTION,
  OGL_NS_ATTRIBUTION,
  OGL_TORONTO_ATTRIBUTION,
  OGL_YUKON_ATTRIBUTION,
  SAM_ATTRIBUTION,
  SEAO_ATTRIBUTION,
} from "@/lib/tenders/sources";

export const metadata: Metadata = {
  title: "About PMRFP: Who Runs It and Where the Data Comes From",
  description:
    "PMRFP is a board of commercial property RFPs and public building tenders in Canada and the U.S., plus a directory of trades. Who runs it, where the tenders come from, and how it works.",
  alternates: { canonical: "/about" },
};

/** Where the public tenders come from, with each source's own licence line. */
const SOURCES = [
  { name: "CanadaBuys", what: "Government of Canada tenders and contract awards", licence: OGL_CANADA_ATTRIBUTION },
  { name: "City of Toronto", what: "City tenders and awarded contracts", licence: OGL_TORONTO_ATTRIBUTION },
  { name: "SEAO (Quebec)", what: "Quebec public tenders and awards, published in French", licence: SEAO_ATTRIBUTION },
  { name: "Government of Yukon", what: "Yukon tenders", licence: OGL_YUKON_ATTRIBUTION },
  { name: "Nova Scotia", what: "Past public contracts", licence: OGL_NS_ATTRIBUTION },
  { name: "SAM.gov", what: "U.S. federal building and facility contract opportunities", licence: SAM_ATTRIBUTION },
];

export default function AboutPage() {
  const address = process.env.BUSINESS_MAILING_ADDRESS?.trim();
  return (
    <Container size="narrow" className="py-14">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "AboutPage", name: "About PMRFP", mainEntity: organizationSchema() }} />
      <Eyebrow>About</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">About PMRFP</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        PMRFP puts commercial property work in one place: RFPs posted by property managers, public
        building tenders from government buyers in Canada and the U.S., and a directory of the trades
        who do the work.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">Who runs PMRFP</h2>
        <p className="mt-3 leading-relaxed text-foreground/90">
          PMRFP is built in Toronto by the team behind{" "}
          <a href={SITE.sisterBrand.url} className="text-teal-700 hover:underline">{SITE.sisterBrand.name}</a>, with{" "}
          <a href="https://talkerstein.com" className="text-teal-700 hover:underline">Talkerstein Consulting Group</a>, an
          affiliate of PMRFP. The founder is R. Talkar.
        </p>
        <p className="mt-3 leading-relaxed text-foreground/90">
          Questions, corrections or a notice we got wrong: email{" "}
          <a href={`mailto:${SITE.email}`} className="text-teal-700 hover:underline">{SITE.email}</a> or use the{" "}
          <Link href="/contact" className="text-teal-700 hover:underline">contact form</Link>.
          {address ? ` Mail: ${address}.` : ""}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">Where the public tenders come from</h2>
        <p className="mt-3 leading-relaxed text-foreground/90">
          We check each source every day, sort each notice by trade and region, and link to the official
          notice. You always bid through the buyer&apos;s own portal, never through PMRFP.
        </p>
        <ul className="mt-5 divide-y divide-border rounded-xl border border-border">
          {SOURCES.map((s) => (
            <li key={s.name} className="p-4">
              <p className="font-semibold text-foreground">{s.name}</p>
              <p className="text-sm text-muted-foreground">{s.what}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.licence}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 leading-relaxed text-foreground/90">
          We also publish what the award data shows: the{" "}
          <Link href="/reports/public-building-contracts" className="text-teal-700 hover:underline">
            public building contracts report
          </Link>{" "}
          and the{" "}
          <Link href="/contract-winners" className="text-teal-700 hover:underline">companies that win most often</Link>.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">How the directory works</h2>
        <p className="mt-3 leading-relaxed text-foreground/90">
          Companies list themselves for free and choose the trades and areas they serve. A company marked
          verified has been reviewed by the PMRFP team. Otherwise we don&apos;t check licences or insurance,
          so confirm them directly for your project. Property managers, builders and owners post RFPs at
          no cost. Trades pay only if they choose a{" "}
          <Link href="/pricing" className="text-teal-700 hover:underline">paid plan</Link>, like Trade Pro, which
          opens full RFP details and a daily email of new matches.
        </p>
      </section>

      <TrustDisclaimer className="mt-10" />
    </Container>
  );
}
