import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import type { ProjectSession } from "./server";
import { willAutoPublish } from "./publish";
import { photoLimit } from "./limits";
import { canonicalizePhotos, pickHero, sanitizePhotos, type ProjectPhoto } from "./photos";
import { photosForViewer, syncProjectPhotos } from "./photo-storage";
import {
  caseStudyInputSchema,
  contentChanged,
  dateToMonth,
  futureMonthError,
  isEditableStatus,
  monthToDate,
  nextStatus,
  sanitizeResults,
  valueBandKey,
  type CaseStudyResult,
  type ValueBand,
} from "./case-study";
import {
  canCreateShareLink,
  canUseVisibility,
  MAX_SHARE_LINKS_PER_PROJECT,
  normalizeVisibility,
  VISIBILITIES,
  type Visibility,
} from "./visibility";
import { generateReviewToken } from "./tokens";
import { isSchemaMissing } from "./compat";
import { LOCALES } from "@/i18n/config";

/**
 * Editing an existing project: the case-study builder's save, the
 * visibility switch, and private share links. Shared by the web server
 * actions (actions.ts); callers prove who the user is first.
 *
 * Writes use the service role because RLS stops members from updating a
 * published row (moderation); every function here checks the row belongs to
 * the caller's company before touching it.
 *
 * Not a "use server" module on purpose (see publish.ts).
 */

const NOT_READY = "Case-study fields are switching on soon. Try again in a little while.";

/** Has migration 20261009000002 (portfolio) been applied? */
export async function portfolioReady(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await createReadClient().from("case_studies").select("visibility").limit(1);
    return !error;
  } catch {
    return false;
  }
}

// ── Loading one project for the builder ──────────────────────────────

export interface EditableProject {
  id: string;
  slug: string;
  status: string;
  title: string;
  summary: string;
  visibility: Visibility;
  clientType: string;
  scope: string;
  challenge: string;
  approach: string;
  outcome: string;
  results: CaseStudyResult[];
  categorySlug: string;
  regionSlug: string;
  propertyTypeName: string | null;
  city: string;
  startedOn: string;
  completedOn: string;
  valueBand: ValueBand | "";
  /** Free-text budget from the old typed form, kept until a range is picked. */
  legacyBudget: string | null;
  timeline: string | null;
  photos: ProjectPhoto[];
  heroUrl: string | null;
  aiAssisted: boolean;
}

interface ProjectRow {
  id: string;
  organization_id: string;
  slug: string;
  status: string;
  title: string;
  summary?: string | null;
  challenge: string;
  approach: string;
  outcome: string;
  city: string | null;
  property_type: string | null;
  budget_band: string | null;
  timeline: string | null;
  published_at: string | null;
  photos?: unknown;
  hero_url?: string | null;
  visibility?: string | null;
  client_type?: string | null;
  scope?: string | null;
  results?: unknown;
  started_on?: string | null;
  completed_on?: string | null;
  ai_assisted?: boolean | null;
  trade_categories: { slug: string } | null;
  regions: { slug: string } | null;
}

const BASE_COLS =
  "id,organization_id,slug,status,title,challenge,approach,outcome,city,property_type,budget_band,timeline,published_at," +
  "trade_categories(slug),regions(slug)";
const PROJECT_COLS = "summary,photos,hero_url";
const PORTFOLIO_COLS = "visibility,client_type,scope,results,started_on,completed_on,ai_assisted";

async function readProjectRow(
  db: SupabaseClient,
  id: string,
  orgId: string,
): Promise<{ row: ProjectRow | null; ready: boolean }> {
  const run = (cols: string) =>
    db.from("case_studies").select(cols).eq("id", id).eq("organization_id", orgId).maybeSingle();
  let ready = true;
  let { data, error } = await run(`${BASE_COLS},${PROJECT_COLS},${PORTFOLIO_COLS}`);
  if (isSchemaMissing(error)) {
    ready = false;
    ({ data, error } = await run(`${BASE_COLS},${PROJECT_COLS}`));
  }
  if (isSchemaMissing(error)) ({ data, error } = await run(BASE_COLS));
  return { row: error ? null : ((data as unknown as ProjectRow | null) ?? null), ready };
}

/** Row → builder data, with photos signed for this company's member. */
async function toEditable(r: ProjectRow, orgId: string): Promise<EditableProject> {
  const sb = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const band = valueBandKey(r.budget_band);
  const stored = sanitizePhotos(r.photos, sb, orgId, { includePrivate: true });
  const storedHero = r.hero_url && stored.some((p) => p.url === r.hero_url) ? r.hero_url : (pickHero(stored)?.url ?? null);
  const { photos, heroUrl } = await photosForViewer(
    { id: r.id, organizationId: r.organization_id, visibility: r.visibility, status: r.status },
    { kind: "member", organizationId: orgId },
    stored,
    storedHero,
  );
  return {
    id: r.id,
    slug: r.slug,
    status: r.status,
    title: r.title,
    summary: r.summary ?? "",
    visibility: normalizeVisibility(r.visibility),
    clientType: r.client_type ?? "",
    scope: r.scope ?? "",
    challenge: r.challenge,
    approach: r.approach,
    outcome: r.outcome,
    results: sanitizeResults(r.results),
    categorySlug: r.trade_categories?.slug ?? "",
    regionSlug: r.regions?.slug ?? "",
    propertyTypeName: r.property_type,
    city: r.city ?? "",
    startedOn: dateToMonth(r.started_on),
    completedOn: dateToMonth(r.completed_on),
    valueBand: band ?? "",
    legacyBudget: band ? null : r.budget_band?.trim() || null,
    timeline: r.timeline,
    photos,
    heroUrl,
    aiAssisted: Boolean(r.ai_assisted),
  };
}

/**
 * One of this company's projects, for the builder. Reads through the
 * caller's own RLS-bound client (members can read every status).
 */
export async function loadMyProject(
  session: ProjectSession,
  id: string,
): Promise<{ project: EditableProject | null; ready: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { project: null, ready: true };
  const { row, ready } = await readProjectRow(await createClient(), id, session.organization.id);
  return { project: row ? await toEditable(row, session.organization.id) : null, ready };
}

// ── Saving the builder ───────────────────────────────────────────────

export type SaveResult =
  | { ok: true; slug: string; status: "published" | "pending_review"; visibility: Visibility }
  | { ok: false; error: string };

export async function saveCaseStudy(session: ProjectSession, input: unknown): Promise<SaveResult> {
  if (!isServiceConfigured()) return { ok: false, error: "Saving isn't set up here yet." };
  const parsed = caseStudyInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  const future = futureMonthError(d);
  if (future) return { ok: false, error: future };

  const org = session.organization;
  const paid = session.hasTradeAccess;
  const db = createServiceClient();
  const { row: prev, ready } = await readProjectRow(db, d.id, org.id);
  if (!prev) return { ok: false, error: "That project isn't on your account." };
  if (!ready) return { ok: false, error: NOT_READY };
  if (!isEditableStatus(prev.status)) return { ok: false, error: "This project was removed. Add it again as a new project." };

  const prevVisibility = normalizeVisibility(prev.visibility);
  if (d.visibility !== prevVisibility && !canUseVisibility(paid, d.visibility)) {
    return { ok: false, error: "Private projects and private links are part of Trade Pro." };
  }

  const sb = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const prevPhotos = sanitizePhotos(prev.photos, sb, org.id, { includePrivate: true });
  // The builder sends back the (signed) URLs it was shown. Identity is the
  // path; the stored URL is the canonical one we already have for it.
  const photos = canonicalizePhotos(d.photos, sb, org.id, prevPhotos);
  if (!photos) {
    return { ok: false, error: "One of those photos isn't from this project. Remove it and try again." };
  }
  const max = photoLimit(paid);
  // A plan that shrank (Pro lapsed) keeps the photos it has; it just can't add more.
  if (d.photos.length > max && d.photos.length > prevPhotos.length) {
    return {
      ok: false,
      error: paid
        ? `Up to ${max} photos per project. Remove a few and try again.`
        : `The free plan allows ${max} photos per project. Remove some, or upgrade to Trade Pro for more.`,
    };
  }

  const [cat, region, propertyType] = await Promise.all([
    d.categorySlug
      ? db.from("trade_categories").select("id").eq("slug", d.categorySlug).maybeSingle()
      : Promise.resolve({ data: null }),
    d.regionSlug
      ? db.from("regions").select("id,province").eq("slug", d.regionSlug).maybeSingle()
      : Promise.resolve({ data: null }),
    d.propertyTypeSlug
      ? db.from("property_types").select("name").eq("slug", d.propertyTypeSlug).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const changed = contentChanged(
    {
      title: prev.title,
      summary: prev.summary ?? null,
      scope: prev.scope ?? null,
      challenge: prev.challenge,
      approach: prev.approach,
      outcome: prev.outcome,
      results: sanitizeResults(prev.results),
      // Compared by storage path: a photo moving bucket isn't a content change.
      photoUrls: prevPhotos.map((p) => p.path),
    },
    {
      title: d.title,
      summary: d.summary,
      scope: d.scope,
      challenge: d.challenge,
      approach: d.approach,
      outcome: d.outcome,
      results: d.results,
      photoUrls: photos.map((p) => p.path),
    },
  );
  const status = nextStatus({ prevStatus: prev.status, autoPublish: willAutoPublish(session), changed });
  const heroIndex = d.photos.findIndex((p) => p.url === d.heroUrl);
  const hero = (heroIndex >= 0 ? photos[heroIndex] : null) ?? pickHero(photos);
  const prevBand = valueBandKey(prev.budget_band);

  const update = {
    title: d.title,
    summary: d.summary || null,
    client_type: d.clientType || null,
    scope: d.scope || null,
    challenge: d.challenge,
    approach: d.approach,
    outcome: d.outcome,
    results: d.results,
    category_id: (cat.data as { id: string } | null)?.id ?? null,
    region_id: (region.data as { id: string } | null)?.id ?? null,
    province: (region.data as { province: string | null } | null)?.province ?? null,
    // Unknown slug (or none picked) keeps what the project had.
    property_type: (propertyType.data as { name: string } | null)?.name ?? (d.propertyTypeSlug ? prev.property_type : null),
    city: d.city || null,
    started_on: monthToDate(d.startedOn),
    completed_on: monthToDate(d.completedOn),
    // An old free-text budget stays until the trade picks a range.
    budget_band: d.valueBand || (prevBand ? null : prev.budget_band),
    photos,
    hero_url: hero?.url ?? null,
    visibility: d.visibility,
    ai_assisted: Boolean(prev.ai_assisted) || d.aiUsed,
    status,
    published_at: status === "published" ? (prev.published_at ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from("case_studies").update(update).eq("id", prev.id).eq("organization_id", org.id);
  if (error) {
    console.error("[projects/save]", error.message);
    return { ok: false, error: isSchemaMissing(error) ? NOT_READY : "Couldn't save. Try again in a minute." };
  }
  const sync = await syncProjectPhotos(prev.id, { db });
  revalidateProject(prev.slug, org.slug);
  if (!sync.ok) return { ok: false, error: PHOTOS_PENDING };
  return { ok: true, slug: prev.slug, status, visibility: d.visibility };
}

/** Saved, but a photo is still in the old bucket. Saving again retries the move. */
const PHOTOS_PENDING = "Saved, but some photos are still moving. Try again in a minute to finish.";

/**
 * Purge every cached copy a visibility or content change affects. Pages
 * live under app/[lang], so the internal /en, /fr and /es paths are purged
 * as well as the public one: a project made private must drop off cached
 * pages in every language, not only English.
 */
function revalidateProject(slug: string, orgSlug: string) {
  revalidatePath("/dashboard/projects");
  for (const path of ["/projects", `/case-studies/${slug}`, `/directory/${orgSlug}`]) {
    revalidatePath(path);
    for (const l of LOCALES) revalidatePath(`/${l}${path}`);
  }
}

// ── Visibility switch (dashboard list) ───────────────────────────────

export async function setProjectVisibility(
  session: ProjectSession,
  input: { id: unknown; visibility: unknown },
): Promise<{ ok: true; visibility: Visibility } | { ok: false; error: string }> {
  if (!isServiceConfigured()) return { ok: false, error: "Saving isn't set up here yet." };
  const id = typeof input.id === "string" ? input.id : "";
  const v = input.visibility;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(VISIBILITIES as readonly unknown[]).includes(v)) {
    return { ok: false, error: "Please check the form." };
  }
  const visibility = v as Visibility;
  if (!canUseVisibility(session.hasTradeAccess, visibility)) {
    return { ok: false, error: "Private projects and private links are part of Trade Pro." };
  }
  const db = createServiceClient();
  const org = session.organization;
  const { data, error } = await db
    .from("case_studies")
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.id)
    .neq("status", "archived")
    .select("id,slug")
    .maybeSingle();
  if (error) {
    console.error("[projects/visibility]", error.message);
    return { ok: false, error: isSchemaMissing(error) ? NOT_READY : "Couldn't save. Try again in a minute." };
  }
  if (!data) return { ok: false, error: "That project isn't on your account." };
  const row = data as { id: string; slug: string };
  // Public → unlisted/private moves the photos into the private bucket (the
  // old public URLs stop working); back to public moves them out again.
  const sync = await syncProjectPhotos(row.id, { db });
  revalidateProject(row.slug, org.slug);
  if (!sync.ok) return { ok: false, error: PHOTOS_PENDING };
  return { ok: true, visibility };
}

// ── Private share links ──────────────────────────────────────────────

export interface ShareLink {
  id: string;
  caseStudyId: string;
  token: string;
  label: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
}

/** This company's share links (members only, by RLS). Empty before the migration. */
export async function listShareLinks(organizationId: string, db?: SupabaseClient): Promise<ShareLink[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = db ?? (await createClient());
    const { data, error } = await supabase
      .from("case_study_share_links")
      .select("id,case_study_id,token,label,created_at,revoked_at,last_viewed_at,view_count")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data) return [];
    return (
      data as {
        id: string;
        case_study_id: string;
        token: string;
        label: string | null;
        created_at: string;
        revoked_at: string | null;
        last_viewed_at: string | null;
        view_count: number;
      }[]
    ).map((r) => ({
      id: r.id,
      caseStudyId: r.case_study_id,
      token: r.token,
      label: r.label,
      createdAt: r.created_at,
      revokedAt: r.revoked_at,
      lastViewedAt: r.last_viewed_at,
      viewCount: r.view_count,
    }));
  } catch {
    return [];
  }
}

export type ShareLinkResult = { ok: true; token: string } | { ok: false; error: string; code?: "plan" };

export async function createShareLink(
  session: ProjectSession,
  input: { caseStudyId: unknown; label?: unknown },
): Promise<ShareLinkResult> {
  if (!session.hasTradeAccess) return { ok: false, error: "Private links are part of Trade Pro.", code: "plan" };
  if (!isServiceConfigured()) return { ok: false, error: "Private links aren't set up here yet." };
  const id = typeof input.caseStudyId === "string" ? input.caseStudyId : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Please check the form." };
  const label = typeof input.label === "string" ? input.label.trim().slice(0, 80) : "";
  if (await checkRateLimitByIp(`user:${session.userId}`, "default")) {
    return { ok: false, error: "That's a lot of links at once. Wait a minute and try again." };
  }

  const db = createServiceClient();
  const org = session.organization;
  const { data: cs } = await db
    .from("case_studies")
    .select("id,slug,status")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  const project = cs as { id: string; slug: string; status: string } | null;
  if (!project) return { ok: false, error: "That project isn't on your account." };
  if (!canCreateShareLink(true, project.status)) {
    return { ok: false, error: "You can share a project once it's published." };
  }

  const { count, error: countErr } = await db
    .from("case_study_share_links")
    .select("id", { count: "exact", head: true })
    .eq("case_study_id", project.id)
    .is("revoked_at", null);
  if (countErr) {
    console.error("[projects/share]", countErr.message);
    return { ok: false, error: isSchemaMissing(countErr) ? "Private links are switching on soon." : "Couldn't create the link." };
  }
  if ((count ?? 0) >= MAX_SHARE_LINKS_PER_PROJECT) {
    return { ok: false, error: `This project has ${MAX_SHARE_LINKS_PER_PROJECT} live links. Turn one off first.` };
  }

  const token = generateReviewToken();
  const { error } = await db.from("case_study_share_links").insert({
    case_study_id: project.id,
    organization_id: org.id,
    token,
    label: label || null,
    created_by_user_id: session.userId,
  });
  if (error) {
    console.error("[projects/share]", error.message);
    return { ok: false, error: "Couldn't create the link. Try again in a minute." };
  }
  revalidatePath("/dashboard/projects");
  return { ok: true, token };
}

export async function revokeShareLink(
  session: ProjectSession,
  input: { id: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isServiceConfigured()) return { ok: false, error: "Private links aren't set up here yet." };
  const id = typeof input.id === "string" ? input.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Please check the form." };
  const { data, error } = await createServiceClient()
    .from("case_study_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "That link is already off, or isn't yours." };
  revalidatePath("/dashboard/projects");
  return { ok: true };
}

/**
 * A live share link for a project, creating one when there isn't any
 * (attaching a private project to an RFP interest). Service role; the
 * caller has checked the project is the company's and published.
 */
export async function ensureShareLink(
  db: SupabaseClient,
  p: { caseStudyId: string; organizationId: string; userId: string; label: string },
): Promise<string | null> {
  const { data: existing } = await db
    .from("case_study_share_links")
    .select("token")
    .eq("case_study_id", p.caseStudyId)
    .eq("organization_id", p.organizationId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as { token: string }).token;
  const token = generateReviewToken();
  const { error } = await db.from("case_study_share_links").insert({
    case_study_id: p.caseStudyId,
    organization_id: p.organizationId,
    token,
    label: p.label.slice(0, 80),
    created_by_user_id: p.userId,
  });
  return error ? null : token;
}
