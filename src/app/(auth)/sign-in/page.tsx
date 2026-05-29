import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/forms/auth-forms";
import { DemoNotice } from "@/components/forms/demo-notice";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your PMRFP account.</p>
      <div className="mt-6">
        <SignInForm />
      </div>
      <DemoNotice />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to PMRFP?{" "}
        <Link href="/sign-up" className="font-medium text-gold-700 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
