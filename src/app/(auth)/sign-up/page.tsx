import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/forms/auth-forms";
import { DemoNotice } from "@/components/forms/demo-notice";
import { COPY } from "@/lib/site";
import { safeNextPath } from "@/lib/auth/next";

export const metadata: Metadata = { title: "Join PMRFP" };

const VALID_ROLES = ["trade", "supplier", "property_manager", "visitor"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

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
      <h1 className="text-2xl font-semibold tracking-tight">Join PMRFP</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create your account in under a minute.
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
