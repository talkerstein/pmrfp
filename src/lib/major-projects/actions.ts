"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { logAudit } from "@/lib/audit";
import { MAJOR_PROJECT_CATEGORIES, MAJOR_PROJECT_STATUSES, parseMoney, provinceName, safeUrl } from "./model";
import { MANUAL_SOURCE, defaultCategoryForFile, parseResearchCsv } from "./research-csv";
import { applySync, loadExisting, loadRegionLookup, planSummary, planSync } from "./sync";

/**
 * Admin review queue for major projects (/admin/major-projects). Every write
 * goes through the service client AFTER requireRole(admin) so the shared
 * snapshot is revalidated (lib/supabase/write-fetch). Manual research rows
 * only become public when an admin approves them here.
 */

const ADMIN = "/admin/major-projects";
const MAX_CSV_BYTES = 2_000_000;

async function admin() {
  const session = await requireRole(["admin", "super_admin"]);
  if (!isServiceConfigured()) redirect(`${ADMIN}?error=service`);
  return { session, supabase: createServiceClient() };
}

const idSchema = z.string().uuid();

export async function reviewMajorProjectAction(formData: FormData): Promise<void> {
  const { session, supabase } = await admin();
  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  const decision = String(formData.get("decision") ?? "");
  if (!id.success || !["approve", "reject", "requeue"].includes(decision)) redirect(ADMIN);
  // "requeue" un-hides: a research row goes back to the queue (still
  // private), an open-data row is simply public again.
  let requeueTo = { approved: false, review_status: "pending" };
  if (decision === "requeue") {
    const { data } = await supabase.from("major_projects").select("source").eq("id", id.data).maybeSingle<{ source: string }>();
    if (data && data.source !== MANUAL_SOURCE) requeueTo = { approved: true, review_status: "approved" };
  }
  const patch =
    decision === "approve"
      ? { approved: true, review_status: "approved" }
      : decision === "reject"
        ? { approved: false, review_status: "rejected" }
        : requeueTo;
  const { error } = await supabase
    .from("major_projects")
    .update({ ...patch, reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
    .eq("id", id.data);
  await logAudit({ actorUserId: session.userId, action: `major_project.${decision}`, entityType: "major_project", entityId: id.data, metadata: error ? { error: error.message } : undefined });
  revalidatePath(ADMIN);
  redirect(`${ADMIN}${error ? "?error=save" : ""}`);
}

const editSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(300),
  description: z.string().trim().max(2000),
  category: z.enum(MAJOR_PROJECT_CATEGORIES),
  status: z.enum(MAJOR_PROJECT_STATUSES),
  statusDate: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  owner: z.string().trim().max(300),
  city: z.string().trim().max(120),
  province: z.string().trim().max(60),
  value: z.string().trim().max(60),
  size: z.string().trim().max(200),
  timeline: z.string().trim().max(500),
  gc: z.string().trim().max(300),
  bidListUrl: z.string().trim().max(500),
  bidRoute: z.string().trim().max(2000),
  trades: z.string().trim().max(600),
  caveats: z.string().trim().max(2000),
});

const orNull = (s: string) => (s ? s : null);

export async function updateMajorProjectAction(formData: FormData): Promise<void> {
  const { session, supabase } = await admin();
  const f = (k: string) => String(formData.get(k) ?? "");
  const parsed = editSchema.safeParse({
    id: f("id"), name: f("name"), description: f("description"), category: f("category"), status: f("status"),
    statusDate: f("statusDate"), owner: f("owner"), city: f("city"), province: f("province"), value: f("value"),
    size: f("size"), timeline: f("timeline"), gc: f("gc"), bidListUrl: f("bidListUrl"), bidRoute: f("bidRoute"),
    trades: f("trades"), caveats: f("caveats"),
  });
  if (!parsed.success) redirect(`${ADMIN}/${encodeURIComponent(f("id"))}?error=invalid`);
  const v = parsed.data;
  const province = provinceName(v.province);
  if (v.province && !province) redirect(`${ADMIN}/${v.id}?error=province`);
  const { data: old } = await supabase.from("major_projects").select("status").eq("id", v.id).maybeSingle<{ status: string }>();
  if (!old) redirect(ADMIN);
  const statusChanged = old.status !== v.status;
  const { error } = await supabase
    .from("major_projects")
    .update({
      name: v.name,
      description: orNull(v.description),
      category: v.category,
      status: v.status,
      status_date: orNull(v.statusDate),
      owner: orNull(v.owner),
      city: orNull(v.city),
      province,
      est_value_cad: parseMoney(v.value),
      size: orNull(v.size),
      timeline: orNull(v.timeline),
      general_contractor: orNull(v.gc),
      bid_list_url: safeUrl(v.bidListUrl),
      bid_route: orNull(v.bidRoute),
      trades_needed: v.trades.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9-]{2,60}$/.test(s)).slice(0, 12),
      caveats: orNull(v.caveats),
      ...(statusChanged ? { previous_status: old.status, status_changed_at: new Date().toISOString() } : {}),
    })
    .eq("id", v.id);
  await logAudit({ actorUserId: session.userId, action: "major_project.edit", entityType: "major_project", entityId: v.id, metadata: error ? { error: error.message } : { statusChanged } });
  revalidatePath(ADMIN);
  redirect(`${ADMIN}/${v.id}?${error ? "error=save" : "saved=1"}`);
}

/**
 * Upload a research CSV (e.g. briefs/research/2026-10-11-canada-data-centres.csv).
 * Every row is queued as pending; nothing goes public until approved.
 */
export async function uploadResearchCsvAction(formData: FormData): Promise<void> {
  const { session, supabase } = await admin();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) redirect(`${ADMIN}?error=nofile`);
  if (file.size > MAX_CSV_BYTES) redirect(`${ADMIN}?error=toobig`);
  const text = await file.text();
  const declared = String(formData.get("category") ?? "");
  const defaultCategory = (MAJOR_PROJECT_CATEGORIES as readonly string[]).includes(declared)
    ? (declared as (typeof MAJOR_PROJECT_CATEGORIES)[number])
    : defaultCategoryForFile(file.name);
  const { rows, skipped } = parseResearchCsv(text, { defaultCategory });
  if (!rows.length) redirect(`${ADMIN}?error=empty`);
  const today = new Date().toISOString().slice(0, 10);
  const [existing, regions] = await Promise.all([loadExisting(supabase, MANUAL_SOURCE), loadRegionLookup(supabase)]);
  const plan = planSync({
    source: MANUAL_SOURCE,
    incoming: rows,
    existing,
    today,
    now: new Date().toISOString(),
    regionIdBySlug: regions.bySlug,
    provinceRegionId: regions.provinceRegionId,
  });
  let failed = false;
  try {
    await applySync(supabase, plan, today);
  } catch (e) {
    failed = true;
    console.error("[major-projects] research upload failed", e);
  }
  const summary = planSummary(plan);
  await logAudit({
    actorUserId: session.userId,
    action: "major_project.upload",
    entityType: "major_project",
    metadata: { file: file.name.slice(0, 120), ...summary, skipped: skipped.length, failed },
  });
  revalidatePath(ADMIN);
  const q = new URLSearchParams({
    uploaded: String(summary.inserts),
    updated: String(summary.updates),
    unchanged: String(summary.touched),
    skipped: String(skipped.length),
    ...(failed ? { error: "save" } : {}),
  });
  redirect(`${ADMIN}?${q}`);
}
