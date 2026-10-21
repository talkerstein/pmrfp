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
 * One click: start the organization's 14-day Trade Pro trial. Signed-out
 * visitors (pricing page) go to sign-up and land on /dashboard/trial after.
 * Always ends on a page that says what happened (?trial=started|used|…).
 */
export async function startTrialAction(formData: FormData): Promise<void> {
  const lang = await formLang(formData);
  const source = parseTrialSource(formData.get("source"));
  if (!isSupabaseConfigured()) redirect(localizePath("/dashboard?trial=unavailable", lang));
  const session = await getSession();
  if (!session) redirect(localizePath(`/sign-up?role=trade&next=${encodeURIComponent("/dashboard/trial")}`, lang));
  const result = await startOrgTrial(session, source);
  if (result.ok) await trackEvent(EVENT.TRIAL_STARTED, { source }, { userId: session.userId, role: session.profile.primary_role });
  revalidatePath("/[lang]/dashboard", "layout");
  redirect(localizePath(`/dashboard?trial=${result.ok ? "started" : result.reason}`, lang));
}
