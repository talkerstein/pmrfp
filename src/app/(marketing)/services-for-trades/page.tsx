import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CreditCard, FileText, Globe, Info, MapPin, PenTool, Receipt, Smartphone } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { Section, SectionHeading } from "@/components/public/section";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Services for Trades: Card Payments and a Credible Website",
  description:
    "Two services we recommend to trades on PMRFP: taking card payments on the job with Cleverpays, and a website, brand and Google profile from Talkerstein Consulting Group.",
  alternates: { canonical: "/services-for-trades" },
};

/**
 * Partner services for trades. Both companies have a business relationship
 * with PMRFP, disclosed on the page. Cleverpays is placed as part of a paid
 * relationship, so its outbound links are rel="sponsored"; Talkerstein is
 * PMRFP's affiliate. Only claims each company's own site makes.
 */
const PARTNERS = [
  {
    name: "Cleverpays",
    headline: "Take card payments on the job",
    blurb:
      "Payment processing for Canadian businesses, in English and French. For trades, the useful part is getting paid before you leave the site instead of chasing a cheque.",
    serves: "Canada",
    href: "https://cleverpays.ca/payment-processing",
    rel: "sponsored noopener",
    cta: "Visit Cleverpays",
    points: [
      { icon: Smartphone, t: "In-person payments for mobile teams", d: "Portable card terminals your crew can take to the job.", href: "https://cleverpays.ca/payment-processing/card-present-payments" },
      { icon: CreditCard, t: "Card payments by phone or browser", d: "A virtual terminal for taking a customer's card remotely, no device needed.", href: "https://cleverpays.ca/payment-processing/virtual-terminal" },
      { icon: Receipt, t: "Invoices customers can pay", d: "Send an invoice with a way to pay it when it arrives.", href: "https://cleverpays.ca/payment-processing/einvoicing" },
      { icon: FileText, t: "Statement review", d: "Send your current processing statement and ask a specialist to go through the charges.", href: "https://cleverpays.ca/statement-analysis" },
    ],
  },
  {
    name: "Talkerstein Consulting Group",
    headline: "Look credible online",
    blurb:
      "Property managers check you out before they call. Talkerstein sets up the pieces that make a trade look established, done for you. Based in Toronto.",
    serves: "Based in Toronto",
    href: "https://talkerstein.com",
    rel: "noopener",
    cta: "Visit Talkerstein",
    points: [
      { icon: Globe, t: "A website that turns visits into calls", d: "Shows your work, services and credentials.", href: "/resources/grow" },
      { icon: PenTool, t: "Brand and logo", d: "A clean identity property managers take seriously.", href: "/resources/grow" },
      { icon: MapPin, t: "Google Business Profile", d: "Set up so local buyers find you when they search your trade.", href: "/resources/grow" },
      { icon: FileText, t: "Help with public tender bids", d: "Support preparing a bid on a government tender.", href: "/rfps" },
    ],
  },
] as const;

export default function ServicesForTradesPage() {
  return (
    <>
      <section className="border-b border-border bg-background">
        <Container className="py-20 sm:py-24">
          <div className="max-w-3xl">
            <Eyebrow>Services for trades</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              Get paid on the job. Look the part online.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Winning the work is half of it. These are two services we point trades to: taking card
              payments on site, and a website and Google profile that make property managers pick up
              the phone.
            </p>
          </div>
          <div className="mt-8 flex max-w-3xl items-start gap-3 rounded-lg border border-border bg-secondary/40 px-5 py-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-medium text-foreground">Disclosure:</span> PMRFP has a business
              relationship with both companies on this page. Talkerstein Consulting Group is an
              affiliate of PMRFP.
            </p>
          </div>
        </Container>
      </section>

      {PARTNERS.map((p, i) => (
        <Section key={p.name} tone={i % 2 ? "muted" : "default"}>
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-teal-700">{p.serves}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{p.headline}</h2>
              <p className="mt-2 text-lg font-medium text-indigo">{p.name}</p>
              <p className="mt-4 leading-relaxed text-muted-foreground">{p.blurb}</p>
              <a
                href={p.href}
                rel={p.rel}
                target="_blank"
                className={cn(buttonVariants({ size: "lg", variant: "accent" }), "mt-6")}
              >
                {p.cta} <ArrowRight className="size-4" />
              </a>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {p.points.map((pt) => {
                const external = pt.href.startsWith("http");
                return (
                  <li key={pt.t} className="rounded-xl border border-border bg-card p-5">
                    <pt.icon className="size-5 text-teal-600" />
                    <p className="mt-3 font-semibold text-foreground">
                      {external ? (
                        <a href={pt.href} rel={p.rel} target="_blank" className="hover:underline">
                          {pt.t}
                        </a>
                      ) : (
                        <Link href={pt.href} className="hover:underline">
                          {pt.t}
                        </Link>
                      )}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pt.d}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>
      ))}

      <Section>
        <SectionHeading
          eyebrow="Sell to contractors?"
          title="Get in front of trades across Canada and the U.S."
          description="If your company sells to commercial trades, like insurance, bonding, software or equipment, talk to us about a spot on this page."
        />
        <Link href="/contact" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "mt-8")}>
          Contact us <ArrowRight className="size-4" />
        </Link>
      </Section>
    </>
  );
}
