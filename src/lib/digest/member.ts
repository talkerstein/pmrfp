import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { MEMBER_CONSENT_VERSION, MEMBER_SOURCE, decideMemberSubscribe, type DigestLang } from "./config";

/**
 * A trade or supplier ticked "send me the free weekly email" while finishing
 * their company profile: put them on the weekly list (digest_subscribers).
 *
 * Before this, sign-up promised every free trade a weekly tender email, but
 * creating an account never added anyone to the list the weekly job sends
 * to. Only the separate "email me bids" boxes did.
 *
 * The address comes from the auth user, never from the form, and it must be
 * confirmed there (the emailed link, a confirmed password sign-up, Google).
 * That is the proof a second confirmation email would give, so the row goes
 * straight to active. The consent is the tick itself, recorded on the row
 * with its time, source and wording version.
 *
 * Sends nothing. The weekly email itself still waits for
 * WEEKLY_DIGEST_ENABLED (api/cron/weekly-digest). Never throws and never
 * blocks onboarding. Returns true when the person is now on the list.
 */
export async function subscribeMemberToDigest(input: {
  userId: string;
  /** The company's province/state as typed on the form. */
  provinceRaw: string | null | undefined;
  /** The trade category slugs the company picked. */
  trades: readonly string[];
  lang: string;
}): Promise<boolean> {
  if (!input.userId || !isServiceConfigured()) return false;
  try {
    const db = createServiceClient();
    const { data: auth } = await db.auth.admin.getUserById(input.userId);
    const email = auth?.user?.email?.trim() ?? "";
    if (!email) return false;
    const key = email.toLowerCase();

    const [{ data: existing }, { data: suppressed }] = await Promise.all([
      db
        .from("digest_subscribers")
        .select("id,status,confirm_sent_at,trades")
        .eq("email_key", key)
        .maybeSingle<{ id: string; status: string; confirm_sent_at: string | null; trades: string[] | null }>(),
      db.from("email_suppressions").select("email_key").eq("email_key", key).maybeSingle(),
    ]);
    // Only trades that exist: the form's picks, plus any an earlier pending sign-up already had.
    const asked = [...new Set([...input.trades, ...(existing?.trades ?? [])].map(String))].slice(0, 200);
    const { data: known } = asked.length ? await db.from("trade_categories").select("slug").in("slug", asked) : { data: [] };
    const decision = decideMemberSubscribe({
      emailConfirmed: Boolean(auth?.user?.email_confirmed_at),
      existing: existing ?? null,
      suppressed: Boolean(suppressed),
      provinceRaw: input.provinceRaw,
      trades: input.trades,
      validTrades: new Set(((known ?? []) as { slug: string }[]).map((c) => c.slug)),
    });
    if (decision.kind === "skip") {
      if (decision.why === "active") return true;
      console.info(`[digest] member not added: ${decision.why}`);
      return false;
    }

    const lang: DigestLang = input.lang === "fr" || input.lang === "es" ? input.lang : "en";
    const now = new Date().toISOString();
    const row = {
      email,
      country: decision.country,
      province: decision.province,
      trades: decision.trades,
      lang,
      status: "active",
      confirmed_at: now,
      confirm_token_hash: null,
      confirm_sent_at: null,
      source: MEMBER_SOURCE,
      consent_text_version: MEMBER_CONSENT_VERSION,
      consent_at: now,
      updated_at: now,
      user_id: input.userId,
    };
    const { error } = existing
      ? await db.from("digest_subscribers").update(row).eq("id", existing.id)
      : await db.from("digest_subscribers").insert(row);
    if (error) {
      console.error("[digest] member sign-up failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[digest] member sign-up failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
