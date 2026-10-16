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
  if (!isStepId(step) || !isEnabledLocale(lang)) redirect("/admin/lifecycle?test=bad");
  const back = `/admin/lifecycle?step=${step}&lang=${lang}&country=${country}&persona=${persona}`;
  if (isDemoMode() || !session.profile.email) redirect(`${back}&test=demo`);
  const res = await sendTestToAdmin({ to: session.profile.email, userId: session.userId, step, lang, country, persona });
  redirect(`${back}&test=${res.ok ? "sent" : "failed"}`);
}
