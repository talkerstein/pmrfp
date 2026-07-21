import { RegionalWaitlistForm } from "@/components/public/founding-region-notice";

/**
 * Reusable email-capture band for high-intent marketing pages that would
 * otherwise let a warm visitor leave with no way to follow up (cost guides,
 * templates, trade category pages, the PM landing page).
 *
 * Thin presentational wrapper around RegionalWaitlistForm — the same server
 * action (joinRegionalWaitlistAction) that persists to `regional_waitlist`,
 * syncs to GHL, and fires the waitlist_joined analytics event. Reason stays
 * "early_access" (the only non-region CHECK-allowed value); segmentation is
 * carried by `role` + `categorySlug`.
 *
 * variant="indigo" for use over dark/indigo sections; "card" (default) for
 * light content areas.
 */
export interface EmailCaptureProps {
  heading: string;
  sub: string;
  role?: string;
  categorySlug?: string;
  regionSlug?: string;
  buttonLabel?: string;
  variant?: "card" | "indigo";
  className?: string;
}

export function EmailCapture({
  heading,
  sub,
  role,
  categorySlug,
  regionSlug,
  buttonLabel = "Notify me",
  variant = "card",
  className,
}: EmailCaptureProps) {
  const indigo = variant === "indigo";
  return (
    <div
      className={`rounded-2xl border p-6 sm:p-8 ${
        indigo ? "border-white/15 bg-white/5" : "border-teal-300 bg-teal-100/30"
      } ${className ?? ""}`}
    >
      <h3 className={`text-xl font-semibold ${indigo ? "text-white" : "text-foreground"}`}>
        {heading}
      </h3>
      <p
        className={`mt-2 max-w-prose text-sm leading-relaxed ${
          indigo ? "text-indigo-100/80" : "text-foreground/80"
        }`}
      >
        {sub}
      </p>
      <div className="mt-5">
        <RegionalWaitlistForm
          role={role}
          categorySlug={categorySlug}
          regionSlug={regionSlug}
          reason="early_access"
          buttonLabel={buttonLabel}
        />
      </div>
    </div>
  );
}
