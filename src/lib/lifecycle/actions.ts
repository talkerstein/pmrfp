"use server";

import { redirect } from "next/navigation";
import { isDemoMode, requireRole } from "@/lib/access/access";
import { isEnabledLocale } from "@/i18n/config";
import { isStepId } from "./config";
import { sendTestToAdmin } from "./server";
import type { Persona } from "./persona";

const PERSONAS: readonly Persona[] = ["recurring", "specialty", "subtrade"];

/**
 * /admin/lifecycle "Send test to me": the previewed sample email, to the
 * signed-in admin's own address only (never a member), subject marked [Test].
 */
export async function sendLifecycleTestAction(formData: FormData): Promise<void> {
  const session = await requireRole(["admin", "super_admin"]);
  const step = formData.get("step");
  const lang = formData.get("lang");
  const country = formData.get("country") === "US" ? "US" : "CA";
  const persona = PERSONAS.find((p) => p === formData.get("persona")) ?? "specialty";
  // The badge emails' preview switches: the reward line, and a company with no website.
  const reward = formData.get("reward") === "1" ? true : formData.get("reward") === "0" ? false : undefined;
  const website = formData.get("website") === "0" ? false : undefined;
  if (!isStepId(step) || !isEnabledLocale(lang)) redirect("/admin/lifecycle?test=bad");
  const back =
    `/admin/lifecycle?step=${step}&lang=${lang}&country=${country}&persona=${persona}` +
    `${reward === undefined ? "" : `&reward=${reward ? 1 : 0}`}${website === false ? "&website=0" : ""}`;
  if (isDemoMode() || !session.profile.email) redirect(`${back}&test=demo`);
  const res = await sendTestToAdmin({ to: session.profile.email, userId: session.userId, step, lang, country, persona, reward, website });
  redirect(`${back}&test=${res.ok ? "sent" : "failed"}`);
}
