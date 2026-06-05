"use server";

/**
 * Regional waitlist capture — the founding-region guardrail's landing zone.
 *
 * When a PM/trade/supplier hits a region without enough liquidity (or asks for
 * a region we don't list yet), we capture them here instead of dropping demand
 * into a void. Persists to `regional_waitlist` (migration 20260604000001) and
 * fires a GHL sync that no-ops until GHL env vars are set — so this works fully
 * today and lights up the CRM later with zero rework.
 */
import { headers } from "next/headers";
import { regionalWaitlistSchema } from "@/lib/validations";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { syncRegionalWaitlistToGhl } from "@/lib/ghl/sync";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/analytics";

export interface WaitlistActionState {
  error?: string;
  success?: string;
}

async function ip(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

const OK_MESSAGE =
  "You're on the list — we'll email you the moment trades are active in your area.";

export async function joinRegionalWaitlistAction(
  _prev: WaitlistActionState,
  formData: FormData,
): Promise<WaitlistActionState> {
  if (await checkRateLimitByIp(await ip(), "contact")) {
    return { error: "Too many submissions. Please wait a minute and try again." };
  }

  const parsed = regionalWaitlistSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName") ?? "",
    role: formData.get("role") || undefined,
    regionSlug: formData.get("regionSlug") || undefined,
    requestedRegionText: formData.get("requestedRegionText") || undefined,
    province: formData.get("province") || undefined,
    country: formData.get("country") || undefined,
    categorySlug: formData.get("categorySlug") || undefined,
    reason: formData.get("reason") || "early_access",
    company_website: formData.get("company_website") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please enter a valid email." };
  }

  // Honeypot — silently succeed for bots.
  if (parsed.data.company_website && parsed.data.company_website.length > 0) {
    return { success: OK_MESSAGE };
  }

  const d = parsed.data;

  // No Supabase (local/demo) → accept gracefully without persisting.
  if (!isServiceConfigured()) {
    return { success: OK_MESSAGE };
  }

  const svc = createServiceClient();

  // Resolve region details from the slug if one was provided.
  let regionId: string | null = null;
  let regionName: string | null = null;
  let province = d.province ?? null;
  let country = d.country ?? "Canada";
  if (d.regionSlug) {
    const { data: region } = await svc
      .from("regions")
      .select("id,name,province,country")
      .eq("slug", d.regionSlug)
      .maybeSingle<{ id: string; name: string; province: string | null; country: string }>();
    if (region) {
      regionId = region.id;
      regionName = region.name;
      province = province ?? region.province;
      country = d.country ?? region.country ?? "Canada";
    }
  }

  const { error } = await svc.from("regional_waitlist").insert({
    email: d.email,
    full_name: d.fullName || null,
    role: d.role ?? null,
    region_id: regionId,
    requested_region_text: d.requestedRegionText ?? null,
    province,
    country,
    category_slug: d.categorySlug ?? null,
    reason: d.reason,
  });

  if (error) {
    console.error("[waitlist] insert failed", error);
    return { error: "Something went wrong saving your spot. Please try again." };
  }

  // Fire-and-forget CRM sync (no-op until GHL env vars exist).
  await syncRegionalWaitlistToGhl({
    email: d.email,
    fullName: d.fullName || null,
    role: d.role ?? null,
    regionName,
    regionSlug: d.regionSlug ?? null,
    province,
    country,
    reason: d.reason,
  });

  await trackEvent("waitlist_joined" as never, {
    reason: d.reason,
    region: d.regionSlug ?? d.requestedRegionText ?? "unknown",
    country,
    role: d.role ?? "unknown",
  });

  return { success: OK_MESSAGE };
}
