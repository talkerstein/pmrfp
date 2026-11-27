import "server-only";
import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { optedOut } from "@/lib/tracking/privacy";
import { FT_COOKIE, parseFirstTouch } from "./cookie";
import { legacyAttributionRow, signupAttributionRow, type SignupMethod } from "./signup";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "@/lib/d1/contracts";

/**
 * Saves where a new account came from (signup_attribution), once per user,
 * on EVERY sign-up path:
 *  - password sign-up: right after the account is created (signUpAction);
 *  - magic-link sign-up (the default on /sign-up, and towns): Supabase
 *    doesn't return the new user's id, so the fresh account is looked up by
 *    its email (recordSignupAttributionForEmail), still in the browser that
 *    carries the first-touch cookie; the emailed link's callback writes it
 *    too if that lookup missed;
 *  - Google: at the OAuth callback, the moment the account exists (the
 *    role is added when they pick it);
 *  - onboarding completion attaches the organization and fills in a row if
 *    none was written (an older tab, a failed write).
 * The first write wins: later calls never change the first-touch fields,
 * they only fill in the org and the role when those were unknown. Reads the pmrfp_ft cookie of THIS request (server actions and
 * route handlers only). Do-Not-Track / Global Privacy Control: the row
 * keeps only the method and role. Never throws, never blocks sign-up.
 *
 * Why the table was empty until 2026-10-21: only the password path wrote
 * at sign-up, and the sign-up page defaults to the emailed link; link and
 * Google sign-ups waited for onboarding to finish (most never did), and
 * town sign-ups never wrote at all.
 */

export interface RecordInput {
  userId: string;
  orgId?: string | null;
  method?: SignupMethod | null;
  role?: string | null;
  lang?: string | null;
  /** The account's creation time, when known (the callback), so a late write keeps the real date. */
  signedUpAt?: string | null;
}

/** A Postgres/PostgREST refusal that means "this database predates migration 20261021000200". */
function isLegacySchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703" || error.code === "23514" || /column|schema cache|check constraint/i.test(error.message ?? "");
}

export async function recordSignupAttribution(i: RecordInput): Promise<void> {
  const native = isVpsLiveCustomerAuth();
  if (!i.userId || (!native && !isServiceConfigured())) return;
  try {
    const [jar, h] = await Promise.all([cookies(), headers()]);
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0];
    const row = signupAttributionRow({
      userId: i.userId,
      orgId: i.orgId ?? null,
      ft: parseFirstTouch(jar.get(FT_COOKIE)?.value),
      method: i.method ?? null,
      role: i.role ?? null,
      optedOut: optedOut(h),
      fallback: { lang: i.lang ?? null, country: (h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country"))?.toUpperCase() ?? null },
      ownHosts: host ? [host] : [],
      signedUpAt: i.signedUpAt ?? null,
    });
    if (native) {
      await vpsAppDatabase().prepare(`INSERT INTO signup_attribution
        (user_id,org_id,channel,landing_path,referrer_host,utm_source,utm_medium,utm_campaign,utm_content,
         last_utm_source,last_utm_medium,last_utm_campaign,last_utm_content,last_touch_at,first_seen,signed_up_at,lang,country,method,role,opted_out)
        SELECT u.id,(SELECT organization_id FROM organization_members WHERE organization_id=? AND user_id=u.id),
          ?,?,?,?,?,?,?,?,?,?,?,?,?,coalesce(?,u.created_at),?,?,?,?,?
        FROM users_profile u WHERE u.id=? AND ${customerAppAuthority}
        ON CONFLICT(user_id) DO UPDATE SET org_id=coalesce(signup_attribution.org_id,excluded.org_id),
          role=coalesce(signup_attribution.role,excluded.role)`)
        .bind(row.org_id,row.channel,row.landing_path,row.referrer_host,row.utm_source,row.utm_medium,row.utm_campaign,row.utm_content,
          row.last_utm_source,row.last_utm_medium,row.last_utm_campaign,row.last_utm_content,row.last_touch_at,row.first_seen,
          i.signedUpAt ? row.signed_up_at : null,row.lang,row.country,row.method,row.role,Number(row.opted_out),row.user_id).run();
      return;
    }
    const admin = createServiceClient();
    let legacy = false;
    let { error } = await admin.from("signup_attribution").upsert(row, { onConflict: "user_id", ignoreDuplicates: true });
    if (error && isLegacySchemaError(error)) {
      legacy = true;
      ({ error } = await admin.from("signup_attribution").upsert(legacyAttributionRow(row), { onConflict: "user_id", ignoreDuplicates: true }));
    }
    if (error) {
      console.warn("[attribution] save failed:", error.code ?? "", error.message);
      return;
    }
    // Fill in what an earlier write didn't know. Each only touches a null.
    if (i.orgId) {
      await admin.from("signup_attribution").update({ org_id: i.orgId }).eq("user_id", i.userId).is("org_id", null);
    }
    // A Google account's row is written at the callback, before the role is picked.
    if (row.role && !legacy) {
      await admin.from("signup_attribution").update({ role: row.role }).eq("user_id", i.userId).is("role", null);
    }
  } catch (e) {
    console.warn("[attribution] save failed:", e instanceof Error ? e.message : e);
  }
}

/** A magic-link account counts as "just created" for this long after the link was requested. */
export const FRESH_SIGNUP_MS = 15 * 60_000;

/**
 * Magic-link sign-up: Supabase creates the account (and handle_new_user its
 * profile) when the link is requested, but returns no id. Find it by its
 * email, only if it was created in the last few minutes (so an older
 * account that merely asked for a link is never re-attributed), and record.
 */
export async function recordSignupAttributionForEmail(i: Omit<RecordInput, "userId"> & { email: string }): Promise<void> {
  const native = isVpsLiveCustomerAuth();
  if (!i.email || (!native && !isServiceConfigured())) return;
  try {
    if (native) {
      const data = await vpsAppDatabase().prepare(`SELECT id,created_at FROM users_profile WHERE lower(email)=?
        AND ${customerAppAuthority} ORDER BY created_at DESC LIMIT 1`).bind(i.email.trim().toLowerCase())
        .first<{ id: string; created_at: string }>();
      if (data && Date.now() - Date.parse(data.created_at) <= FRESH_SIGNUP_MS) {
        await recordSignupAttribution({ ...i, userId: data.id, signedUpAt: data.created_at });
      }
      return;
    }
    const { data, error } = await createServiceClient()
      .from("users_profile")
      .select("id,created_at")
      .eq("email", i.email.trim().toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; created_at: string }>();
    if (error || !data) {
      if (error) console.warn("[attribution] lookup failed:", error.message);
      return;
    }
    if (Date.now() - Date.parse(data.created_at) > FRESH_SIGNUP_MS) return;
    await recordSignupAttribution({ ...i, userId: data.id, signedUpAt: data.created_at });
  } catch (e) {
    console.warn("[attribution] lookup failed:", e instanceof Error ? e.message : e);
  }
}
