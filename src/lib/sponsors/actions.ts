"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { logAudit } from "@/lib/audit";
import { asPaid, loadAdminSponsors } from "./admin";
import {
  COPY_PROBLEM_TEXT,
  HOLDING_STATUSES,
  checkSponsorCopy,
  findConflicts,
  normalizeRegion,
  regionCountryOf,
  sponsorSlug,
  torontoDay,
  tradeSlug,
  type SponsorStatus,
} from "./model";
import { SPONSOR_TIERS, sponsorPrice, type SponsorTier } from "./pricing";

/**
 * /admin/sponsors writes. Every write goes through the service client AFTER
 * requireRole(admin); the shared sponsor snapshot is expired by the write
 * itself (lib/supabase/write-fetch). Going live (approved, or saving an
 * approved row) re-checks the copy rules and slot exclusivity.
 */

const ADMIN = "/admin/sponsors";

async function admin() {
  const session = await requireRole(["admin", "super_admin"]);
  if (!isServiceConfigured()) redirect(`${ADMIN}?error=${encodeURIComponent("Supabase service key isn't configured.")}`);
  return { session, supabase: createServiceClient() };
}

const back = (id: string | null, msg: { error?: string; saved?: boolean }) =>
  `${ADMIN}/${id ?? "new"}?${msg.error ? `error=${encodeURIComponent(msg.error)}` : "saved=1"}`;

const formSchema = z.object({
  id: z.string().uuid().or(z.literal("")),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(40),
  url: z.string().trim().max(500),
  logoUrl: z.string().trim().max(500),
  headline: z.string().trim().max(200),
  message: z.string().trim().max(400),
  cta: z.string().trim().max(80),
  headlineFr: z.string().trim().max(200),
  messageFr: z.string().trim().max(400),
  ctaFr: z.string().trim().max(80),
  tier: z.enum(SPONSOR_TIERS as unknown as [SponsorTier, ...SponsorTier[]]),
  country: z.enum(["CA", "US"]),
  trades: z.string().trim().max(600),
  regions: z.string().trim().max(1000),
  startDate: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  endDate: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  contactName: z.string().trim().max(120),
  contactEmail: z.string().trim().max(200),
  notes: z.string().trim().max(4000),
});

const orNull = (s: string) => (s ? s : null);

/** Create or update a sponsor. Approved rows must still pass the copy and slot checks. */
export async function saveSponsorAction(formData: FormData): Promise<void> {
  const { session, supabase } = await admin();
  const f = (k: string) => String(formData.get(k) ?? "");
  const parsed = formSchema.safeParse({
    id: f("id"), name: f("name"), slug: f("slug"), url: f("url"), logoUrl: f("logoUrl"),
    headline: f("headline"), message: f("message"), cta: f("cta"),
    headlineFr: f("headlineFr"), messageFr: f("messageFr"), ctaFr: f("ctaFr"),
    tier: f("tier"), country: f("country"), trades: f("trades"), regions: f("regions"),
    startDate: f("startDate"), endDate: f("endDate"),
    contactName: f("contactName"), contactEmail: f("contactEmail"), notes: f("notes"),
  });
  const id = f("id") || null;
  if (!parsed.success) redirect(back(id, { error: parsed.error.issues[0]?.message ?? "Check the fields." }));
  const v = parsed.data;

  const trades = [...new Set(v.trades.split(/[,\n]+/).map((t) => tradeSlug(t)).filter((t) => /^[a-z0-9-]{2,60}$/.test(t)))].slice(0, 10);
  if (!trades.length) redirect(back(id, { error: "Add at least one trade (trade slugs, comma separated)." }));
  const rawRegions = v.regions.split(/[,\n]+/).map((r) => r.trim()).filter(Boolean);
  const regions = [...new Set(rawRegions.map((r) => normalizeRegion(r)))];
  if (regions.some((r) => !r)) redirect(back(id, { error: "Unknown province/state in Regions. Use full names or codes (Ontario, ON, Texas, TX)." }));
  const cleanRegions = (regions as string[]).filter((r) => regionCountryOf(r) === v.country);
  if (cleanRegions.length !== regions.length) redirect(back(id, { error: "Regions must all be in the sponsor's country (Canada and the U.S. are never mixed)." }));
  if (v.tier === "national" && cleanRegions.length) redirect(back(id, { error: "National sponsors cover the whole country: leave Regions empty." }));
  if (v.tier !== "national" && !cleanRegions.length) redirect(back(id, { error: "Province and digest sponsors need at least one province/state." }));
  if (v.startDate && v.endDate && v.endDate < v.startDate) redirect(back(id, { error: "The end date is before the start date." }));

  const slug = sponsorSlug(v.slug || v.name);
  const price = sponsorPrice(v.tier, v.country);
  const row = {
    name: v.name,
    slug,
    url: v.url,
    logo_url: orNull(v.logoUrl),
    headline: v.headline,
    message: v.message,
    cta: v.cta,
    headline_fr: orNull(v.headlineFr),
    message_fr: orNull(v.messageFr),
    cta_fr: orNull(v.ctaFr),
    tier: v.tier,
    country: v.country,
    trades,
    regions: cleanRegions,
    start_date: orNull(v.startDate),
    end_date: orNull(v.endDate),
    contact_name: orNull(v.contactName),
    contact_email: orNull(v.contactEmail),
    notes: orNull(v.notes),
    monthly_price: price.amount,
    currency: price.currency,
  };

  // Rows that hold or show a slot must stay valid.
  let status: SponsorStatus = "draft";
  if (id) {
    const { data } = await supabase.from("sponsors").select("status").eq("id", id).maybeSingle<{ status: SponsorStatus }>();
    if (!data) redirect(ADMIN);
    status = data.status;
  }
  if (status === "approved") {
    const problem = await goLiveProblem(supabase, { id: id ?? "", ...row, status });
    if (problem) redirect(back(id, { error: problem }));
  } else if (HOLDING_STATUSES.includes(status)) {
    const conflict = await conflictProblem(supabase, { id: id ?? "", ...row });
    if (conflict) redirect(back(id, { error: conflict }));
  }

  const res = id
    ? await supabase.from("sponsors").update(row).eq("id", id).select("id").maybeSingle<{ id: string }>()
    : await supabase.from("sponsors").insert({ ...row, status: "draft" }).select("id").maybeSingle<{ id: string }>();
  const savedId = res.data?.id ?? id;
  await logAudit({ actorUserId: session.userId, action: id ? "sponsor.edit" : "sponsor.create", entityType: "sponsor", entityId: savedId, metadata: res.error ? { error: res.error.message } : { slug } });
  revalidatePath(ADMIN);
  if (res.error) {
    const msg = res.error.code === "23505" ? `The link name "${slug}" is taken: pick another slug.` : `Not saved: ${res.error.message}`;
    redirect(back(id, { error: msg }));
  }
  redirect(back(savedId, { saved: true }));
}

type CheckRow = {
  id: string;
  name: string;
  url: string;
  headline: string;
  message: string;
  cta: string;
  headline_fr: string | null;
  message_fr: string | null;
  cta_fr: string | null;
  tier: SponsorTier;
  country: "CA" | "US";
  trades: string[];
  regions: string[];
  start_date: string | null;
  end_date: string | null;
};

async function conflictProblem(supabase: ReturnType<typeof createServiceClient>, r: CheckRow): Promise<string | null> {
  const { rows } = await loadAdminSponsors(supabase);
  const conflicts = findConflicts(
    { id: r.id, tier: r.tier, country: r.country, trades: r.trades, regions: r.regions, startDate: r.start_date, endDate: r.end_date },
    asPaid(rows),
  );
  if (!conflicts.length) return null;
  const c = conflicts[0];
  const where = c.slot.region === "*" ? "nationally" : `in ${c.slot.region}`;
  return `Slot taken: ${c.sponsor.name || c.sponsor.slug} already holds ${c.slot.trade} ${where} (${c.slot.channel}) for overlapping dates. One sponsor per slot.`;
}

async function goLiveProblem(supabase: ReturnType<typeof createServiceClient>, r: CheckRow & { status: SponsorStatus }): Promise<string | null> {
  const problems = checkSponsorCopy({
    name: r.name,
    url: r.url,
    headline: r.headline,
    message: r.message,
    cta: r.cta,
    headlineFr: r.headline_fr,
    messageFr: r.message_fr,
    ctaFr: r.cta_fr,
    regions: r.regions,
  });
  if (problems.length) return problems.map((p) => COPY_PROBLEM_TEXT[p]).join(" ");
  return conflictProblem(supabase, r);
}

const statusSchema = z.object({
  id: z.string().uuid(),
  to: z.enum(["approved", "paused", "ended", "rejected", "pending", "draft"]),
});

/** Approve (go live), pause, end, reject, or send back to pending/draft. */
export async function setSponsorStatusAction(formData: FormData): Promise<void> {
  const { session, supabase } = await admin();
  const parsed = statusSchema.safeParse({ id: String(formData.get("id") ?? ""), to: String(formData.get("to") ?? "") });
  if (!parsed.success) redirect(ADMIN);
  const { id, to } = parsed.data;
  const { data: r } = await supabase
    .from("sponsors")
    .select("id,name,url,headline,message,cta,headline_fr,message_fr,cta_fr,tier,country,trades,regions,start_date,end_date,status")
    .eq("id", id)
    .maybeSingle<CheckRow & { status: SponsorStatus }>();
  if (!r) redirect(ADMIN);

  const today = torontoDay();
  const patch: Record<string, unknown> = { status: to };
  if (to === "approved") {
    const startDate = r.start_date ?? today;
    const problem = await goLiveProblem(supabase, { ...r, start_date: startDate, status: to });
    if (problem) redirect(back(id, { error: problem }));
    patch.start_date = startDate;
    patch.reviewed_by = session.userId;
    patch.reviewed_at = new Date().toISOString();
  } else if (HOLDING_STATUSES.includes(to)) {
    const conflict = await conflictProblem(supabase, r);
    if (conflict) redirect(back(id, { error: conflict }));
  }
  if (to === "ended" && (!r.end_date || r.end_date > today)) patch.end_date = today < (r.start_date ?? today) ? r.start_date : today;
  if (to === "rejected") {
    patch.reviewed_by = session.userId;
    patch.reviewed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("sponsors").update(patch).eq("id", id);
  await logAudit({ actorUserId: session.userId, action: `sponsor.${to}`, entityType: "sponsor", entityId: id, metadata: error ? { error: error.message } : undefined });
  revalidatePath(ADMIN);
  redirect(back(id, error ? { error: `Not saved: ${error.message}` } : { saved: true }));
}
