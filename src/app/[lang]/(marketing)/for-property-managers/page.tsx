import type { Metadata } from "next";
import Image from "next/image";
import Link from "@/i18n/link";
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
import { ReferBanner } from "@/components/public/refer-banner";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCategories } from "@/lib/data/taxonomy";
import { PHOTOS } from "@/lib/photos";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).sales.forPms.meta;
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/for-property-managers"),
  };
}

/** Step order and icons; the words live in messages/sales.ts (forPms.how.steps). */
const STEPS = [
  { icon: ClipboardList, key: "post" },
  { icon: Filter, key: "find" },
  { icon: Clock, key: "time" },
] as const;

export default async function ForPropertyManagersPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("sales");
  const p = t.forPms;
  const categories = await getCategories();

  return (
    <>
      <section className="border-b border-border bg-background">
        <Container className="grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="max-w-3xl">
            <Eyebrow>{p.eyebrow}</Eyebrow>
            <Badge className="mt-5 bg-teal-100 text-teal-700 hover:bg-teal-100">
              {p.badge}
            </Badge>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              {p.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {p.lead.before}
              <Link href="/for/real-estate" className="underline decoration-teal-400/60 decoration-2 underline-offset-4 hover:text-foreground">
                {p.lead.link}
              </Link>
              {p.lead.after}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up?role=property_manager" className={buttonVariants({ size: "lg" })}>
                {p.postFree}
              </Link>
              <Link
                href="/rfp-writer"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                {p.writeRfp}
              </Link>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {p.landlord.text}{" "}
              <Link href="/sign-up?role=landlord" className="font-medium text-teal-700 hover:underline">
                {p.landlord.cta}
              </Link>
            </p>
            <ReferBanner variant="subtle" className="mt-10 max-w-3xl" />
          </div>
          <figure className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-indigo lg:aspect-[4/5]">
            <Image
              src={PHOTOS.retailAerial.src}
              alt={t.photoAlt.retailAerial}
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(min-width: 1024px) 420px, (min-width: 640px) calc(100vw - 4rem), calc(100vw - 2.5rem)"
              className="object-cover object-[45%_50%]"
            />
            <figcaption className="absolute inset-x-3 bottom-3 rounded-xl bg-indigo/85 px-4 py-3 text-sm text-white backdrop-blur-sm">
              {p.caption}
            </figcaption>
          </figure>
        </Container>
      </section>

      <Section>
        <SectionHeading
          eyebrow={p.how.eyebrow}
          title={p.how.title}
        />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.key}>
              <CardHeader>
                <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">
                  <s.icon className="size-5" />
                </span>
                <CardTitle className="mt-3">{p.how.steps[s.key].title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="leading-relaxed text-muted-foreground">{p.how.steps[s.key].body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow={p.directory.eyebrow}
          title={p.directory.title}
          description={p.directory.description}
        />
        <div className="mt-10">
          <CategoryGrid categories={categories} limit={12} />
        </div>
        <div className="mt-8">
          <Link
            href="/directory"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {p.directory.cta}
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
              <CardTitle className="mt-3">{p.privacy.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed text-muted-foreground">
                {p.privacy.body}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">
                <ShieldCheck className="size-5" />
              </span>
              <CardTitle className="mt-3">{p.noObligation}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed text-muted-foreground">
                {t.copy.pmValue}
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="mt-10 max-w-3xl">
          <TrustDisclaimer />
        </div>
      </Section>

      <CTASection
        title={p.cta.title}
        description={p.cta.description}
        primaryHref="/sign-up?role=property_manager"
        primaryLabel={p.postFree}
        secondaryHref="/directory"
        secondaryLabel={p.cta.secondary}
      />
    </>
  );
}
