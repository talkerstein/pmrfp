/**
 * Managed buyer pages: what a verified public buyer edits on its own page
 * (table buyer_pages, migration 20261021000040_public_buyer_towns.sql), and
 * the shape pages read from the buyer_pages_public view. Pure (zod only), so
 * the edit form, the action and the tests share it.
 */
import { z } from "zod";
import { PERMISSION_STATUSES, type BuyerPermission, type PermissionRegistry } from "@/lib/buyers/permissions";

/** "ontario/town-of-cobourg": a page's key in buyer_pages / buyer_claims / buyer_domains (its URL under /buyers). */
export const BUYER_KEY = /^[a-z0-9-]{2,40}\/[a-z0-9][a-z0-9-]{0,119}$/;

export const buyerKey = (provinceSlug: string, slug: string) => `${provinceSlug}/${slug}`;

export function parseBuyerKey(v: unknown): { provinceSlug: string; slug: string } | null {
  if (typeof v !== "string" || !BUYER_KEY.test(v)) return null;
  const [provinceSlug, slug] = v.split("/");
  return { provinceSlug, slug };
}

export interface UpcomingPurchase {
  title: string;
  /** Expected month, "YYYY-MM". */
  month: string;
}

export interface ManagedPage {
  buyerKey: string;
  provinceCode: string;
  buyerName: string;
  /** The managing organization ("Town of Cobourg"). */
  organizationName: string;
  verifiedAt: string;
  logoUrl: string | null;
  /** Only when the buyer chose to show it publicly. */
  contactEmail: string | null;
  contactPhone: string | null;
  bidsUrl: string | null;
  platformUrl: string | null;
  vendorRegistrationUrl: string | null;
  intro: string | null;
  upcoming: UpcomingPurchase[];
  updatedAt: string;
}

export const MAX_UPCOMING = 12;
export const MAX_INTRO = 600;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A stored upcoming list → clean rows, by month (bad rows dropped). */
export function cleanUpcoming(v: unknown): UpcomingPurchase[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is { title: unknown; month: unknown } => !!x && typeof x === "object")
    .map((x) => ({ title: typeof x.title === "string" ? x.title.trim().slice(0, 120) : "", month: typeof x.month === "string" ? x.month : "" }))
    .filter((x) => x.title && MONTH.test(x.month))
    .sort((a, b) => a.month.localeCompare(b.month) || a.title.localeCompare(b.title))
    .slice(0, MAX_UPCOMING);
}

export interface PublicPageRow {
  buyer_key: string;
  province_code: string;
  buyer_name: string;
  organization_name: string | null;
  verified_at: string;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  bids_url: string | null;
  platform_url: string | null;
  vendor_registration_url: string | null;
  intro: string | null;
  upcoming: unknown;
  updated_at: string;
}

export function fromPublicRow(r: PublicPageRow): ManagedPage | null {
  if (!r?.buyer_key || !BUYER_KEY.test(r.buyer_key)) return null;
  return {
    buyerKey: r.buyer_key,
    provinceCode: r.province_code,
    buyerName: r.buyer_name,
    organizationName: r.organization_name || r.buyer_name,
    verifiedAt: r.verified_at,
    logoUrl: r.logo_url,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    bidsUrl: r.bids_url,
    platformUrl: r.platform_url,
    vendorRegistrationUrl: r.vendor_registration_url,
    intro: r.intro,
    upcoming: cleanUpcoming(r.upcoming),
    updatedAt: r.updated_at,
  };
}

/* ------------------------------------------------------------------ editing */

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === "" || /^https?:\/\/[^\s]+\.[^\s]+/i.test(u), { message: "url" })
  .transform((u) => u || null);

/** What the edit form posts (/buyer-dashboard/edit). Messages are keys into towns.edit.errors. */
export const managedPageSchema = z.object({
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), { message: "email" })
    .transform((v) => v.toLowerCase() || null),
  contactPhone: z
    .string()
    .trim()
    .max(40, { message: "phone" })
    .refine((v) => v === "" || /^[0-9+().\-\s x]{7,40}$/i.test(v), { message: "phone" })
    .transform((v) => v || null),
  showContact: z.boolean(),
  bidsUrl: optionalUrl,
  platformUrl: optionalUrl,
  vendorRegistrationUrl: optionalUrl,
  intro: z
    .string()
    .trim()
    .max(MAX_INTRO, { message: "intro" })
    .transform((v) => v || null),
  upcoming: z
    .array(z.object({ title: z.string().trim().max(120, { message: "upcoming" }), month: z.string().trim() }))
    .max(MAX_UPCOMING * 2)
    .transform((rows) => rows.filter((r) => r.title || r.month))
    .refine((rows) => rows.every((r) => r.title && MONTH.test(r.month)), { message: "upcoming" })
    .transform((rows) => cleanUpcoming(rows)),
});
export type ManagedPageInput = z.infer<typeof managedPageSchema>;

/** The form's fields → the schema's input (checkbox, repeated upcoming rows). */
export function readManagedForm(fd: FormData): unknown {
  const titles = fd.getAll("upcomingTitle").map(String);
  const months = fd.getAll("upcomingMonth").map(String);
  return {
    contactEmail: String(fd.get("contactEmail") ?? ""),
    contactPhone: String(fd.get("contactPhone") ?? ""),
    showContact: fd.get("showContact") === "on",
    bidsUrl: String(fd.get("bidsUrl") ?? ""),
    platformUrl: String(fd.get("platformUrl") ?? ""),
    vendorRegistrationUrl: String(fd.get("vendorRegistrationUrl") ?? ""),
    intro: String(fd.get("intro") ?? ""),
    upcoming: titles.map((title, i) => ({ title, month: months[i] ?? "" })),
  };
}

/** A logo must be in our own public `logos` bucket (the uploader puts it there); anything else is dropped. */
export function ownLogoUrl(raw: string | null | undefined, supabaseUrl: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || !supabaseUrl) return null;
  try {
    const u = new URL(v);
    const host = new URL(supabaseUrl).host;
    return u.protocol === "https:" && u.host === host && u.pathname.includes("/storage/v1/object/public/logos/") ? v : null;
  } catch {
    return null;
  }
}

/** The buyer_pages columns an edit writes. */
export function pageUpdateRow(input: ManagedPageInput, logoUrl: string | null, userId: string, now: string) {
  return {
    logo_url: logoUrl,
    contact_email: input.contactEmail,
    contact_phone: input.contactPhone,
    show_contact: input.showContact,
    bids_url: input.bidsUrl,
    platform_url: input.platformUrl,
    vendor_registration_url: input.vendorRegistrationUrl,
    intro: input.intro,
    upcoming: input.upcoming,
    updated_by: userId,
    updated_at: now,
  };
}

/** Which fields an edit changed (for the audit log: names only, never values). */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after)
    .filter((k) => k !== "updated_at" && k !== "updated_by")
    .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
}

/* ------------------------------------------------------------------ signals */

/**
 * A buyer's permission, only when the registry row is for this province:
 * slugs repeat across provinces (the Town of Cochrane said no in Alberta;
 * the Town of Cochrane in Ontario never did).
 */
export function permissionFor(registry: PermissionRegistry, slug: string, provinceCode: string): BuyerPermission | null {
  const p = registry.get(slug);
  if (!p || p.scope !== "buyer" || !(PERMISSION_STATUSES as readonly string[]).includes(p.status)) return null;
  return p.provinceCode && p.provinceCode !== provinceCode ? null : p;
}
