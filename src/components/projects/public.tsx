import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Camera, ImageIcon } from "lucide-react";
import { groupPhotos, type ProjectPhoto } from "@/lib/projects/photos";
import { reviewStats, type PublicReview } from "@/lib/projects/reviews";
import type { ProjectCard } from "@/lib/data/projects";

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
          alt={`${title}: ${hero.kind} photo`}
          fill
          priority
          sizes="(min-width: 1024px) 832px, 100vw"
          className="object-cover"
        />
      </a>
      {groups.map((g) => (
        <div key={g.kind} className="mt-6">
          <h2 className="eyebrow text-muted-foreground">{g.label}</h2>
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
                  alt={`${title}: ${g.label.toLowerCase()} photo ${i + 1}`}
                  fill
                  sizes="(min-width: 640px) 280px, 50vw"
                  className="object-cover transition-transform hover:scale-[1.02]"
                />
              </a>
            ))}
          </div>
        </div>
      ))}
      {capturedOnSite && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Camera className="size-3.5" /> Photos taken on site with PMRFP
        </p>
      )}
    </div>
  );
}

export function ProjectGrid({ projects, companyName }: { projects: ProjectCard[]; companyName: string }) {
  if (projects.length === 0) return null;
  return (
    <div className="mt-10">
      <h2 className="eyebrow text-muted-foreground">Projects</h2>
      <p className="mt-1 text-sm text-muted-foreground">Completed jobs by {companyName}.</p>
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
                <p className="mt-0.5 text-xs text-muted-foreground">{[p.city, p.province].filter(Boolean).join(", ")}</p>
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
  return (
    <span className={className} aria-label={`${rating} out of 5 stars`} role="img">
      <span aria-hidden className="text-amber-500">{"★".repeat(full)}</span>
      <span aria-hidden className="text-slate-300">{"★".repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

const fmtMonth = (d: string) => new Date(d).toLocaleDateString("en-CA", { month: "long", year: "numeric" });

export function ReviewList({
  reviews,
  heading = "Reviews",
  showSummary = true,
}: {
  reviews: PublicReview[];
  heading?: string;
  showSummary?: boolean;
}) {
  if (reviews.length === 0) return null;
  const { count, average } = reviewStats(reviews);
  return (
    <section className="mt-10" aria-labelledby="reviews-h">
      <h2 id="reviews-h" className="eyebrow text-muted-foreground">{heading}</h2>
      {showSummary && (
        <p className="mt-2 flex items-center gap-2 text-sm">
          <Stars rating={average} className="text-lg" />
          <span className="font-semibold">{average.toFixed(1)}</span>
          <span className="text-muted-foreground">
            from {count} client {count === 1 ? "review" : "reviews"}
          </span>
        </p>
      )}
      <ul className="mt-4 space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Stars rating={r.rating} />
              <span className="text-xs text-muted-foreground">{fmtMonth(r.createdAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{r.body}</p>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{r.name}</span>
              {r.company && <span>{r.company}</span>}
              {r.verifiedVia === "project_invite" && (
                <span className="inline-flex items-center gap-1 text-teal-ink" title="Sent through a one-time link PMRFP emailed to the client of this project.">
                  <BadgeCheck className="size-3.5" /> Via PMRFP review link
                </span>
              )}
            </p>
            {r.reply && (
              <p className="mt-3 border-l-2 border-teal-300 pl-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Reply:</span> {r.reply}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
