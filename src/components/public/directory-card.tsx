import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, MapPin, Globe2, ShieldCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VendorListItem } from "@/lib/data/types";

const VERIFIED_TOOLTIP =
  "Reviewed by the PMRFP team before this company was marked verified. Always confirm current licensing and insurance directly for your project.";

// Only surface a trust chip when the status clearly reads as positive coverage,
// so we never mislabel an "expired" / "none" status as covered.
const POSITIVE = /(active|valid|current|yes|insured|compliant|verified|covered|good)/i;
function positive(status?: string | null): boolean {
  return !!status && POSITIVE.test(status);
}

/**
 * Compress an org's service-region list into one short coverage label.
 * Examples:
 *   ["Canada", "United States"]   → "Canada + USA"
 *   ["Canada"]                    → "Canada-wide"
 *   ["Toronto", "GTA", "Markham"] → "Toronto + 2 more"
 *   ["Toronto"]                   → "Toronto"
 *   []                            → null (no coverage tag rendered)
 */
function coverageLabel(regions: string[]): string | null {
  if (!regions.length) return null;
  const hasCanada = regions.includes("Canada");
  const hasUSA = regions.includes("United States");
  if (hasCanada && hasUSA) return "Canada + USA";
  if (hasCanada) return "Canada-wide";
  // Drop province-level entries from the "+ N more" count so it reads cleaner
  const PROVINCES = new Set(["Ontario", "Quebec", "Alberta", "British Columbia", "Manitoba"]);
  const cities = regions.filter((r) => !PROVINCES.has(r));
  if (!cities.length) return regions[0];
  if (cities.length === 1) return cities[0];
  return `${cities[0]} + ${cities.length - 1} more`;
}

export function DirectoryCard({ vendor }: { vendor: VendorListItem }) {
  const initials = vendor.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const coverage = coverageLabel(vendor.regions);
  const wideCoverage = coverage === "Canada-wide" || coverage === "Canada + USA";

  const trust: { icon: React.ReactNode; label: string }[] = [];
  if (positive(vendor.insuranceStatus))
    trust.push({ icon: <ShieldCheck className="size-3.5 text-success" />, label: "Insurance listed" });
  if (positive(vendor.wsibStatus))
    trust.push({ icon: <ShieldCheck className="size-3.5 text-success" />, label: "WSIB listed" });
  if (vendor.yearsInBusiness && vendor.yearsInBusiness > 0)
    trust.push({ icon: <Clock className="size-3.5" />, label: `${vendor.yearsInBusiness} yrs` });

  return (
    <Link
      href={`/directory/${vendor.slug}`}
      className={cn(
        "group flex flex-col rounded-lg border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm",
        vendor.featured ? "border-teal-200 ring-1 ring-teal-100" : "border-border",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md text-sm font-bold",
            vendor.logoUrl ? "border border-border bg-white" : "bg-indigo text-white",
          )}
        >
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
            {vendor.verified && (
              <span title={VERIFIED_TOOLTIP} className="inline-flex shrink-0">
                <BadgeCheck className="size-4 text-success" aria-label="Reviewed by PMRFP" />
              </span>
            )}
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

      {trust.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {trust.map((t) => (
            <span key={t.label} className="inline-flex items-center gap-1">
              {t.icon}
              {t.label}
            </span>
          ))}
        </div>
      )}

      {vendor.shortDescription && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {vendor.shortDescription}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {coverage && (
          <Badge
            variant={wideCoverage ? "default" : "outline"}
            className={
              wideCoverage
                ? "bg-teal-100 text-teal-ink hover:bg-teal-100 font-normal"
                : "font-normal"
            }
          >
            {wideCoverage && <Globe2 className="mr-1 size-3" />}
            Serves {coverage}
          </Badge>
        )}
        {vendor.categories.slice(0, 3).map((c) => (
          <Badge key={c} variant="secondary" className="font-normal">
            {c}
          </Badge>
        ))}
      </div>
    </Link>
  );
}
