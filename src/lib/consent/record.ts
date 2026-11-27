import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { isMissingRelation } from "@/lib/dedupe/review";
import { consentRow, type ConsentScope, type ConsentSource } from "./email";

/**
 * Writes email_consents (migration 20261022000100). Idempotent: one row per
 * person, scope and source, the first one kept. Never throws and never
 * blocks sign-up or onboarding; a database that hasn't run the migration yet
 * (missing table) is skipped quietly, with one console line.
 */
export async function recordEmailConsent(userId: string | null | undefined, scope: ConsentScope, source: ConsentSource, lang?: string | null): Promise<void> {
  const row = consentRow(userId, scope, source, lang);
  const native = isVpsLiveCustomerAuth();
  if (!row || (!native && !isServiceConfigured())) return;
  try {
    if (native) {
      await vpsAppDatabase().prepare(`INSERT INTO email_consents(user_id,scope,source,wording_version,lang)
        SELECT id,?,?,?,? FROM users_profile WHERE id=? AND status='active' AND ${customerAppAuthority}
        ON CONFLICT(user_id,scope,source) DO NOTHING`)
        .bind(row.scope,row.source,row.wording_version,row.lang,row.user_id).run();
      return;
    }
    const { error } = await createServiceClient().from("email_consents").upsert(row, { onConflict: "user_id,scope,source", ignoreDuplicates: true });
    if (error) {
      if (isMissingRelation(error)) console.info("[consent] email_consents is not there yet (migration 20261022000100 pending)");
      else console.warn("[consent] save failed:", error.code ?? "", error.message);
    }
  } catch (e) {
    console.warn("[consent] save failed:", e instanceof Error ? e.message : e);
  }
}

/** A magic-link account counts as "just created" for this long after the link was requested. */
const FRESH_MS = 15 * 60_000;

/**
 * Magic-link sign-up: Supabase returns no user id, so the fresh account is
 * found by its email (created in the last few minutes, never an older one).
 */
export async function recordEmailConsentForEmail(email: string, scope: ConsentScope, source: ConsentSource, lang?: string | null): Promise<void> {
  const native = isVpsLiveCustomerAuth();
  if (!email || (!native && !isServiceConfigured())) return;
  try {
    type User = { id: string; created_at: string };
    const data = native ? await vpsAppDatabase().prepare(`SELECT id,created_at FROM users_profile
      WHERE email=? AND status='active' AND ${customerAppAuthority} ORDER BY created_at DESC LIMIT 1`)
      .bind(email.trim().toLowerCase()).first<User>() : (await createServiceClient()
      .from("users_profile")
      .select("id,created_at")
      .eq("email", email.trim().toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<User>()).data;
    if (!data || Date.now() - Date.parse(data.created_at) > FRESH_MS) return;
    await recordEmailConsent(data.id, scope, source, lang);
  } catch (e) {
    console.warn("[consent] lookup failed:", e instanceof Error ? e.message : e);
  }
}
