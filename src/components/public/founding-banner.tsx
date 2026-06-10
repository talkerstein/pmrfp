import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Container } from "@/components/container";

/**
 * Founding 100 promo banner (trades). Deliberately restrained and premium —
 * NO popup, NO fake "spots running out" scarcity (a manufactured cap on a new
 * platform reads as desperate). The real, verifiable urgency is the price: the
 * founding rate is locked for life and rises to $399 after the first 100
 * members.
 *
 * Per the board ruling, launch this only once the RFP board shows real
 * activity (browsable "Closed" jobs = proof). Flip FOUNDING_PROMO_ENABLED to
 * true when that's the case; until then this renders nothing.
 */
export const FOUNDING_PROMO_ENABLED = false;

const FOUNDING_PRICE = 249;
const FUTURE_PRICE = 399;

export function FoundingBanner() {
  if (!FOUNDING_PROMO_ENABLED) return null;
  return (
    <section className="border-y border-border bg-indigo text-white">
      <Container className="flex flex-col items-start gap-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-12">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-teal-300 text-indigo">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-teal-300">
              Founding 100 · Ontario trades
            </p>
            <p className="mt-1 text-xl font-semibold text-white sm:text-2xl">
              Lock in ${FOUNDING_PRICE}/year — for as long as you&apos;re a member.
            </p>
            <p className="mt-1 text-sm text-indigo-100/75">
              The first 100 trades to join keep this rate for life. It rises to ${FUTURE_PRICE} after.
            </p>
          </div>
        </div>
        <Link
          href="/sign-up"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-teal-300 px-5 py-2.5 text-sm font-semibold text-indigo transition-colors hover:bg-teal-300/90"
        >
          Claim your rate <ArrowRight className="size-4" />
        </Link>
      </Container>
    </section>
  );
}
