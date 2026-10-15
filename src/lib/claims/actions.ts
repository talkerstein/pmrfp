"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { winnerFacts } from "@/lib/badge/winner-facts";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { canClaim, claimMethod, hostOf } from "./domain";

/**
 * "Is this your company? Claim this page" on /contract-winners/<slug>.
 * The claimant must be signed in with a contractor, supplier or builder
 * company. Their email domain matching the company website (and the website
 * matching the winner's name) approves at once; anything else waits for an
 * admin. A claim links the page to the organization; it never edits the
 * public award facts.
 */

const LANGS: Locale[] = ["en", "fr", "es"];

function claimPath(slug: string, lang: Locale, q?: Record<string, string>): string {
  const path = localizePath(`/contract-winners/${slug}/claim`, lang);
  const qs = q ? new URLSearchParams(q).toString() : "";
  return qs ? `${path}?${qs}` : path;
}

function revalidateWinner(slug: string) {
  for (const l of LANGS) revalidatePath(`/${l}/contract-winners/${slug}`);
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function submitWinnerClaimAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").slice(0, 120);
  const rawLang = String(formData.get("lang") ?? "en");
  const lang: Locale = hasLocale(rawLang) ? rawLang : "en";
  if (!slug) redirect(localizePath("/contract-winners", lang));

  const session = await getSession();
  if (!session) redirect(`${localizePath("/sign-in", lang)}?next=${encodeURIComponent(claimPath(slug, lang))}`);
  const org = session.organization;
  if (!org || !canClaim(org.organization_type)) redirect(claimPath(slug, lang));
  if (!isServiceConfigured()) redirect(claimPath(slug, lang, { error: "failed" }));
  if (await checkRateLimitByIp(await clientIp(), "contact")) redirect(claimPath(slug, lang, { error: "rate" }));

  const winner = await winnerFacts(slug);
  if (!winner) redirect(localizePath("/contract-winners", lang));

  const websiteRaw = String(formData.get("website") ?? "").trim().slice(0, 300) || org!.website || "";
  const host = hostOf(websiteRaw);
  if (!host) redirect(claimPath(slug, lang, { error: "website" }));
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;

  const db = createServiceClient();
  const { data: live } = await db
    .from("winner_claims")
    .select("id,organization_id")
    .eq("winner_slug", slug)
    .eq("status", "approved")
    .maybeSingle<{ id: string; organization_id: string }>();
  if (live) redirect(claimPath(slug, lang, live.organization_id === org!.id ? { status: "approved" } : { error: "taken" }));

  const method = claimMethod({ email: session.profile.email, website: websiteRaw, winnerName: winner!.name });
  const approved = method === "email_domain";
  const now = new Date().toISOString();
  const row = {
    winner_slug: slug,
    winner_name: winner!.name.slice(0, 300),
    organization_id: org!.id,
    user_id: session.userId,
    email: session.profile.email.slice(0, 254),
    website: host,
    method,
    status: approved ? "approved" : "pending",
    note,
    reviewed_at: approved ? now : null,
  };

  // One open claim per person per page: update a pending one instead of adding another.
  const { data: open } = await db
    .from("winner_claims")
    .select("id")
    .eq("winner_slug", slug)
    .eq("user_id", session.userId)
    .eq("status", "pending")
    .maybeSingle<{ id: string }>();
  const { data: saved, error } = open
    ? await db.from("winner_claims").update(row).eq("id", open.id).select("id").single<{ id: string }>()
    : await db.from("winner_claims").insert(row).select("id").single<{ id: string }>();
  if (error || !saved) {
    // 23505: someone else's claim went live between our check and the write.
    redirect(claimPath(slug, lang, { error: error?.code === "23505" ? "taken" : "failed" }));
  }

  // A verified claim with no website on the company profile: fill it in.
  if (approved && !org!.website) await db.from("organizations").update({ website: `https://${host}` }).eq("id", org!.id);

  await logAudit({
    actorUserId: session.userId,
    action: approved ? "winner_claim.auto_approved" : "winner_claim.submitted",
    entityType: "organization",
    entityId: org!.id,
    metadata: { claimId: saved!.id, winnerSlug: slug, method, website: host },
  });
  if (approved) revalidateWinner(slug);
  redirect(claimPath(slug, lang, { status: approved ? "approved" : "pending" }));
}

/* ------------------------------------------------------------------ admin */

const BACK = "/admin/winner-claims";
function back(params: Record<string, string>): never {
  redirect(`${BACK}?${new URLSearchParams(params).toString()}`);
}

async function review(formData: FormData, status: "approved" | "rejected" | "revoked"): Promise<void> {
  const session = await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) back({ error: "Missing claim." });
  const adminNote = String(formData.get("adminNote") ?? "").trim().slice(0, 1000) || null;
  const db = createServiceClient();
  const { data: claim } = await db
    .from("winner_claims")
    .select("id,winner_slug,organization_id,status")
    .eq("id", id)
    .maybeSingle<{ id: string; winner_slug: string; organization_id: string; status: string }>();
  if (!claim) back({ error: "Claim not found." });
  const { error } = await db
    .from("winner_claims")
    .update({ status, admin_note: adminNote, reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) back({ error: error.code === "23505" ? "Another claim for this page is already approved. Revoke it first." : `Could not save: ${error.message}` });
  await logAudit({
    actorUserId: session.userId,
    action: `winner_claim.${status}`,
    entityType: "organization",
    entityId: claim!.organization_id,
    metadata: { claimId: id, winnerSlug: claim!.winner_slug, adminNote },
  });
  revalidateWinner(claim!.winner_slug);
  revalidatePath(BACK);
  back({ ok: `Claim ${status}.` });
}

export async function approveWinnerClaimAction(formData: FormData): Promise<void> {
  return review(formData, "approved");
}
export async function rejectWinnerClaimAction(formData: FormData): Promise<void> {
  return review(formData, "rejected");
}
export async function revokeWinnerClaimAction(formData: FormData): Promise<void> {
  return review(formData, "revoked");
}
