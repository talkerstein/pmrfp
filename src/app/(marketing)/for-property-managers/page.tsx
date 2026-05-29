import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  Filter,
  Clock,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import {
  Section,
  SectionHeading,
  CTASection,
} from "@/components/public/section";
import { CategoryGrid } from "@/components/public/category-grid";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCategories } from "@/lib/data/taxonomy";
import { COPY, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "For Property Managers, Builders & Owners",
  description:
    "Post your project, find vendors by category and region, and compare interested companies — without committing to a hiring decision upfront.",
};

const STEPS = [
  {
    icon: ClipboardList,
    title: "Post your project",
    body: "Describe the work, set your category, region, and property type, and publish a clear RFP in minutes. No drawn-out forms.",
  },
  {
    icon: Filter,
    title: "Find vendors by category and region",
    body: "Browse a focused directory of trades and service companies, filtered to exactly the work and locations you need covered.",
  },
  {
    icon: Clock,
    title: "Reduce time wasted searching",
    body: "Stop chasing referrals and cold-calling contractors. Let qualified companies come to you and review interest in one place.",
  },
];

export default async function ForPropertyManagersPage() {
  const categories = await getCategories();

  return (
    <>
      <section className="border-b border-border bg-background">
        <Container className="py-20 sm:py-28">
          <div className="max-w-3xl">
            <Eyebrow>For property managers, builders &amp; owners</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              Post a project. Find the right vendors. No pressure to hire.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {SITE.name} gives property managers, builders, and building owners
              a simple way to post commercial property needs, discover relevant
              trades, and compare interested companies — without committing to a
              hiring decision upfront.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                Post an RFP
              </Link>
              <Link
                href="/directory"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                Browse the directory
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Section>
        <SectionHeading
          eyebrow="How it works"
          title="A focused way to source commercial trades"
        />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.title}>
              <CardHeader>
                <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">
                  <s.icon className="size-5" />
                </span>
                <CardTitle className="mt-3">{s.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="leading-relaxed text-muted-foreground">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Directory"
          title="Find vendors by category and region"
          description="Explore trades across the categories that keep commercial properties running, then filter to your region."
        />
        <div className="mt-10">
          <CategoryGrid categories={categories} limit={12} />
        </div>
        <div className="mt-8">
          <Link
            href="/directory"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            View full directory
          </Link>
        </div>
      </Section>

      <Section>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">
                <Lock className="size-5" />
              </span>
              <CardTitle className="mt-3">Keep details private if needed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed text-muted-foreground">
                You control contact visibility. Share your details openly to
                speed things up, or keep them private and review interested
                vendors before deciding who to connect with.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">
                <ShieldCheck className="size-5" />
              </span>
              <CardTitle className="mt-3">No obligation to hire</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed text-muted-foreground">
                {COPY.pmValue}
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="mt-10 max-w-3xl">
          <TrustDisclaimer />
        </div>
      </Section>

      <CTASection
        title="Find the right vendors for your next commercial project."
        description="Post an RFP for free, or browse the directory to see who serves your region."
        primaryHref="/sign-up"
        primaryLabel="Post an RFP"
        secondaryHref="/directory"
        secondaryLabel="Browse the directory"
      />
    </>
  );
}
