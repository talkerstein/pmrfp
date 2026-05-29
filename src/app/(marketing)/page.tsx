import Link from "next/link";
import { Container, Eyebrow } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { COPY, PRICING, SITE } from "@/lib/site";

const STATS = [
  "Canada-first",
  "Commercial property focused",
  "Vendor directory",
  "RFP visibility",
];

export default function HomePage() {
  return (
    <>
      <section className="border-b border-border bg-background">
        <Container className="py-20 sm:py-28">
          <div className="max-w-3xl">
            <Eyebrow>Commercial property RFP network</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              Find Commercial Property RFPs and Get Discovered by Property
              Decision-Makers
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {SITE.name} helps Canadian trades, contractors, and service
              companies get listed, monitor commercial property opportunities,
              and connect with property managers, builders, and building owners.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                Join as a Trade Company
              </Link>
              <Link
                href="/for-property-managers"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                Post an RFP
              </Link>
            </div>
            <p className="mt-5 max-w-xl text-xs text-muted-foreground">
              {COPY.disclaimer}
            </p>
          </div>
        </Container>
      </section>

      <section className="border-b border-border bg-secondary/50">
        <Container className="flex flex-wrap items-center gap-x-8 gap-y-3 py-5">
          {STATS.map((s) => (
            <span
              key={s}
              className="flex items-center gap-2 text-sm font-medium text-slate-ink"
            >
              <span className="size-1.5 rounded-full bg-gold-500" />
              {s}
            </span>
          ))}
        </Container>
      </section>

      <section>
        <Container className="py-20">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                t: "Get Listed",
                d: "Build your company profile, choose your categories and regions, and become easy to find for property decision-makers.",
              },
              {
                t: "Find RFPs",
                d: "Monitor commercial property opportunities across key categories and regions in one focused place.",
              },
              {
                t: "Express Interest",
                d: "Signal interest on opportunities that match your services and track every submission.",
              },
            ].map((c) => (
              <div
                key={c.t}
                className="rounded-lg border border-border bg-card p-6"
              >
                <h3 className="text-lg font-semibold text-foreground">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {c.d}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-t border-border bg-navy text-white">
        <Container className="flex flex-col items-start gap-6 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Get listed before your competitors do.
            </h2>
            <p className="mt-2 text-slate-300">
              Free directory listing, or go Pro for ${PRICING.proAnnual} CAD/year.{" "}
              {PRICING.earlyBirdNote}
            </p>
          </div>
          <Link
            href="/pricing"
            className={buttonVariants({ size: "lg", variant: "secondary" })}
          >
            Join {SITE.name}
          </Link>
        </Container>
      </section>
    </>
  );
}
