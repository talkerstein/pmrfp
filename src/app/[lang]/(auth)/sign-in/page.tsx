import type { Metadata } from "next";
import Link from "@/i18n/link";
import { SignInForm } from "@/components/forms/auth-forms";
import { ContinueWithGoogle } from "@/components/forms/google-button";
import { DemoNotice } from "@/components/forms/demo-notice";
import { safeNextPath } from "@/lib/auth/next";
import { isGoogleAuthEnabled } from "@/lib/auth/google";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  return { title: getDictionary(l).auth.meta.signIn, alternates: alternatesFor(l, "/sign-in") };
}

export default async function SignInPage({
  searchParams, params }: {
  searchParams: Promise<{ next?: string; error?: string; notice?: string }>;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("auth").signIn;
  const td = getT("dedupeClient").signIn;
  const { next: rawNext, error, notice } = await searchParams;
  const next = safeNextPath(rawNext);
  const signUpHref = next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up";
  const google = await isGoogleAuthEnabled();

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.intro}</p>
      {/* Sign-up found an account for this mailbox (lib/dedupe). Same words whatever method it uses. */}
      {notice === "exists" && (
        <div role="status" className="mt-6 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          <p className="font-medium">{td.existsHeading}</p>
          <p className="mt-0.5">
            {td.existsBody}{" "}
            <Link href="/forgot-password" className="font-medium underline">
              {td.existsReset}
            </Link>
            .
          </p>
        </div>
      )}
      {(error === "google" || error === "link") && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === "link" ? t.linkError : t.googleError}
        </p>
      )}
      <div className="mt-6">
        {google && (
          <div className="mb-4">
            <ContinueWithGoogle next={next} />
          </div>
        )}
        <SignInForm next={next} startWithLink={error === "link"} />
      </div>
      <DemoNotice />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t.newTo}{" "}
        <Link href={signUpHref} className="font-medium text-teal-700 hover:underline">
          {t.createAccount}
        </Link>
      </p>
    </div>
  );
}
