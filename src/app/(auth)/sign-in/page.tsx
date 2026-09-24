import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/forms/auth-forms";
import { ContinueWithGoogle } from "@/components/forms/google-button";
import { DemoNotice } from "@/components/forms/demo-notice";
import { safeNextPath } from "@/lib/auth/next";
import { isGoogleAuthEnabled } from "@/lib/auth/google";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNextPath(rawNext);
  const signUpHref = next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up";
  const google = await isGoogleAuthEnabled();

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your PMRFP account.</p>
      {error === "google" && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          We couldn&apos;t sign you in with Google. Please try again, or use your email and password.
        </p>
      )}
      <div className="mt-6">
        {google && (
          <div className="mb-4">
            <ContinueWithGoogle next={next} />
          </div>
        )}
        <SignInForm next={next} />
      </div>
      <DemoNotice />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to PMRFP?{" "}
        <Link href={signUpHref} className="font-medium text-teal-700 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
