import Link from "@/i18n/link";
import Image from "next/image";
import { publicImageSource } from "@/lib/d1/public-asset-preview";
import { BadgeCheck } from "lucide-react";
import type { VendorListItem } from "@/lib/data/types";
import { getLang, getT } from "@/i18n/server";
import { plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

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
  const logo = vendor.logoUrl ? publicImageSource(vendor.logoUrl) : null;
  const t = getT("directory");
  const lang = getLang();
  return (
    <article className="relative flex min-h-[252px] flex-col overflow-hidden rounded-2xl bg-indigo p-5 text-indigo-100 shadow-md">
      {/* teal radial glow, top-right */}
      <div
        className="pointer-events-none absolute -right-16 -top-24 size-60 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(145,242,207,.18), transparent 64%)" }}
      />
      <div className="relative flex items-center justify-between gap-2.5">
        {logo ? (
          <span className="relative flex size-[46px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
            <Image
              src={logo.src}
              alt={vendor.name}
              fill
              sizes="46px"
              className="object-contain p-1"
              unoptimized={logo.unoptimized || logo.src.endsWith(".svg")}
            />
          </span>
        ) : (
          <span className="flex size-[46px] shrink-0 items-center justify-center rounded-xl bg-teal-300 font-bold text-indigo">
            {monogram(vendor.name)}
          </span>
        )}
        <span
          className={
            vendor.platinum
              ? "rounded-full bg-gradient-to-r from-slate-200 via-white to-slate-300 px-2.5 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-indigo shadow-sm"
              : "rounded-full bg-teal-300 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-indigo"
          }
        >
          {vendor.platinum ? t.badges.platinum : t.badges.featured}
        </span>
      </div>
      <h3 className="relative mt-3.5 text-lg font-bold leading-tight tracking-tight text-white">
        {vendor.name}
      </h3>
      <div className="relative mt-1.5 font-mono text-[11px] text-indigo-100/65">
        {[vendor.city, vendor.province]
          .filter((x): x is string => Boolean(x))
          .map((x) => regionName(x, lang))
          .join(", ")}
      </div>
      {vendor.shortDescription && (
        <p className="relative mt-2.5 line-clamp-3 text-[13px] leading-normal text-indigo-100/90">
          {vendor.shortDescription}
        </p>
      )}
      <div className="relative mt-3 flex flex-wrap gap-1.5">
        {vendor.categories.slice(0, 3).map((c) => (
          <span key={c} className="rounded-md bg-white/10 px-2 py-1 font-mono text-[10.5px] text-indigo-100">
            {tradeName(c, lang)}
          </span>
        ))}
        {vendor.verified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-300/15 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-teal-300">
            <BadgeCheck className="size-3" /> {t.badges.verified}
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
                {plural(vendor.yearsInBusiness, t.plaque.yrsInBusiness)}
              </div>
            </>
          ) : (
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-indigo-100/65">
              {t.plaque.founding}
            </div>
          )}
        </div>
        <Link
          href={`/directory/${vendor.slug}`}
          className="whitespace-nowrap text-[13px] font-semibold text-teal-300 hover:underline"
        >
          {t.plaque.view}
        </Link>
      </div>
    </article>
  );
}

/** Dashed "Your company, seen first" upsell slot — sits last in the marquee. */
export function FeaturedUpsellSlot() {
  const t = getT("directory").plaque;
  return (
    <aside className="flex flex-col justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-border-strong bg-secondary/40 p-5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-periwinkle">
        {t.slot}
      </span>
      <h4 className="text-[16.5px] font-bold leading-snug text-indigo">
        {t.slotTitle}
      </h4>
      <p className="text-[12.5px] leading-normal text-muted-foreground">
        {t.slotBody}
      </p>
      <Link
        href="/pricing"
        className="mt-1 self-start rounded-full bg-indigo px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-700"
      >
        {t.slotCta}
      </Link>
    </aside>
  );
}
