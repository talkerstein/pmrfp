import Link from "@/i18n/link";
import Image from "next/image";
import { BadgeCheck, MapPin, Globe2, ShieldCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VendorListItem } from "@/lib/data/types";
import { getLang, getT } from "@/i18n/server";
import { fmt, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/dictionaries";

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
function coverageLabel(
  regions: string[],
  t: Messages["directory"]["card"]["coverage"],
  lang: Locale,
): { label: string; wide: boolean } | null {
  if (!regions.length) return null;
  const hasCanada = regions.includes("Canada");
  const hasUSA = regions.includes("United States");
  if (hasCanada && hasUSA) return { label: t.canadaUsa, wide: true };
  if (hasCanada) return { label: t.canadaWide, wide: true };
  // Drop province-level entries from the "+ N more" count so it reads cleaner
  const PROVINCES = new Set(["Ontario", "Quebec", "Alberta", "British Columbia", "Manitoba"]);
  const cities = regions.filter((r) => !PROVINCES.has(r));
  if (!cities.length) return { label: fmt(t.one, { place: regionName(regions[0], lang) }), wide: false };
  if (cities.length === 1) return { label: fmt(t.one, { place: regionName(cities[0], lang) }), wide: false };
  return { label: plural(cities.length - 1, t.more, { place: regionName(cities[0], lang) }), wide: false };
}

export function DirectoryCard({ vendor }: { vendor: VendorListItem }) {
  const t = getT("directory");
  const lang = getLang();
  const initials = vendor.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const coverage = coverageLabel(vendor.regions, t.card.coverage, lang);
  const wideCoverage = !!coverage?.wide;

  const trust: { icon: React.ReactNode; label: string }[] = [];
  if (positive(vendor.insuranceStatus))
    trust.push({ icon: <ShieldCheck className="size-3.5 text-success" />, label: t.card.insurance });
  if (positive(vendor.wsibStatus))
    trust.push({ icon: <ShieldCheck className="size-3.5 text-success" />, label: t.card.wsib });
  if (vendor.yearsInBusiness && vendor.yearsInBusiness > 0)
    trust.push({ icon: <Clock className="size-3.5" />, label: plural(vendor.yearsInBusiness, t.card.yrs) });

  return (
    <Link
      href={`/directory/${vendor.slug}`}
      className={cn(
        "group flex min-w-0 flex-col rounded-lg border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm",
        vendor.platinum
          ? "border-indigo/40 ring-2 ring-indigo/15"
          : vendor.featured
            ? "border-teal-200 ring-1 ring-teal-100"
            : "border-border",
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
              <span title={t.badges.verifiedTooltip} className="inline-flex shrink-0">
                <BadgeCheck className="size-4 text-success" aria-label={t.badges.verifiedAria} />
              </span>
            )}
          </h3>
          {(vendor.city || vendor.province) && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />{" "}
              {[vendor.city, vendor.province]
                .filter((x): x is string => Boolean(x))
                .map((x) => regionName(x, lang))
                .join(", ")}
            </p>
          )}
        </div>
        {vendor.platinum ? (
          <Badge className="ml-auto bg-indigo text-teal-300 hover:bg-indigo">{t.badges.platinum}</Badge>
        ) : vendor.featured ? (
          <Badge className="ml-auto bg-teal-100 text-teal-700 hover:bg-teal-100">{t.badges.featured}</Badge>
        ) : null}
      </div>

      {trust.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {trust.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1">
              {item.icon}
              {item.label}
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
            {coverage.label}
          </Badge>
        )}
        {vendor.categories.slice(0, 3).map((c) => (
          <Badge key={c} variant="secondary" className="font-normal">
            {tradeName(c, lang)}
          </Badge>
        ))}
      </div>
    </Link>
  );
}
