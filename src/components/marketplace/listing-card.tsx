import Image from "next/image";
import Link from "@/i18n/link";
import { ImageOff, MapPin, Star } from "lucide-react";
import type { Listing } from "@/lib/marketplace/data";
import { formatPrice, isFeatured } from "@/lib/marketplace/rules";
import { getLang, getT } from "@/i18n/server";

/** One listing tile for the marketplace grid, landing pages and the homepage teaser. */
export function ListingCard({ listing }: { listing: Listing }) {
  const lang = getLang();
  const t = getT("marketplace").card;
  const labels = getT("marketplaceClient");
  const cover = listing.photos[0];
  const price = formatPrice(listing.priceCents, listing.currency, lang) ?? t.priceOnRequest;
  const featured = isFeatured(listing.featuredUntil);
  return (
    <Link
      href={`/marketplace/${listing.slug}`}
      className={`group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md ${featured ? "border-teal-400 ring-1 ring-teal-300" : "border-border"}`}
    >
      <div className="relative aspect-[4/3] bg-secondary">
        {cover ? (
          <Image
            src={cover.url}
            alt={listing.title}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" />
          </span>
        )}
        {featured && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-teal-600 px-2 py-0.5 text-xs font-semibold text-white">
            <Star className="size-3" /> {t.featured}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {labels.categories[listing.category]} · {labels.conditions[listing.condition]}
        </p>
        <h3 className="line-clamp-2 font-semibold leading-snug group-hover:underline">{listing.title}</h3>
        <p className="mt-auto pt-2 text-lg font-bold text-indigo">{price}</p>
        {listing.city && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5" /> {listing.city}
          </p>
        )}
      </div>
    </Link>
  );
}
