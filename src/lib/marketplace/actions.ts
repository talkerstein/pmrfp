"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, isAdminRole } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { sendAdminMarketplaceReport, sendMarketplaceContact } from "@/lib/email/send";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";
import { countActiveListings, sellerEmail } from "./data";
import {
  canAddListing,
  contactSchema,
  firstErrorCode,
  listingSchema,
  listingSlug,
  renewedExpiry,
  reportSchema,
  sanitizeListingPhotos,
  type ErrorCode,
} from "./rules";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

export interface MarketFormState {
  error?: ErrorCode;
  ok?: boolean;
}

function langOf(v: unknown): Locale {
  return isEnabledLocale(v) ? v : DEFAULT_LOCALE;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

function parsePhotos(raw: FormDataEntryValue | null): unknown[] {
  try {
    const v = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Create or edit a listing (owner). Free accounts: FREE_LISTING_LIMIT active at once. */
export async function saveListingAction(_prev: MarketFormState, formData: FormData): Promise<MarketFormState> {
  const lang = langOf(formData.get("lang"));
  if (!isSupabaseConfigured()) return { error: "unavailable" };
  const session = await getSession();
  if (!session) redirect(localizePath(`/sign-in?next=${encodeURIComponent("/marketplace/new")}`, lang));

  const parsed = listingSchema.safeParse({
    title: formData.get("title") ?? "",
    category: formData.get("category") ?? "",
    condition: formData.get("condition") ?? "",
    description: formData.get("description") ?? "",
    priceOnRequest: formData.get("priceOnRequest") === "on",
    price: formData.get("price") ?? "",
    currency: formData.get("currency") ?? "CAD",
    city: formData.get("city") ?? "",
    regionSlug: formData.get("regionSlug") ?? "",
    country: formData.get("country") ?? "CA",
    photos: parsePhotos(formData.get("photos")),
    publish: formData.get("intent") !== "draft",
  });
  if (!parsed.success) return { error: firstErrorCode(parsed.error.issues) };
  const d = parsed.data;
  // Only photos our upload route stored in this user's folder.
  const photos = sanitizeListingPhotos(d.photos, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", session.userId);

  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();
  let existing: { id: string; slug: string; status: string } | null = null;
  if (id) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("id,slug,status,user_id")
      .eq("id", id)
      .maybeSingle<{ id: string; slug: string; status: string; user_id: string }>();
    if (error) return { error: "unavailable" };
    if (!data || data.user_id !== session.userId) return { error: "notFound" };
    if (data.status === "removed") return { error: "notFound" };
    existing = data;
  }

  const status = d.publish ? "active" : "draft";
  if (status === "active") {
    const active = await countActiveListings(session.userId, existing?.id);
    if (!canAddListing(session.hasTradeAccess, active)) return { error: "limit" };
  }

  const row = {
    title: d.title,
    category: d.category,
    condition: d.condition,
    description: d.description,
    price_on_request: d.priceOnRequest,
    price_cents: d.priceOnRequest || d.price == null ? null : Math.round(d.price * 100),
    currency: d.currency,
    city: d.city || null,
    region_slug: d.regionSlug || null,
    country: d.country,
    photos,
    status,
    organization_id: session.organization?.id ?? null,
  };

  let slug: string;
  if (existing) {
    const { error } = await supabase
      .from("marketplace_listings")
      .update({ ...row, ...(status === "active" && existing.status !== "active" ? { expires_at: renewedExpiry().toISOString() } : {}) })
      .eq("id", existing.id);
    if (error) return { error: "save" };
    slug = existing.slug;
  } else {
    slug = listingSlug(d.title);
    let { error } = await supabase.from("marketplace_listings").insert({ ...row, slug, user_id: session.userId });
    if (error?.code === "23505") {
      slug = listingSlug(d.title);
      ({ error } = await supabase.from("marketplace_listings").insert({ ...row, slug, user_id: session.userId }));
    }
    if (error) return { error: error.code === "42P01" || error.code === "PGRST205" ? "unavailable" : "save" };
  }

  revalidatePath("/marketplace");
  redirect(localizePath(`/marketplace/${slug}?saved=1`, lang));
}

/** Owner: mark sold, relist (renews 60 days), or move back to draft. */
export async function setListingStatusAction(formData: FormData): Promise<void> {
  const lang = langOf(formData.get("lang"));
  const back = localizePath("/dashboard/listings", lang);
  const session = await getSession();
  if (!session || !isSupabaseConfigured()) redirect(localizePath("/sign-in", lang));
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("status") ?? "");
  if (!id || !["sold", "active", "draft"].includes(next)) redirect(back);

  if (next === "active") {
    const active = await countActiveListings(session.userId, id);
    if (!canAddListing(session.hasTradeAccess, active)) redirect(`${back}?error=limit`);
  }
  const supabase = await createClient();
  await supabase
    .from("marketplace_listings")
    .update({ status: next, ...(next === "active" ? { expires_at: renewedExpiry().toISOString() } : {}) })
    .eq("id", id)
    .eq("user_id", session.userId);
  revalidatePath("/marketplace");
  redirect(back);
}

/** Owner: delete for good. */
export async function deleteListingAction(formData: FormData): Promise<void> {
  const lang = langOf(formData.get("lang"));
  const session = await getSession();
  if (!session || !isSupabaseConfigured()) redirect(localizePath("/sign-in", lang));
  const id = String(formData.get("id") ?? "");
  if (id) {
    const supabase = await createClient();
    await supabase.from("marketplace_listings").delete().eq("id", id).eq("user_id", session.userId);
    revalidatePath("/marketplace");
  }
  redirect(localizePath("/dashboard/listings", lang));
}

/** Admin: take a listing down (or restore it). */
export async function adminSetListingStatusAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || !isAdminRole(session.profile.primary_role)) redirect("/sign-in");
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("status") ?? "");
  if (id && ["removed", "active"].includes(next)) {
    const supabase = await createClient();
    await supabase.from("marketplace_listings").update({ status: next }).eq("id", id);
    revalidatePath("/marketplace");
  }
  redirect("/admin/marketplace");
}

/**
 * Buyer → seller message. Relayed by email with Reply-To the buyer; the
 * seller's address never reaches the page. Rate-limited per IP + honeypot.
 */
export async function contactSellerAction(_prev: MarketFormState, formData: FormData): Promise<MarketFormState> {
  const parsed = contactSchema.safeParse({
    slug: formData.get("slug") ?? "",
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    message: formData.get("message") ?? "",
    website: formData.get("website") ?? "",
  });
  // Honeypot filled: pretend it worked.
  if (String(formData.get("website") ?? "") !== "") return { ok: true };
  if (!parsed.success) return { error: firstErrorCode(parsed.error.issues) };
  if (await checkRateLimitByIp(await clientIp(), "contact")) return { error: "rateLimited" };
  if (!isServiceConfigured()) return { error: "unavailable" };

  const admin = createServiceClient();
  const { data: listing, error } = await admin
    .from("marketplace_listings")
    .select("id,user_id,title,slug,status,expires_at")
    .eq("slug", parsed.data.slug)
    .maybeSingle<{ id: string; user_id: string; title: string; slug: string; status: string; expires_at: string }>();
  if (error) return { error: "unavailable" };
  if (!listing || listing.status !== "active" || new Date(listing.expires_at) <= new Date()) return { error: "notFound" };

  const to = await sellerEmail(listing.user_id);
  if (!to) return { error: "send" };
  await admin.from("marketplace_messages").insert({
    listing_id: listing.id,
    sender_email: parsed.data.email,
    sender_name: parsed.data.name,
    body: parsed.data.message,
  });
  await sendMarketplaceContact({
    to,
    listingTitle: listing.title,
    listingUrl: `${BASE}/marketplace/${listing.slug}`,
    buyer: { name: parsed.data.name, email: parsed.data.email },
    message: parsed.data.message,
  });
  return { ok: true };
}

/** Anyone can report a listing; the admin gets an email. */
export async function reportListingAction(_prev: MarketFormState, formData: FormData): Promise<MarketFormState> {
  if (String(formData.get("website") ?? "") !== "") return { ok: true };
  const parsed = reportSchema.safeParse({
    slug: formData.get("slug") ?? "",
    reason: formData.get("reason") ?? "",
    email: formData.get("email") ?? "",
    website: "",
  });
  if (!parsed.success) return { error: firstErrorCode(parsed.error.issues) };
  if (await checkRateLimitByIp(await clientIp(), "contact")) return { error: "rateLimited" };

  let title = parsed.data.slug;
  if (isServiceConfigured()) {
    const { data } = await createServiceClient()
      .from("marketplace_listings")
      .select("title")
      .eq("slug", parsed.data.slug)
      .maybeSingle<{ title: string }>();
    if (data?.title) title = data.title;
  }
  await sendAdminMarketplaceReport({
    listingTitle: title,
    listingUrl: `${BASE}/marketplace/${parsed.data.slug}`,
    reason: parsed.data.reason,
    reporterEmail: parsed.data.email ?? null,
  });
  return { ok: true };
}
