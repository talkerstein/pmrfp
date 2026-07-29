import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/forms/auth-forms";
import { DemoNotice } from "@/components/forms/demo-notice";
import { COPY } from "@/lib/site";
import { safeNextPath } from "@/lib/auth/next";

const VALID_ROLES = ["trade", "supplier", "property_manager", "visitor", "real_estate_agent"] as const;
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
  // Brand comes from the root layout's `%s — PMRFP` title template; repeating it
  // here rendered "… — PMRFP — PMRFP".
  const title = trade
    ? "Join as a founding trade — free"
    : pm
      ? "Post your building project free"
      : "Create your free account";
  // "Vetted" is not a claim the platform can currently substantiate — listing is
  // open and the disclaimer puts due diligence, licensing and insurance on the
  // member. Describe what actually happens instead.
  const description = trade
    ? "Property managers post building jobs. Listed trades get found and respond. Free to join, no credit card."
    : pm
      ? "Post your project once and matching trade companies respond. Free for property managers, always."
      : "Property managers post building RFPs free. Commercial trades get listed and respond to the work.";
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
  searchParams: Promise<{ role?: string; next?: string; template?: string }>;
}) {
  const { role: rawRole, next: rawNext, template } = await searchParams;
  const initialRole: ValidRole | undefined =
    rawRole && (VALID_ROLES as readonly string[]).includes(rawRole)
      ? (rawRole as ValidRole)
      : undefined;
  // Back-compat: older links pass ?template=X; promote it to a `next` path.
  const next = safeNextPath(rawNext ?? (template ? `/pm-dashboard/rfps/new?template=${template}` : null));
  const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <p className="eyebrow text-teal-ink">
        <span className="mr-2 inline-block h-px w-5 align-middle bg-teal-500" />
        Membership
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Join the PMRFP network</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        The commercial property RFP network — trades, suppliers, property
        managers, builders, and real estate professionals on one platform.
      </p>
      <div className="mt-6">
        <SignUpForm initialRole={initialRole} next={next} />
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
