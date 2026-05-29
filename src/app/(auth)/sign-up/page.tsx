import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/forms/auth-forms";
import { DemoNotice } from "@/components/forms/demo-notice";
import { COPY } from "@/lib/site";

export const metadata: Metadata = { title: "Join PMRFP" };

export default function SignUpPage() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Join PMRFP</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create your account in under a minute.
      </p>
      <div className="mt-6">
        <SignUpForm />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{COPY.signupDisclaimer}</p>
      <DemoNotice />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-gold-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
