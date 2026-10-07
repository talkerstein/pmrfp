import type { Metadata } from "next";
import Link from "@/i18n/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { BadgeCheck, Building2, Globe, Mail, MapPin, Phone, ShieldCheck, Clock } from "lucide-react";
import { tradePhotoForName } from "@/lib/photos";
import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { RequestIntroForm } from "@/components/public/request-intro-form";
import { SaveTradeButton } from "@/components/trusted/save-trade-button";
import { getRecommendedBy } from "@/lib/trusted/data";
import { JsonLd, breadcrumbSchema, localBusinessSchema } from "@/lib/seo/jsonld";
import { getVendor, listVendors, retiredVendorRedirect } from "@/lib/data/directory";
import { isOrgLifetime } from "@/lib/founding/server";
import { listOrgProjects, listPublishedReviews } from "@/lib/data/projects";
import { reviewStats } from "@/lib/projects/reviews";
import { ProjectGrid, ReviewList, Stars, oneDecimal } from "@/components/projects/public";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, plural } from "@/i18n/format";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";

export const revalidate = 3600;

export async function generateStaticParams({ params }: { params: { lang: string } }) {
  // English is prebuilt in full; French and Spanish get a few and render the rest
  // on first visit, then cache (ISR). Prebuilding every language tripled the build.
  // (An empty list for any language switches prebuilding off for the whole route.)
  const [trades, suppliers] = await Promise.all([
    listVendors(),
    listVendors({ orgType: "supplier" }),
  ]);
  const all = [...trades, ...suppliers].map((v) => ({ slug: v.slug }));
  return params.lang === "en" ? all : all.slice(0, 3);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).directory.profile;
  const v = await getVendor(slug);
  if (!v) return { title: t.notFound };
  const place = [v.city, v.province].filter((x): x is string => Boolean(x)).map((x) => regionName(x, l));
  // "<Company> — <Trade> in <City>, <Prov>": the trade + city is what PMs search.
  const mainTrade = v.categories[0] ? tradeName(v.categories[0], l) : null;
  const where = place.join(", ");
  const title = [v.name, [mainTrade, where].filter(Boolean).join(where && mainTrade ? ` ${t.titleIn} ` : "")]
    .filter(Boolean)
    .join(" — ");
  const description =
    v.shortDescription ?? fmt(t.fallbackDescription, { name: v.name, site: SITE.name });
  const path = `/directory/${v.slug}`;
  const base = SITE.url.replace(/\/$/, "");
  const url = `${base}${localizePath(path, l)}`;
  // Absolute on SITE.url (as before), with hreflang for each language.
  const alt = alternatesFor(l, path);
  const languages = Object.fromEntries(
    Object.entries(alt.languages ?? {}).map(([k, href]) => [k, `${base}${href}`]),
  );
  return {
    title,
    description,
    alternates: { canonical: url, languages },
    // The colocated opengraph-image.tsx supplies the og:image / twitter:image.
    openGraph: { type: "profile", title, description, url },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function VendorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const lang = await setLangFrom(params);
  const t = getT("directory");
  const tp = t.profile;
  const { slug } = await params;
  const v = await getVendor(slug);
  if (!v) {
    // Retired listing (demo / suspended): permanent redirect to the closest
    // real page so the URL's search value isn't thrown away. Unknown → 404.
    const to = await retiredVendorRedirect(slug);
    if (to) permanentRedirect(localizePath(to, lang));
    notFound();
  }

  const initials = v.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const showContact = v.contactVisibility === "show_contact";
  const founding = await isOrgLifetime(v.id);
  const tf = getT("founding");

  // Projects + first-party reviews (empty before the Projects migration).
  const [projects, reviews, recommenders] = await Promise.all([
    listOrgProjects(v.id),
    listPublishedReviews({ organizationId: v.id }, 100),
    getRecommendedBy(v.id),
  ]);
  const rating = reviewStats(reviews);
  const place = [v.city, v.province]
    .filter((x): x is string => Boolean(x))
    .map((x) => regionName(x, lang))
    .join(", ");
  // Cover: their own work first, otherwise a photo of their main trade.
  const cover = v.portfolioPhotos[0]
    ? { src: v.portfolioPhotos[0], alt: fmt(tp.coverAlt, { name: v.name }) }
    : tradePhotoForName(v.categories[0]);

  return (
    <Container className="py-10">
      <JsonLd
        data={localBusinessSchema({
          name: v.name,
          slug: v.slug,
          city: v.city,
          province: v.province,
          shortDescription: v.shortDescription,
          categories: v.categories,
          logoUrl: v.logoUrl,
          aggregateRating: rating.count > 0 ? { ratingValue: rating.average, reviewCount: rating.count } : undefined,
        })}
      />
      <JsonLd data={breadcrumbSchema([
        { name: tp.home, path: localizePath("/", lang) },
        { name: tp.directory, path: localizePath("/directory", lang) },
        { name: v.name, path: localizePath(`/directory/${v.slug}`, lang) },
      ])} />
      <nav aria-label={tp.breadcrumb} className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/directory" className="hover:text-foreground">{tp.directory}</Link>
        <span aria-hidden>/</span>
        {v.categories[0] && <span className="truncate">{tradeName(v.categories[0], lang)}</span>}
      </nav>

      <header className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="relative h-32 bg-indigo sm:h-44">
          <Image
            src={cover.src}
            alt={cover.alt}
            fill
            priority
            sizes="(min-width: 1280px) 1200px, 100vw"
            className={cn("object-cover", !v.portfolioPhotos[0] && "opacity-70")}
          />
        </div>
        <div className="px-5 pb-6 sm:px-7">
          <div className="-mt-10 flex flex-col gap-4 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <span
                className={cn(
                  "relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border-4 border-card text-2xl font-semibold shadow-sm sm:size-24",
                  v.logoUrl ? "bg-white" : "bg-indigo text-white",
                )}
              >
                {v.logoUrl ? (
                  <Image
                    src={v.logoUrl}
                    alt={v.name}
                    fill
                    sizes="96px"
                    className="object-contain p-2"
                    unoptimized={v.logoUrl.endsWith(".svg")}
                  />
                ) : (
                  initials
                )}
              </span>
            </div>
            {(v.verified || v.platinum || v.featured || founding) && <div className="flex flex-wrap items-center gap-2 sm:pb-1">
              {founding && (
                <span title={tf.directoryBadgeTooltip} className="rounded-md border border-teal-400/60 px-2.5 py-1 text-xs font-medium text-teal-ink">
                  {tf.directoryBadge}
                </span>
              )}
              {v.verified && (
                <span
                  title={t.badges.verifiedTooltip}
                  className="inline-flex items-center gap-1.5 rounded-md border border-teal-400/60 bg-teal-100/40 px-2.5 py-1 text-xs font-medium text-teal-ink"
                >
                  <BadgeCheck className="size-3.5" aria-hidden /> {t.badges.verifiedBy}
                </span>
              )}
              {v.platinum ? (
                <span className="rounded-md bg-indigo px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-300">
                  {t.badges.platinum}
                </span>
              ) : v.featured ? (
                <span className="rounded-md border border-border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-ink">
                  {t.badges.featured}
                </span>
              ) : null}
            </div>}
          </div>

          <h1 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-indigo sm:text-3xl">{v.name}</h1>
          {v.shortDescription && <p className="mt-1.5 max-w-2xl text-muted-foreground">{v.shortDescription}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            {place && (
              <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {place}</span>
            )}
            {v.googleRating != null && v.googleReviewCount != null && v.googleReviewCount > 0 && (
              // Displayed with attribution, sourced via the official Places
              // API. Deliberately NOT in schema markup: rich-result rules
              // require first-party reviews for aggregateRating.
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <span aria-hidden className="text-warn">★</span>
                {oneDecimal(v.googleRating, lang)}
                <span className="font-normal text-muted-foreground">
                  {fmt(tp.googleReviews, { n: v.googleReviewCount })}
                </span>
              </span>
            )}
            {rating.count > 0 && (
              <a href="#reviews-h" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
                <Stars rating={rating.average} />
                {oneDecimal(rating.average, lang)}
                <span className="font-normal text-muted-foreground">
                  {plural(rating.count, tp.clientReviews)}
                </span>
              </a>
            )}
          </div>

          {v.categories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {v.categories.map((c) => (
                <Badge key={c} variant="secondary">{tradeName(c, lang)}</Badge>
              ))}
            </div>
          )}

          {/* Realtors and PMs who put this company on their trusted-trades page. */}
          {recommenders.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-4 text-sm">
              <span className="font-medium text-foreground">{tp.recommendedBy}</span>
              {recommenders.slice(0, 3).map((r, i) => (
                <span key={r.handle}>
                  <Link href={`/trusted/${r.handle}`} className="font-medium text-teal-ink hover:underline">
                    {r.displayName}
                  </Link>
                  {r.brokerage && <span className="text-muted-foreground"> ({r.brokerage})</span>}
                  {i < Math.min(recommenders.length, 3) - 1 && <span className="text-muted-foreground">,</span>}
                </span>
              ))}
              {recommenders.length > 3 && <span className="text-muted-foreground">{plural(recommenders.length - 3, tp.andMore)}</span>}
            </p>
          )}
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {/* Only show facts the vendor actually has: a grid of placeholders
              reads as a broken/abandoned profile. */}
          {(() => {
            const facts: { icon: React.ReactNode; label: string; value: string }[] = [];
            if (v.yearsInBusiness) facts.push({ icon: <Clock className="size-3.5" />, label: tp.facts.inBusiness, value: plural(v.yearsInBusiness, tp.facts.years) });
            if (v.employeeCountRange) facts.push({ icon: <Building2 className="size-3.5" />, label: tp.facts.teamSize, value: v.employeeCountRange });
            if (v.insuranceStatus) facts.push({ icon: <ShieldCheck className="size-3.5" />, label: tp.facts.insurance, value: v.insuranceStatus });
            if (v.wsibStatus) facts.push({ icon: <ShieldCheck className="size-3.5" />, label: tp.facts.wsib, value: v.wsibStatus });
            if (facts.length === 0) return null;
            return (
              <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
                {facts.map((f) => (
                  <Fact key={f.label} icon={f.icon} label={f.label} value={f.value} />
                ))}
              </dl>
            );
          })()}

          {v.fullDescription && (
            <section className="mt-8">
              <h2 className="font-heading text-lg font-semibold tracking-tight text-indigo">{fmt(tp.about, { name: v.name })}</h2>
              <p className="mt-3 max-w-prose whitespace-pre-line leading-relaxed text-foreground/90">{v.fullDescription}</p>
            </section>
          )}

          {(v.regions.length > 0 || v.propertyTypes.length > 0) && (
            <section className="mt-8 grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
              {v.regions.length > 0 && (
                <div>
                  <h2 className="eyebrow text-muted-foreground">{tp.serviceArea}</h2>
                  <ul className="mt-3 space-y-1.5 text-sm text-foreground">
                    {v.regions.map((r) => (
                      <li key={r} className="flex items-center gap-2"><MapPin className="size-3.5 text-muted-foreground" /> {regionName(r, lang)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {v.propertyTypes.length > 0 && (
                <div>
                  <h2 className="eyebrow text-muted-foreground">{tp.propertyTypes}</h2>
                  <ul className="mt-3 space-y-1.5 text-sm text-foreground">
                    {v.propertyTypes.map((p) => (
                      <li key={p} className="flex items-center gap-2"><Building2 className="size-3.5 text-muted-foreground" /> {propertyTypeName(p, lang)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <ProjectGrid projects={projects} companyName={v.name} />

          <ReviewList reviews={reviews} />

          {v.portfolioPhotos.length > 0 && (
            <div className="mt-10">
              <h2 className="eyebrow text-muted-foreground">{tp.portfolio}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {fmt(tp.portfolioSub, { name: v.name })}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {v.portfolioPhotos.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-secondary/40"
                  >
                    <Image
                      src={url}
                      alt={fmt(tp.portfolioAlt, { name: v.name, n: i + 1 })}
                      fill
                      sizes="(min-width: 1024px) 280px, 50vw"
                      className="object-cover transition-transform hover:scale-[1.02]"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{tp.quoteEyebrow}</div>
            <p className="mt-2 text-sm text-foreground">
              {fmt(tp.quoteBody, { name: v.name })}
            </p>
            {/* Route through sign-up (PM role preselected) so cold visitors get
                registration, not a password wall; `next` carries them back to
                post-an-RFP-with-this-vendor after account creation. Signed-in
                PMs use the "Sign in" link on that page (also carries next). */}
            <Link
              href={`/sign-up?role=property_manager&next=${encodeURIComponent(`/pm-dashboard/rfps/new?invite=${v.slug}`)}`}
              className={buttonVariants({ className: "mt-4 w-full" })}
            >
              {tp.invite}
            </Link>
            <div className="mt-2">
              <SaveTradeButton organizationId={v.id} slug={v.slug} name={v.name} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            {showContact ? (
              <>
                <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{tp.contact}</h2>
                <div className="mt-3 divide-y divide-border text-sm">
                  {v.website && (
                    <a href={v.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-2.5 text-foreground hover:text-teal-ink">
                      <Globe className="size-4 text-muted-foreground" /> {tp.website}
                    </a>
                  )}
                  {v.email && (
                    <a href={`mailto:${v.email}`} className="flex items-center gap-2 truncate py-2.5 text-foreground hover:text-teal-ink">
                      <Mail className="size-4 shrink-0 text-muted-foreground" /> {v.email}
                    </a>
                  )}
                  {v.phone && (
                    <a href={`tel:${v.phone}`} className="flex items-center gap-2 py-2.5 text-foreground hover:text-teal-ink">
                      <Phone className="size-4 text-muted-foreground" /> {v.phone}
                    </a>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="font-heading text-base font-semibold text-indigo">{tp.introTitle}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {fmt(tp.introBody, { site: SITE.name })}
                </p>
                <div className="mt-4">
                  <RequestIntroForm vendorSlug={v.slug} vendorName={v.name} />
                </div>
              </>
            )}
          </div>
          <Link href="/sign-up" className="block text-center text-sm text-muted-foreground hover:text-foreground">
            {fmt(tp.areYou, { name: v.name })}{" "}
            <span className="font-medium text-teal-ink underline-offset-2 hover:underline">{tp.claim}</span>
          </Link>
        </aside>
      </div>
    </Container>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="-mb-px -mr-px border-b border-r border-border p-4">
      <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{icon} {label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
