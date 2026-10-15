import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { confirmTokenValid } from "@/lib/digest/config";
import { localizePath, hasLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

/**
 * Double opt-in: the link in the confirmation email. A valid, unexpired
 * token turns the sign-up active (recording when), then lands on
 * /weekly-email in the subscriber's language. Anything else lands there with
 * ?invalid=1 and changes nothing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("s") ?? "";
  const token = url.searchParams.get("t");
  const to = (lang: string, q: string) => NextResponse.redirect(new URL(`${localizePath("/weekly-email", hasLocale(lang) ? lang : "en")}?${q}`, url.origin), 303);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isServiceConfigured()) return to("en", "invalid=1");

  const db = createServiceClient();
  const { data: sub } = await db
    .from("digest_subscribers")
    .select("id,status,lang,confirm_token_hash,confirm_sent_at")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; lang: string; confirm_token_hash: string | null; confirm_sent_at: string | null }>();
  if (!sub) return to("en", "invalid=1");
  if (sub.status === "active") return to(sub.lang, "confirmed=1");
  if (sub.status !== "pending" || !confirmTokenValid(token, sub.confirm_token_hash, sub.confirm_sent_at)) return to(sub.lang, "invalid=1");

  const now = new Date().toISOString();
  const { error } = await db
    .from("digest_subscribers")
    .update({ status: "active", confirmed_at: now, confirm_token_hash: null, updated_at: now })
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    console.error("[digest] confirm failed:", error.message);
    return to(sub.lang, "invalid=1");
  }
  return to(sub.lang, "confirmed=1");
}
