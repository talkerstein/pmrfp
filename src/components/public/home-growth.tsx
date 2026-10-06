import Image from "next/image";
import Link from "@/i18n/link";
import { ArrowRight, Star } from "lucide-react";
import { Container } from "@/components/container";
import { DirectoryCard } from "@/components/public/directory-card";
import { buttonVariants } from "@/components/ui/button";
import { listCaseStudies } from "@/lib/data/case-studies";
import { heroUrlsBySlug, ratingsBySlug } from "@/lib/data/projects";
import { listVendors } from "@/lib/data/directory";
import { SPOTLIGHTS } from "@/lib/spotlight/articles";
import { cn } from "@/lib/utils";
import { getLang, getT } from "@/i18n/server";
import { fmt, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

/**
 * Homepage sections added for growth: recent trade portfolios (published case
 * studies + Spotlights), a supplier strip, and the real-estate / advertising
 * pitch. Each data section renders nothing when it has nothing to show.
 */

interface RecentItem {
  key: string;
  href: string;
  title: string;
  company: string;
  place: string;
  trade: string | null;
  photo: string | null;
  photoAlt: string;
  date: string;
  rating?: { count: number; average: number };
  spotlight: boolean;
}

export async function HomeRecentProjects() {
  const t = getT("home").recent;
  const lang = getLang();
  const studies = await listCaseStudies({ limit: 6 }).catch(() => []);
  const slugs = studies.map((s) => s.slug);
  const [heroes, ratings] = await Promise.all([heroUrlsBySlug(slugs), ratingsBySlug(slugs)]);

  const items: RecentItem[] = [
    ...SPOTLIGHTS.map((s) => ({
      key: `spotlight-${s.slug}`,
      href: `/spotlight/${s.slug}`,
      title: s.title,
      company: s.company,
      place: [s.city, regionName(s.province, lang)].filter(Boolean).join(", "),
      trade: tradeName(s.trade, lang),
      photo: s.photos[0]?.src ?? null,
      photoAlt: s.photos[0]?.alt ?? s.title,
      date: s.published,
      spotlight: true,
    })),
    ...studies.map((s) => ({
      key: `study-${s.slug}`,
      href: `/case-studies/${s.slug}`,
      title: s.title,
      company: s.orgName,
      place: [s.city, s.province ? regionName(s.province, lang) : null].filter(Boolean).join(", "),
      trade: s.categoryName ? tradeName(s.categoryName, lang) : null,
      photo: heroes.get(s.slug) ?? null,
      photoAlt: s.title,
      date: s.publishedAt ?? "",
      rating: ratings.get(s.slug),
      spotlight: false,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  if (items.length === 0) return null;

  return (
    <section className="border-t border-border bg-background">
      <Container className="py-16 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-teal-700">{t.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">{t.heading}</h2>
          </div>
          <Link href="/case-studies" className="inline-flex items-center gap-1 text-sm font-medium text-teal-ink hover:underline">
            {t.all} <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-teal-400 hover:shadow-sm"
            >
              {it.photo && (
                <div className="relative aspect-[16/10] bg-secondary">
                  <Image
                    src={it.photo}
                    alt={it.photoAlt}
                    fill
                    sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                  {it.spotlight && (
                    <span className="absolute left-3 top-3 rounded-full bg-indigo px-2.5 py-0.5 text-xs font-medium text-white">
                      {t.spotlight}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-teal-ink">
                  {[it.trade, it.place].filter(Boolean).join(" · ")}
                </p>
                <h3 className="mt-2 text-base font-semibold leading-snug group-hover:text-teal-ink">{it.title}</h3>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-sm">
                  <span className="font-medium text-teal-ink">{fmt(t.by, { org: it.company })}</span>
                  {it.rating && (
                    <span
                      className="inline-flex items-center gap-1 text-muted-foreground"
                      aria-label={fmt(t.rating, { avg: it.rating.average })}
                    >
                      <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                      <span aria-hidden>{it.rating.average.toFixed(1)}</span>
                      <span className="text-xs" aria-hidden>({plural(it.rating.count, t.reviews)})</span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

export async function HomeSuppliers() {
  const t = getT("home").suppliers;
  const suppliers = (await listVendors({ orgType: "supplier", sort: "featured" }).catch(() => [])).slice(0, 3);
  if (suppliers.length === 0) return null;
  return (
    <section className="border-t border-border bg-secondary/40">
      <Container className="py-14 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-teal-700">{t.eyebrow}</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{t.heading}</h2>
          </div>
          <Link href="/suppliers" className="inline-flex items-center gap-1 text-sm font-medium text-teal-ink hover:underline">
            {t.all} <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((v) => (
            <DirectoryCard key={v.slug} vendor={v} />
          ))}
        </div>
      </Container>
    </section>
  );
}

export function HomeAncillary() {
  const t = getT("home").ancillary;
  return (
    <section className="border-t border-border bg-card">
      <Container className="grid gap-8 py-14 md:py-16 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-teal-700">{t.eyebrow}</p>
          <h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">{t.heading}</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">{t.body}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/for/real-estate" className={cn(buttonVariants({ variant: "outline" }), "active:scale-[0.98]")}>
            {t.realEstate}
          </Link>
          <Link href="/advertise" className={cn(buttonVariants({ variant: "outline" }), "active:scale-[0.98]")}>
            {t.advertise}
          </Link>
          <Link href="/spotlight" className={cn(buttonVariants(), "active:scale-[0.98]")}>
            {t.spotlight} <ArrowRight className="size-4" />
          </Link>
        </div>
      </Container>
    </section>
  );
}
