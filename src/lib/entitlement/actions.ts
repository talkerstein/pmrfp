"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSession } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { EVENT, trackEvent } from "@/lib/analytics";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, splitLocale, type Locale } from "@/i18n/config";
import { startOrgTrial } from "./server";
import { parseTrialSource } from "./trial";
import { safeReturnPath, trialSignUpHref, withTrialStartedParam } from "./gate";

/** The language to send the visitor back in: the form's hidden `lang`, else the Referer's. */
async function formLang(formData: FormData): Promise<Locale> {
  const field = formData.get("lang");
  if (isEnabledLocale(field)) return field;
  const referer = (await headers()).get("referer");
  if (referer) {
    try {
      const { lang } = splitLocale(new URL(referer).pathname);
      if (isEnabledLocale(lang)) return lang;
    } catch {
      // not a URL
    }
  }
  return DEFAULT_LOCALE;
}

/**
 * One click: start the organization's 14-day Trade Pro trial. Next.js checks
 * the Origin of every server action, so another site cannot post this form.
 * Signed-out visitors go to sign-up for the trial, which resumes after
 * onboarding. The hidden `return` field (a same-site path, validated by
 * safeReturnPath) brings a member who just started, or already has, the
 * trial back to the exact page they were on, now unlocked; any other outcome
 * ends on the dashboard with a line that says what happened (?trial=used|…).
 */
export async function startTrialAction(formData: FormData): Promise<void> {
  const lang = await formLang(formData);
  const source = parseTrialSource(formData.get("source"));
  const returnTo = safeReturnPath(typeof formData.get("return") === "string" ? (formData.get("return") as string) : null);
  if (!isSupabaseConfigured()) redirect(localizePath("/dashboard?trial=unavailable", lang));
  const session = await getSession();
  if (!session) redirect(localizePath(trialSignUpHref(source, returnTo), lang));
  const result = await startOrgTrial(session, source);
  if (result.ok) await trackEvent(EVENT.TRIAL_STARTED, { source }, { userId: session.userId, role: session.profile.primary_role });
  revalidatePath("/[lang]/dashboard", "layout");
  // Entitled already (started just now, or a double click / a paying member): back to the page they came from.
  // ?trial=started makes the page frame ask for the trial banner straight away.
  if (returnTo && result.ok) redirect(localizePath(withTrialStartedParam(returnTo), lang));
  if (returnTo && !result.ok && (result.reason === "used" || result.reason === "paid")) redirect(localizePath(returnTo, lang));
  redirect(localizePath(`/dashboard?trial=${result.ok ? "started" : result.reason}`, lang));
}
