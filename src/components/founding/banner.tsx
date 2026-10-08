import Link from "@/i18n/link";
import { FOUNDING, FOUNDING_LOW_SPOTS, FOUNDING_PATH, foundingScarcity, spotsLeft } from "@/lib/founding/config";
import { cachedLifetimeCount } from "@/lib/founding/server";
import { getT } from "@/i18n/server";
import { fmt } from "@/i18n/format";

/** Founding 500 call-out. Quiet copy (no count) until fewer than 50 spots remain. Hidden once sold out. */
export async function FoundingBanner({ variant = "banner", className }: { variant?: "banner" | "badge" | "link"; className?: string }) {
  const t = getT("founding");
  const sold = await cachedLifetimeCount();
  const left = sold == null ? null : spotsLeft(sold);
  if (left === 0) return null;
  if (variant === "badge") {
    return (
      <Link href={FOUNDING_PATH} className={`inline-flex items-center rounded-full border border-teal-400/60 bg-teal-100/40 px-3 py-1 text-xs font-semibold text-teal-ink hover:bg-teal-100 ${className ?? ""}`}>
        {t.heroBadge}
      </Link>
    );
  }
  if (variant === "link") {
    return (
      <Link href={FOUNDING_PATH} className={`font-medium text-teal-ink underline ${className ?? ""}`}>
        {t.forTradesLink}
      </Link>
    );
  }
  const text = foundingScarcity(left) === "low" ? fmt(t.pricingBanner, { cap: FOUNDING.cap, low: FOUNDING_LOW_SPOTS }) : fmt(t.pricingBannerUnknown, { cap: FOUNDING.cap });
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-teal-500 bg-teal-100/50 px-5 py-4 ${className ?? ""}`}>
      <p className="text-sm font-semibold text-foreground">{text}</p>
      <Link href={FOUNDING_PATH} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
        {t.pricingBannerCta}
      </Link>
    </div>
  );
}
