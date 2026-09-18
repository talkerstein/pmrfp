import Link from "next/link";
import { ArrowRight, Banknote } from "lucide-react";
import { Container } from "@/components/container";
import { REFERRAL } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Refer-a-project banner. Restrained, typographic, two visual variants:
 *  - `subtle` (default): light teal-tinted strip with single-line CTA.
 *    Pepper into mid-content sections.
 *  - `prominent`: full indigo band with bigger callout. Use sparingly —
 *    once per page max, near top of an audience-aligned landing page.
 *
 * Both link to /refer-a-project. Both follow the muted aesthetic per the
 * earlier panel verdict — no animations, no bright color blocks, no
 * exclamation marks.
 */
export function ReferBanner({
  variant = "subtle",
  className,
}: {
  variant?: "subtle" | "prominent";
  className?: string;
}) {
  if (variant === "prominent") {
    return (
      <section className={cn("border-y border-border bg-indigo text-white", className)}>
        <Container className="flex flex-col items-start gap-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-12">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-teal-300 text-indigo">
              <Banknote className="size-5" />
            </span>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-teal-300">
                Referral program · two lanes
              </p>
              <p className="mt-1 text-xl font-semibold text-white sm:text-2xl">
                Refer a trade → earn up to ${REFERRAL.tradeFee} cash. Refer a project → get public credit.
              </p>
              <p className="mt-1 text-sm text-indigo-100/75">
                Both trigger when they list on PMRFP. No award-waiting.
              </p>
            </div>
          </div>
          <Link
            href="/refer"
            className="inline-flex items-center gap-2 rounded-full bg-teal-300 px-5 py-2.5 text-sm font-semibold text-indigo transition-colors hover:bg-teal-300/90"
          >
            See both lanes <ArrowRight className="size-4" />
          </Link>
        </Container>
      </section>
    );
  }

  // Subtle — fits inside a Container, no top/bottom borders, no full-bleed bg.
  return (
    <Link
      href="/refer"
      className={cn(
        "group flex flex-col items-start gap-3 rounded-xl border border-teal-300/60 bg-teal-100/35 p-5 transition-colors hover:bg-teal-100/55 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-300 text-indigo">
          <Banknote className="size-4" />
        </span>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-teal-ink">
            Referral program · up to ${REFERRAL.maxFee}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{REFERRAL.oneLiner}</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-ink">
        See lanes
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
