import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/forms/auth-forms";
import { DemoNotice } from "@/components/forms/demo-notice";
import { COPY } from "@/lib/site";
import { safeNextPath } from "@/lib/auth/next";
import { billingPathForIntent, parsePlanIntent } from "@/lib/billing/plan-intent";
import { parseAwardRef } from "@/lib/gc/packages";

const VALID_ROLES = ["trade", "supplier", "property_manager", "visitor", "real_estate_agent", "general_contractor"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

/** Role-aware share card — link previews (WhatsApp/iMessage/LinkedIn) fetch the
 *  full URL including ?role=, so invites speak to the right audience. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}): Promise<Metadata> {
  const { role } = await searchParams;
  const trade = role === "trade" || role === "supplier";
  const pm = role === "property_manager" || role === "real_estate_agent";
  const gc = role === "general_contractor";
  const title = trade
    ? "Join PMRFP as a founding trade — free"
    : gc
      ? "Post your sub-trade packages free"
      : pm
        ? "Post your building project free"
        : "Join PMRFP — free";
  const description = trade
    ? "Property managers post building jobs. Vetted trades get found and bid. Free to join, no credit card."
    : gc
      ? "Won a job? Post a package per trade and get quotes from local trades. Free for general contractors."
      : pm
        ? "Post your project once and vetted trades come to you with bids. Free for property managers, always."
        : "Property managers post building RFPs free. Vetted trades bid on the work.";
  return {
    title,
    description,
    openGraph: { title, description, url: "https://pmrfp.com/sign-up" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; next?: string; template?: string; plan?: string; interval?: string; award?: string }>;
}) {
  const { role: rawRole, next: rawNext, template, plan, interval, award: rawAward } = await searchParams;
  // A GC arriving from a public award they won: their first package is prefilled.
  const award = parseAwardRef(rawAward);
  // Plan chosen on /pricing — re-validated against an allowlist; never trusted for price.
  const intent = parsePlanIntent(plan, interval);
  const initialRole: ValidRole | undefined =
    rawRole && (VALID_ROLES as readonly string[]).includes(rawRole)
      ? (rawRole as ValidRole)
      : undefined;
  // Back-compat: older links pass ?template=X; promote it to a `next` path.
  const next = safeNextPath(
    rawNext ??
      (template ? `/pm-dashboard/rfps/new?template=${template}` : intent ? billingPathForIntent(intent) : null),
  );
  const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <p className="eyebrow text-teal-ink">
        <span className="mr-2 inline-block h-px w-5 align-middle bg-teal-500" />
        Membership
      </p>
      {intent ? (
        <>
          {/* Paid path: one decision on this page, not five. */}
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Start {intent.name}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            For trade and service companies. Every matching commercial RFP and public tender in your trade and
            regions, emailed the morning it posts.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Join the PMRFP network</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            The commercial property RFP network — trades, suppliers, property
            managers, builders, and real estate professionals on one platform.
          </p>
        </>
      )}
      {intent && (
        <div className="mt-5 rounded-lg border border-teal-300 bg-teal-50/60 p-4 text-sm">
          <p className="font-semibold text-foreground">
            You chose {intent.name} — {intent.priceLabel}
          </p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            Create your free account first — no card needed now. We&apos;ll take you straight to
            billing to confirm {intent.name} before anything is charged.{" "}
            <Link href="/pricing" className="font-medium text-teal-700 hover:underline">
              Change plan
            </Link>
          </p>
        </div>
      )}
      <div className="mt-6">
        <SignUpForm
          initialRole={intent ? (initialRole === "supplier" ? "supplier" : "trade") : initialRole}
          lockRole={!!intent}
          next={next}
          award={award}
        />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{COPY.signupDisclaimer}</p>
      <DemoNotice />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={signInHref} className="font-medium text-teal-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
