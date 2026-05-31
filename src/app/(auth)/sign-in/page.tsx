import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/forms/auth-forms";
import { DemoNotice } from "@/components/forms/demo-notice";
import { safeNextPath } from "@/lib/auth/next";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  const signUpHref = next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up";

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your PMRFP account.</p>
      <div className="mt-6">
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
