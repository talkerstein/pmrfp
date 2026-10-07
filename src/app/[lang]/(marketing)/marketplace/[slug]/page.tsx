import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "@/i18n/link";
import { BadgeCheck, Check, Eye, MapPin, ShieldAlert, Star } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { ListingCard } from "@/components/marketplace/listing-card";
import { ContactSeller, FeatureListingButton, ReportListing } from "@/components/marketplace/marketplace-forms";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getSession } from "@/lib/access/access";
import { bumpViews, getListing, listActiveListings } from "@/lib/marketplace/data";
import { effectiveStatus, formatPrice, isFeatured, isLive, listingPageTitle, productJsonLd } from "@/lib/marketplace/rules";
import { getRegions } from "@/lib/data/taxonomy";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { regionName } from "@/i18n/terms";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

type Props = { params: Promise<{ lang: string; slug: string }>; searchParams: Promise<{ saved?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const dict = getDictionary(l);
  const t = dict.marketplace.meta;
  const listing = await getListing(slug);
  if (!listing) return { title: t.notFound, robots: { index: false, follow: false } };
  const title = listingPageTitle({ title: listing.title, city: listing.city, forSale: t.forSale, brand: t.brand });
  const price = formatPrice(listing.priceCents, listing.currency, l);
  const description = `${dict.marketplaceClient.conditions[listing.condition]} · ${dict.marketplaceClient.categories[listing.category]}${price ? ` · ${price}` : ""}${listing.city ? ` · ${listing.city}` : ""}. ${listing.description.slice(0, 120)}`;
  const live = isLive(listing);
  return {
    title: { absolute: title },
    description,
    alternates: alternatesFor(l, `/marketplace/${listing.slug}`),
    ...(live ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      title,
      description,
      url: localizePath(`/marketplace/${listing.slug}`, l),
      ...(listing.photos[0] ? { images: [{ url: listing.photos[0].url, width: listing.photos[0].width, height: listing.photos[0].height }] } : {}),
    },
  };
}

export default async function ListingPage({ params, searchParams }: Props) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("marketplace");
  const d = t.detail;
  const labels = getT("marketplaceClient");
  const { slug } = await params;
  const { saved } = await searchParams;
  const [listing, session, regions] = await Promise.all([getListing(slug), getSession(), getRegions().catch(() => [])]);
  if (!listing) notFound();
  const own = session?.userId === listing.userId;
  const live = isLive(listing);
  if (live && !own) await bumpViews(listing.slug);

  const price = formatPrice(listing.priceCents, listing.currency, lang) ?? t.card.priceOnRequest;
  const region = regions.find((r) => r.slug === listing.regionSlug);
  const where = [listing.city, region ? regionName(region.name, lang) : null, labels.countries[listing.country]].filter(Boolean).join(", ");
  const status = effectiveStatus(listing);
  const [hero, ...rest] = listing.photos;
  const related = live
    ? (await listActiveListings(200)).listings.filter((l) => l.category === listing.category && l.id !== listing.id).slice(0, 3)
    : [];
  const url = `${BASE}/marketplace/${listing.slug}`;

  return (
    <Container className="py-10">
      {live && (
        <>
          <JsonLd
            data={productJsonLd({
              title: listing.title,
              description: listing.description,
              url,
              condition: listing.condition,
              priceCents: listing.priceCents,
              currency: listing.currency,
              status: listing.status,
              photos: listing.photos.map((p) => p.url),
              category: labels.categories[listing.category],
              city: listing.city,
              country: listing.country,
              sellerName: listing.seller?.name ?? null,
            })}
          />
          <JsonLd
            data={breadcrumbSchema([
              { name: t.breadcrumb.home, path: localizePath("/", lang) },
              { name: t.breadcrumb.marketplace, path: localizePath("/marketplace", lang) },
              { name: labels.categories[listing.category], path: localizePath(`/marketplace/category/${listing.category}`, lang) },
              { name: listing.title, path: localizePath(`/marketplace/${listing.slug}`, lang) },
            ])}
          />
        </>
      )}

      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1 text-sm text-muted-foreground">
        <Link href="/marketplace" className="hover:text-foreground">{t.breadcrumb.marketplace}</Link>
        <span>/</span>
        <Link href={`/marketplace/category/${listing.category}`} className="hover:text-foreground">{labels.categories[listing.category]}</Link>
      </nav>

      {own && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50/60 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            {saved ? <Check className="size-4 text-teal-700" /> : null}
            {saved ? `${d.saved} ` : ""}
            {live ? d.ownerActive : fmt(d.ownerNotLive, { status: labels.statuses[status] })}
          </p>
          <div className="flex flex-wrap gap-2">
            {live && !isFeatured(listing.featuredUntil) && <FeatureListingButton listingId={listing.id} currency={listing.currency} />}
            <Link href={`/marketplace/new?edit=${listing.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>{d.edit}</Link>
            <Link href="/dashboard/listings" className={buttonVariants({ size: "sm", variant: "ghost" })}>{d.manage}</Link>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {hero && (
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-secondary">
              <Image src={hero.url} alt={listing.title} fill priority sizes="(min-width: 1024px) 60vw, 100vw" className="object-contain" />
            </div>
          )}
          {rest.length > 0 && (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {rest.map((p, i) => (
                <li key={p.path} className="relative aspect-square overflow-hidden rounded-md border border-border bg-secondary">
                  <a href={p.url} target="_blank" rel="noopener">
                    <Image src={p.url} alt={`${listing.title} (${i + 2})`} fill sizes="160px" className="object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {isFeatured(listing.featuredUntil) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-2 py-0.5 text-xs font-semibold text-white">
                <Star className="size-3" /> {t.card.featured}
              </span>
            )}
            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium">{labels.conditions[listing.condition]}</span>
            {status !== "active" && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{labels.statuses[status]}</span>}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{listing.title}</h1>
          <p className="mt-2 text-2xl font-bold text-indigo">{price}</p>
          {where && (
            <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-4" /> {where}
            </p>
          )}

          <section className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight">{d.details}</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground/90">{listing.description}</p>
            <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-3">
                <dt className="text-muted-foreground">{d.category}</dt>
                <dd className="font-medium">{labels.categories[listing.category]}</dd>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <dt className="text-muted-foreground">{d.condition}</dt>
                <dd className="font-medium">{labels.conditions[listing.condition]}</dd>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <dt className="text-muted-foreground">{d.listed}</dt>
                <dd className="font-medium">{formatDate(listing.createdAt, lang)}</dd>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <dt className="flex items-center gap-1 text-muted-foreground"><Eye className="size-3.5" /> {d.views}</dt>
                <dd className="font-medium">{formatNumber(listing.views, lang)}</dd>
              </div>
            </dl>
          </section>

          <p className="mt-10 text-xs leading-relaxed text-muted-foreground">{d.disclaimer}</p>
          {!own && (
            <div className="mt-4">
              <p className="mb-1 text-xs text-muted-foreground">{d.reportNote}</p>
              <ReportListing slug={listing.slug} />
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-muted-foreground">{d.seller}</h2>
            {listing.seller ? (
              listing.seller.listed ? (
                <Link href={`/directory/${listing.seller.slug}`} className="mt-1 flex items-center gap-1.5 font-semibold hover:underline">
                  <BadgeCheck className="size-4 text-teal-700" /> {listing.seller.name}
                </Link>
              ) : (
                <p className="mt-1 font-semibold">{listing.seller.name}</p>
              )
            ) : (
              <p className="mt-1 font-semibold">{d.privateSeller}</p>
            )}
            {listing.seller?.listed && (
              <Link href={`/directory/${listing.seller.slug}`} className="mt-1 inline-block text-sm text-teal-700 hover:underline">{d.sellerProfile}</Link>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 font-semibold">{d.contactTitle}</h2>
            {own ? (
              <p className="text-sm text-muted-foreground">{d.ownListing}</p>
            ) : live ? (
              <ContactSeller slug={listing.slug} />
            ) : (
              <p className="text-sm text-muted-foreground">{d.notLiveForBuyers}</p>
            )}
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 text-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="size-4 text-amber-700" /> {d.safetyTitle}
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {d.safety.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight">{fmt(d.related, { category: labels.categories[listing.category] })}</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((l) => (
              <li key={l.id}>
                <ListingCard listing={l} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
