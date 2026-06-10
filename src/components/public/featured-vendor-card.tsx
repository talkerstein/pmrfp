import Link from "next/link";
import Image from "next/image";
import { BadgeCheck } from "lucide-react";
import type { VendorListItem } from "@/lib/data/types";

/**
 * Featured "plaque" card — Direction A of the directory redesign.
 * Indigo plaque with a teal radial glow, big years-in-business stat, and a
 * FEATURED pill. These sell the Featured tier by being visually unmissable.
 */

const MONO_COLORS = ["bg-indigo-500", "bg-teal-700", "bg-periwinkle"] as const;
export function monoColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return MONO_COLORS[Math.abs(h) % MONO_COLORS.length];
}
export function monogram(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function FeaturedVendorCard({ vendor }: { vendor: VendorListItem }) {
  return (
    <article className="relative flex min-h-[252px] flex-col overflow-hidden rounded-2xl bg-indigo p-5 text-indigo-100 shadow-md">
      {/* teal radial glow, top-right */}
      <div
        className="pointer-events-none absolute -right-16 -top-24 size-60 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(145,242,207,.18), transparent 64%)" }}
      />
      <div className="relative flex items-center justify-between gap-2.5">
        {vendor.logoUrl ? (
          <span className="relative flex size-[46px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
            <Image
              src={vendor.logoUrl}
              alt={vendor.name}
              fill
              sizes="46px"
              className="object-contain p-1"
              unoptimized={vendor.logoUrl.endsWith(".svg")}
            />
          </span>
        ) : (
          <span className="flex size-[46px] shrink-0 items-center justify-center rounded-xl bg-teal-300 font-bold text-indigo">
            {monogram(vendor.name)}
          </span>
        )}
        <span className="rounded-full bg-teal-300 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-indigo">
          Featured
        </span>
      </div>
      <h3 className="relative mt-3.5 text-lg font-bold leading-tight tracking-tight text-white">
        {vendor.name}
      </h3>
      <div className="relative mt-1.5 font-mono text-[11px] text-indigo-100/65">
        {[vendor.city, vendor.province].filter(Boolean).join(", ")}
      </div>
      {vendor.shortDescription && (
        <p className="relative mt-2.5 line-clamp-3 text-[13px] leading-normal text-indigo-100/90">
          {vendor.shortDescription}
        </p>
      )}
      <div className="relative mt-3 flex flex-wrap gap-1.5">
        {vendor.categories.slice(0, 3).map((t) => (
          <span key={t} className="rounded-md bg-white/10 px-2 py-1 font-mono text-[10.5px] text-indigo-100">
            {t}
          </span>
        ))}
        {vendor.verified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-300/15 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-teal-300">
            <BadgeCheck className="size-3" /> Verified
          </span>
        )}
      </div>
      <div className="relative mt-auto flex items-end justify-between gap-2.5 border-t border-white/15 pt-3.5">
        <div>
          {vendor.yearsInBusiness ? (
            <>
              <div className="text-2xl font-extrabold leading-none text-teal-300">
                {vendor.yearsInBusiness}
              </div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-indigo-100/65">
                yrs in business
              </div>
            </>
          ) : (
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-indigo-100/65">
              Founding partner
            </div>
          )}
        </div>
        <Link
          href={`/directory/${vendor.slug}`}
          className="whitespace-nowrap text-[13px] font-semibold text-teal-300 hover:underline"
        >
          View profile →
        </Link>
      </div>
    </article>
  );
}

/** Dashed "Your company, seen first" upsell slot — sits last in the marquee. */
export function FeaturedUpsellSlot() {
  return (
    <aside className="flex flex-col justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-border-strong bg-secondary/40 p-5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-periwinkle">
        Featured slot
      </span>
      <h4 className="text-[16.5px] font-bold leading-snug text-indigo">
        Your company, seen first.
      </h4>
      <p className="text-[12.5px] leading-normal text-muted-foreground">
        Featured partners appear above every search on this page.
      </p>
      <Link
        href="/pricing"
        className="mt-1 self-start rounded-full bg-indigo px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-700"
      >
        Get featured
      </Link>
    </aside>
  );
}
