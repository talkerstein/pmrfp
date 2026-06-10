import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { monoColor, monogram } from "@/components/public/featured-vendor-card";
import type { VendorListItem } from "@/lib/data/types";

/**
 * Ledger row — Direction A of the directory redesign. Non-featured companies
 * render as dense, scannable rows: monogram/logo · name+desc · services ·
 * location · years · arrow. Tags/location/years collapse away on small screens.
 */

const GRID =
  "grid grid-cols-[44px_minmax(0,1fr)_26px] lg:grid-cols-[44px_minmax(0,1.55fr)_minmax(0,0.95fr)_128px_96px_26px] items-center gap-4 px-5";

export function VendorRowHeader() {
  return (
    <div className={cn(GRID, "border-b border-border bg-secondary/60 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground")}>
      <span />
      <span>Company</span>
      <span className="hidden lg:block">Services</span>
      <span className="hidden lg:block">Based in</span>
      <span className="hidden text-right lg:block">In business</span>
      <span />
    </div>
  );
}

export function VendorRow({ vendor }: { vendor: VendorListItem }) {
  return (
    <Link
      href={`/directory/${vendor.slug}`}
      className={cn(GRID, "group border-b border-border py-3.5 transition-colors last:border-b-0 hover:bg-secondary/50")}
    >
      {vendor.logoUrl ? (
        <span className="relative flex size-[38px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-white">
          <Image
            src={vendor.logoUrl}
            alt={vendor.name}
            fill
            sizes="38px"
            className="object-contain p-0.5"
            unoptimized={vendor.logoUrl.endsWith(".svg")}
          />
        </span>
      ) : (
        <span
          className={cn(
            "flex size-[38px] shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold text-white",
            monoColor(vendor.name),
          )}
        >
          {monogram(vendor.name)}
        </span>
      )}

      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <b className="truncate text-[14.5px] font-semibold text-indigo group-hover:text-teal-700">
            {vendor.name}
          </b>
          {vendor.verified && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-teal-700">
              <BadgeCheck className="size-2.5" /> Verified
            </span>
          )}
        </span>
        {vendor.shortDescription && (
          <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
            {vendor.shortDescription}
          </span>
        )}
      </span>

      <span
        className="hidden gap-1.5 overflow-hidden lg:flex"
        style={{ maskImage: "linear-gradient(90deg, #000 82%, transparent)" }}
      >
        {vendor.categories.map((t) => (
          <span key={t} className="shrink-0 rounded-md bg-secondary px-2 py-1 font-mono text-[10.5px] text-muted-foreground">
            {t}
          </span>
        ))}
      </span>

      <span className="hidden whitespace-nowrap font-mono text-[11.5px] text-foreground/70 lg:block">
        {[vendor.city, vendor.province === "Ontario" ? "ON" : vendor.province].filter(Boolean).join(", ")}
      </span>

      <span className="hidden whitespace-nowrap text-right font-mono text-[11.5px] text-muted-foreground lg:block">
        {vendor.yearsInBusiness ? (
          <>
            <b className="font-semibold text-indigo">{vendor.yearsInBusiness}</b> yrs
          </>
        ) : (
          "—"
        )}
      </span>

      <span className="text-right text-border-strong transition-all group-hover:translate-x-0.5 group-hover:text-teal-700">
        <ArrowRight className="ml-auto size-4" />
      </span>
    </Link>
  );
}
