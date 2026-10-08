import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, Calculator, Sparkles } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { EmptyState } from "@/components/public/empty-state";
import { ReferBanner } from "@/components/public/refer-banner";
import { buttonVariants } from "@/components/ui/button";
import { listResources } from "@/lib/data/resources";
import { cn } from "@/lib/utils";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).content.resourcesIndex.meta;
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/resources"),
  };
}

export default async function ResourcesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("content").resourcesIndex;
  const dg = getT("agencies").resourcesCard;
  // Articles are database content (English); only the page around them is translated.
  const resources = await listResources();
  return (
    <Container className="py-14">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        {t.h1}
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t.lead}
      </p>

      <ReferBanner variant="subtle" className="mt-8" />

      {/* Done-for-you feature */}
      <Link
        href="/resources/grow"
        className="group mt-8 flex flex-col items-start gap-4 overflow-hidden rounded-2xl bg-indigo p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div className="max-w-2xl">
          <span className="eyebrow inline-flex items-center gap-2 text-teal-300">
            <Sparkles className="size-3.5" /> {t.growEyebrow}
          </span>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
            {t.growTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-indigo-100/75">
            {t.growBody}
          </p>
        </div>
        <span className={cn(buttonVariants({ variant: "accent" }), "shrink-0")}>
          {t.learnMore} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>

      {/* Cost guides feature */}
      <Link
        href="/cost-guides"
        className="group mt-4 flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
      >
        <div className="max-w-2xl">
          <span className="eyebrow inline-flex items-center gap-2 text-teal-600">
            <Calculator className="size-3.5" /> {t.costEyebrow}
          </span>
          <h2 className="mt-2 text-xl font-semibold tracking-tight group-hover:text-teal-700">
            {t.costTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t.costBody}
          </p>
        </div>
        <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-teal-700 sm:flex">
          {t.seeGuides} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>

      {/* Contractor directories guide */}
      <Link
        href="/resources/contractor-directories"
        className="group mt-4 flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
      >
        <div className="max-w-2xl">
          <span className="eyebrow text-teal-600">{dg.eyebrow}</span>
          <h2 className="mt-2 text-xl font-semibold tracking-tight group-hover:text-teal-700">{dg.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{dg.body}</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-teal-700 sm:flex">
          {dg.cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>

      {resources.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((r) => (
            <Link
              key={r.slug}
              href={`/resources/${r.slug}`}
              className="group flex flex-col rounded-lg border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
            >
              <h2 className="text-lg font-semibold leading-snug group-hover:text-teal-700">{r.title}</h2>
              {r.excerpt && <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{r.excerpt}</p>}
              <span className="mt-4 flex items-center gap-1 text-sm font-medium text-teal-700">
                {t.read} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
