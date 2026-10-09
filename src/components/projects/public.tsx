import Link from "@/i18n/link";
import Image from "next/image";
import { BadgeCheck, Camera, ImageIcon } from "lucide-react";
import { groupPhotos, isOptimizablePhoto, type ProjectPhoto } from "@/lib/projects/photos";
import { reviewStats, type PublicReview } from "@/lib/projects/reviews";
import type { ProjectCard } from "@/lib/data/projects";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { regionName } from "@/i18n/terms";
import type { Locale } from "@/i18n/config";

/** "4.7" in English and Spanish (es-US), "4,7" in French. */
export function oneDecimal(n: number, lang: Locale): string {
  return lang === "en" ? n.toFixed(1) : formatNumber(n, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Public-facing pieces for Projects: the photo gallery on a case study, the
 * portfolio grid on a company profile, and first-party reviews.
 */

export function ProjectGallery({
  photos,
  heroUrl,
  title,
  capturedOnSite,
}: {
  photos: ProjectPhoto[];
  heroUrl: string | null;
  title: string;
  capturedOnSite: boolean;
}) {
  const t = getT("directory").projects;
  const { hero, groups } = groupPhotos(photos, heroUrl);
  if (!hero) return null;
  return (
    <div className="mb-10">
      <a
        href={hero.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block overflow-hidden rounded-xl border border-border bg-secondary"
        style={{ aspectRatio: `${hero.width} / ${hero.height}`, maxHeight: "34rem" }}
      >
        <Image
          src={hero.url}
          alt={fmt(t.heroAlt, { title, kind: t.kindWords[hero.kind] })}
          fill
          priority
          sizes="(min-width: 1024px) 832px, 100vw"
          unoptimized={!isOptimizablePhoto(hero.url)}
          className="object-cover"
        />
      </a>
      {groups.map((g) => (
        <div key={g.kind} className="mt-6">
          <h2 className="eyebrow text-muted-foreground">{t.kinds[g.kind]}</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {g.photos.map((p, i) => (
              <a
                key={p.url}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-secondary"
              >
                <Image
                  src={p.url}
                  alt={fmt(t.photoAlt, { title, kind: t.kindWords[g.kind], n: i + 1 })}
                  fill
                  sizes="(min-width: 640px) 280px, 50vw"
                  unoptimized={!isOptimizablePhoto(p.url)}
                  className="object-cover transition-transform hover:scale-[1.02]"
                />
              </a>
            ))}
          </div>
        </div>
      ))}
      {capturedOnSite && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Camera className="size-3.5" /> {t.onSite}
        </p>
      )}
    </div>
  );
}

export function ProjectGrid({ projects, companyName }: { projects: ProjectCard[]; companyName: string }) {
  if (projects.length === 0) return null;
  const t = getT("directory").projects;
  const lang = getLang();
  return (
    <div className="mt-10">
      <h2 className="eyebrow text-muted-foreground">{t.heading}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{fmt(t.sub, { name: companyName })}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link
            key={p.slug}
            href={`/case-studies/${p.slug}`}
            className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-teal-300"
          >
            <div className="relative aspect-[4/3] bg-secondary">
              {p.heroUrl ? (
                <Image
                  src={p.heroUrl}
                  alt={p.title}
                  fill
                  sizes="(min-width: 1024px) 260px, (min-width: 640px) 45vw, 100vw"
                  className="object-cover transition-transform group-hover:scale-[1.02]"
                />
              ) : (
                <ImageIcon className="absolute inset-0 m-auto size-6 text-muted-foreground" />
              )}
            </div>
            <div className="p-3">
              <p className="line-clamp-2 text-sm font-medium leading-snug">{p.title}</p>
              {(p.city || p.province) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[p.city, p.province]
                    .filter((x): x is string => Boolean(x))
                    .map((x) => regionName(x, lang))
                    .join(", ")}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Stars({ rating, className }: { rating: number; className?: string }) {
  const full = Math.round(rating);
  const lang = getLang();
  const label = fmt(getT("directory").projects.stars, {
    rating: lang === "en" ? String(rating) : formatNumber(rating, lang, { maximumFractionDigits: 1 }),
  });
  return (
    <span className={className} aria-label={label} role="img">
      <span aria-hidden className="text-amber-500">{"★".repeat(full)}</span>
      <span aria-hidden className="text-slate-300">{"★".repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

const fmtMonth = (d: string, lang: Locale) => formatDate(d, lang, { month: "long", year: "numeric" });

export function ReviewList({
  reviews,
  heading,
  showSummary = true,
}: {
  reviews: PublicReview[];
  heading?: string;
  showSummary?: boolean;
}) {
  if (reviews.length === 0) return null;
  const t = getT("directory").projects;
  const lang = getLang();
  const { count, average } = reviewStats(reviews);
  return (
    <section className="mt-10" aria-labelledby="reviews-h">
      <h2 id="reviews-h" className="eyebrow text-muted-foreground">{heading ?? t.reviews}</h2>
      {showSummary && (
        <p className="mt-2 flex items-center gap-2 text-sm">
          <Stars rating={average} className="text-lg" />
          <span className="font-semibold">{oneDecimal(average, lang)}</span>
          <span className="text-muted-foreground">
            {plural(count, t.summary)}
          </span>
        </p>
      )}
      <ul className="mt-4 space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Stars rating={r.rating} />
              <span className="text-xs text-muted-foreground">{fmtMonth(r.createdAt, lang)}</span>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{r.body}</p>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{r.name}</span>
              {r.company && <span>{r.company}</span>}
              {r.verifiedVia === "project_invite" && (
                <span className="inline-flex items-center gap-1 text-teal-ink" title={t.viaTitle}>
                  <BadgeCheck className="size-3.5" /> {t.viaLink}
                </span>
              )}
            </p>
            {r.reply && (
              <p className="mt-3 border-l-2 border-teal-300 pl-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t.reply}</span> {r.reply}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
