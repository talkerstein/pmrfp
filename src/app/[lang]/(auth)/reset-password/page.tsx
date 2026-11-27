import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/forms/auth-forms";
import { isVpsNativeAccountRecovery, isVpsNativeAccountSignup } from "@/lib/d1/staging-config";
import { safeNextPath } from "@/lib/auth/next";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  return { title: getDictionary(l).auth.meta.resetPassword, alternates: alternatesFor(l, "/reset-password") };
}

export default async function ResetPasswordPage({ params, searchParams }: {
  params: Promise<object>; searchParams: Promise<{ flow?: string; next?: string }>;
}) {
  await setLangFrom(params);
  const auth = getT("auth");
  const t = auth.resetPassword;
  const query = await searchParams;
  const signup = isVpsNativeAccountSignup() && query.flow === "signup";
  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{signup ? auth.forms.createAccount : t.heading}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.intro}</p>
      <div className="mt-6">
        <ResetPasswordForm native={isVpsNativeAccountRecovery()} signup={signup} next={safeNextPath(query.next)} />
      </div>
    </div>
  );
}
