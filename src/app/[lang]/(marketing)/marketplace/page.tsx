import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/public/empty-state";
import { ListingCard } from "@/components/marketplace/listing-card";
import { listActiveListings } from "@/lib/marketplace/data";
import { CATEGORIES, CONDITIONS, filterListings, type ListingFilters } from "@/lib/marketplace/rules";
import { getRegions } from "@/lib/data/taxonomy";
import { cn } from "@/lib/utils";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { plural } from "@/i18n/format";
import { regionName } from "@/i18n/terms";

type SP = ListingFilters;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).marketplace.meta;
  const sp = await searchParams;
  const filtered = Object.values(sp).some(Boolean);
  return {
    title: { absolute: t.title },
    description: t.description,
    alternates: alternatesFor(l, "/marketplace"),
    // Filtered views are duplicates of the board; category landings are the indexable slices.
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

const SELECT =
  "h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const INPUT =
  "h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function MarketplacePage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<SP> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("marketplace").index;
  const labels = getT("marketplaceClient");
  const sp = await searchParams;
  const [{ ready, listings }, regions] = await Promise.all([listActiveListings(), getRegions().catch(() => [])]);
  const filtered = Object.values(sp).some(Boolean);
  const shown = filterListings(listings, sp);
  const usedCategories = CATEGORIES.filter((c) => listings.some((l) => l.category === c));

  return (
    <>
      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.06)]">
        <Container className="relative py-14 md:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-teal-300">{t.eyebrow}</p>
          <h1 className="mt-3 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-white md:text-5xl">{t.title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-indigo-100/80">{t.lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/marketplace/new" className={cn(buttonVariants({ size: "lg", variant: "accent" }), "active:scale-[0.98]")}>
              {t.sell} <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/marketplace/rules"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white")}
            >
              {t.rules}
            </Link>
          </div>
        </Container>
      </section>

      <Container className="grid gap-10 py-12 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t.search}
              <input name="q" defaultValue={sp.q ?? ""} placeholder={t.searchPlaceholder} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t.category}
              <select name="category" defaultValue={sp.category ?? ""} className={SELECT}>
                <option value="">{t.allCategories}</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{labels.categories[c]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t.condition}
              <select name="condition" defaultValue={sp.condition ?? ""} className={SELECT}>
                <option value="">{t.anyCondition}</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{labels.conditions[c]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t.country}
              <select name="country" defaultValue={sp.country ?? ""} className={SELECT}>
                <option value="">{t.anyCountry}</option>
                <option value="CA">{labels.countries.CA}</option>
                <option value="US">{labels.countries.US}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t.region}
              <select name="region" defaultValue={sp.region ?? ""} className={SELECT}>
                <option value="">{t.anyRegion}</option>
                {regions.map((r) => (
                  <option key={r.slug} value={r.slug}>{regionName(r.name, lang)}</option>
                ))}
              </select>
            </label>
            <label className="flex w-32 flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t.city}
              <input name="city" defaultValue={sp.city ?? ""} className={INPUT} />
            </label>
            <label className="flex w-24 flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t.minPrice}
              <input name="min" type="number" min={0} defaultValue={sp.min ?? ""} className={INPUT} />
            </label>
            <label className="flex w-24 flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t.maxPrice}
              <input name="max" type="number" min={0} defaultValue={sp.max ?? ""} className={INPUT} />
            </label>
            <button type="submit" className={buttonVariants()}>{t.show}</button>
            {filtered && (
              <Link href="/marketplace" className="pb-2 text-sm font-medium text-teal-700 hover:underline">{t.clear}</Link>
            )}
          </form>

          <div className="mt-8">
            {!ready ? (
              <EmptyState title={t.comingSoonTitle} description={t.comingSoonBody} />
            ) : shown.length === 0 ? (
              <EmptyState title={filtered ? t.emptyFilteredTitle : t.emptyTitle} description={filtered ? t.emptyFilteredBody : t.emptyBody}>
                <Link href="/marketplace/new" className={buttonVariants()}>{t.sell}</Link>
              </EmptyState>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted-foreground">{plural(shown.length, t.count)}</p>
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {shown.map((l) => (
                    <li key={l.id}>
                      <ListingCard listing={l} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4 text-teal-700" /> {t.howTitle}
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {t.how.map((h) => (
                <li key={h} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-teal-700" /> {h}
                </li>
              ))}
            </ul>
            <Link href="/marketplace/new" className={cn(buttonVariants(), "mt-4 w-full")}>{t.sell}</Link>
          </div>
          {usedCategories.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">{t.browseCategories}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {usedCategories.map((c) => (
                  <li key={c}>
                    <Link href={`/marketplace/category/${c}`} className="inline-block rounded-full border border-border px-3 py-1 text-sm hover:bg-secondary">
                      {labels.categories[c]}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </Container>
    </>
  );
}
