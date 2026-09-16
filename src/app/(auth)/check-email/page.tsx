import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { ResendConfirmation } from "@/components/forms/resend-confirmation";

export const metadata: Metadata = { title: "Check your email" };

/**
 * Post-signup landing when email confirmation is required (no session yet).
 * Without this, new signups were silently bounced to /sign-in with no
 * explanation — a dead end for invited trades.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <span className="flex size-12 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
        <MailCheck className="size-6" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        We sent a confirmation link{email ? <> to <b className="text-foreground">{email}</b></> : null}.
        Click it and you&apos;ll land right in your account setup — it takes about two minutes
        from there.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Don&apos;t see it within a minute? Check your spam or junk folder. The sender is{" "}
        <span className="font-mono">Supabase Auth</span> on behalf of PMRFP.
      </p>
      <div className="mt-5">
        <ResendConfirmation email={email} />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already confirmed?{" "}
        <Link href="/sign-in" className="font-medium text-teal-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
