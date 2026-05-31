import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VendorListItem } from "@/lib/data/types";

export function DirectoryCard({ vendor }: { vendor: VendorListItem }) {
  const initials = vendor.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Link
      href={`/directory/${vendor.slug}`}
      className="group flex flex-col rounded-lg border border-border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm"
    >
      <div className="flex items-center gap-3">
        <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-indigo text-sm font-bold text-white">
          {vendor.logoUrl ? (
            <Image
              src={vendor.logoUrl}
              alt={vendor.name}
              fill
              sizes="44px"
              className="object-contain p-1"
              unoptimized={vendor.logoUrl.endsWith(".svg")}
            />
          ) : (
            initials
          )}
        </span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 truncate text-base font-semibold text-foreground group-hover:text-teal-700">
            {vendor.name}
            {vendor.verified && <BadgeCheck className="size-4 shrink-0 text-success" />}
          </h3>
          {(vendor.city || vendor.province) && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" /> {[vendor.city, vendor.province].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        {vendor.featured && (
          <Badge className="ml-auto bg-teal-100 text-teal-700 hover:bg-teal-100">Featured</Badge>
        )}
      </div>

      {vendor.shortDescription && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {vendor.shortDescription}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {vendor.categories.slice(0, 3).map((c) => (
          <Badge key={c} variant="secondary" className="font-normal">
            {c}
          </Badge>
        ))}
      </div>
    </Link>
  );
}
