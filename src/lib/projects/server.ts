import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession, type SessionContext } from "@/lib/access/access";
import { getSessionFromRequest } from "@/lib/access/request-session";
import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import type { Organization } from "@/types/db";
import { sanitizePhotos } from "./photos";
import { resolvePhotoUrls } from "./photo-storage";
import { isSchemaMissing } from "./compat";
import { normalizeVisibility, type Visibility } from "./visibility";
import { caseStudyProgress, sanitizeResults, type Progress } from "./case-study";

/**
 * Server-side plumbing shared by the Projects route handlers and actions.
 */

export type ProjectSession = SessionContext & { organization: Organization };

/**
 * The signed-in member of a listed company (trade or supplier), or null.
 * session.organization comes from organization_members, so having one IS
 * proof of membership.
 */
export async function getProjectSession(): Promise<ProjectSession | null> {
  return toProjectSession(await getSession());
}

/**
 * Same checks for Route Handlers the mobile app also calls: cookie session
 * or `Authorization: Bearer <access token>`. `db` is an RLS-bound client
 * acting as the caller; pass it to countActiveProjects / listMyProjects,
 * because the cookie client knows nothing about a bearer caller.
 */
export async function getProjectSessionFromRequest(
  request: Request,
): Promise<{ session: ProjectSession; db: SupabaseClient } | null> {
  const auth = await getSessionFromRequest(request);
  const session = toProjectSession(auth?.session ?? null);
  return auth && session ? { session, db: auth.db } : null;
}

function toProjectSession(session: SessionContext | null): ProjectSession | null {
  if (!session?.organization) return null;
  if (session.profile.status === "suspended") return null;
  const t = session.organization.organization_type;
  if (t !== "trade_company" && t !== "supplier") return null;
  if (session.organization.status === "suspended") return null;
  return session as ProjectSession;
}

/**
 * Has migration 20260924000001 been applied? Production deploys before the
 * SQL runs; until then the capture flow and review requests stay hidden
 * rather than failing halfway through an upload.
 */
export async function projectsReady(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await createReadClient().from("case_studies").select("photos").limit(1);
    return !error;
  } catch {
    return false;
  }
}

export interface MyProject {
  id: string;
  slug: string;
  title: string;
  status: string;
  city: string | null;
  province: string | null;
  createdAt: string;
  heroUrl: string | null;
  visibility: Visibility;
  /** Case-study builder progress (required steps done / total). */
  progress: Progress;
}

interface MyProjectRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  city: string | null;
  province: string | null;
  created_at: string;
  category_id: string | null;
  region_id: string | null;
  challenge: string;
  approach: string;
  outcome: string;
  hero_url?: string | null;
  photos?: unknown;
  visibility?: string | null;
  client_type?: string | null;
  scope?: string | null;
  results?: unknown;
  completed_on?: string | null;
}

/** Every case study this company submitted (members can read all statuses). */
export async function listMyProjects(organizationId: string, db?: SupabaseClient): Promise<MyProject[]> {
  const supabase = db ?? (await createClient());
  const base = "id,slug,title,status,city,province,created_at,category_id,region_id,challenge,approach,outcome";
  const run = (cols: string) =>
    supabase
      .from("case_studies")
      .select(cols)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100);
  let { data, error } = await run(`${base},hero_url,photos,visibility,client_type,scope,results,completed_on`);
  if (isSchemaMissing(error)) ({ data, error } = await run(`${base},hero_url,photos`));
  if (isSchemaMissing(error)) ({ data, error } = await run(base));
  if (error || !data) return [];
  const rows = data as unknown as MyProjectRow[];
  const reviewCounts = await reviewCountsByProject(rows.map((r) => r.id));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // The company's own list: heroes of unlisted/private projects are signed for this member.
  const heroes = await resolvePhotoUrls(
    rows.map((r) => ({
      project: { id: r.id, organizationId, visibility: r.visibility, status: r.status },
      url: r.hero_url,
    })),
    { kind: "member", organizationId },
  );
  return rows.map((r, i) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status,
    city: r.city,
    province: r.province,
    createdAt: r.created_at,
    heroUrl: heroes[i],
    visibility: normalizeVisibility(r.visibility),
    progress: caseStudyProgress({
      clientType: r.client_type ?? null,
      categoryId: r.category_id,
      city: r.city,
      regionId: r.region_id,
      completedOn: r.completed_on ?? null,
      scope: r.scope ?? null,
      challenge: r.challenge,
      approach: r.approach,
      outcome: r.outcome,
      results: sanitizeResults(r.results),
      photos: sanitizePhotos(r.photos, supabaseUrl, organizationId, { includePrivate: true }),
      reviewCount: reviewCounts.get(r.id) ?? 0,
    }),
  }));
}

/** Published reviews per project (public view; private projects' reviews aren't in it). */
async function reviewCountsByProject(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0 || !isSupabaseConfigured()) return out;
  try {
    const { data } = await createReadClient().from("vendor_reviews_public").select("case_study_id").in("case_study_id", ids);
    for (const r of (data ?? []) as { case_study_id: string | null }[]) {
      if (r.case_study_id) out.set(r.case_study_id, (out.get(r.case_study_id) ?? 0) + 1);
    }
  } catch {
    // no counts
  }
  return out;
}

export interface MyInvite {
  id: string;
  caseStudyId: string;
  clientName: string;
  clientEmail: string;
  createdAt: string;
  usedAt: string | null;
}

/** Review requests this company has sent. Empty before the migration. */
export async function listMyInvites(organizationId: string): Promise<MyInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("review_invites")
    .select("id,case_study_id,client_name,client_email,created_at,used_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error || !data) return [];
  return (
    data as {
      id: string;
      case_study_id: string;
      client_name: string;
      client_email: string;
      created_at: string;
      used_at: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    caseStudyId: r.case_study_id,
    clientName: r.client_name,
    clientEmail: r.client_email,
    createdAt: r.created_at,
    usedAt: r.used_at,
  }));
}

export interface ReferenceEntry {
  id: string;
  slug: string;
  title: string;
  place: string;
  publishedAt: string | null;
  summary: string;
  heroUrl: string | null;
  visibility: Visibility;
  clientType: string | null;
  tradeName: string | null;
  scope: string | null;
  results: { value: string; label: string }[];
  completedOn: string | null;
  valueBand: string | null;
  /** Live share link token for a private project, if the company made one. */
  shareToken: string | null;
  /** Only reviewers who ticked "OK to list me as a reference". */
  references: { name: string; company: string | null; email: string | null; rating: number; quote: string }[];
}

/** Most projects one capability sheet prints (two pages, give or take). */
export const SHEET_MAX = 8;

/**
 * Data for the printable capability sheet: the company's published
 * projects (any visibility, it's their own document), and for each the
 * reviewers who agreed to be a reference. Reviewer emails and private rows
 * live behind RLS, so this reads with the service role after the caller has
 * checked membership. `select`: project ids to include, in any order;
 * empty = the newest SHEET_MAX.
 */
export async function listReferenceSheet(organizationId: string, select: string[] = []): Promise<ReferenceEntry[]> {
  if (!isServiceConfigured()) return [];
  const db = createServiceClient();
  const base = "id,slug,title,city,province,published_at,challenge,budget_band,trade_categories(name)";
  const run = (cols: string) =>
    db
      .from("case_studies")
      .select(cols)
      .eq("organization_id", organizationId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50);
  let { data, error } = await run(`${base},summary,hero_url,visibility,client_type,scope,results,completed_on`);
  if (isSchemaMissing(error)) ({ data, error } = await run(`${base},summary,hero_url`));
  if (isSchemaMissing(error)) ({ data, error } = await run(base));
  if (error || !data) return [];
  const all = data as unknown as {
    id: string;
    slug: string;
    title: string;
    city: string | null;
    province: string | null;
    published_at: string | null;
    challenge: string;
    budget_band: string | null;
    trade_categories: { name: string } | null;
    summary?: string | null;
    hero_url?: string | null;
    visibility?: string | null;
    client_type?: string | null;
    scope?: string | null;
    results?: unknown;
    completed_on?: string | null;
  }[];
  const wanted = new Set(select);
  const projects = (wanted.size ? all.filter((p) => wanted.has(p.id)) : all).slice(0, SHEET_MAX);

  const tokens = new Map<string, string>();
  const privateIds = projects.filter((p) => normalizeVisibility(p.visibility) === "private").map((p) => p.id);
  if (privateIds.length) {
    const { data: links } = await db
      .from("case_study_share_links")
      .select("case_study_id,token")
      .in("case_study_id", privateIds)
      .eq("organization_id", organizationId)
      .is("revoked_at", null)
      .order("created_at", { ascending: true });
    for (const l of (links ?? []) as { case_study_id: string; token: string }[]) {
      if (!tokens.has(l.case_study_id)) tokens.set(l.case_study_id, l.token);
    }
  }

  const { data: refs } = await db
    .from("vendor_reviews")
    .select("case_study_id,reviewer_name,reviewer_company,reviewer_email,rating,body")
    .eq("organization_id", organizationId)
    .eq("status", "published")
    .eq("reference_ok", true);
  const byProject = new Map<string, ReferenceEntry["references"]>();
  for (const r of (refs ?? []) as {
    case_study_id: string | null;
    reviewer_name: string;
    reviewer_company: string | null;
    reviewer_email: string | null;
    rating: number;
    body: string;
  }[]) {
    if (!r.case_study_id) continue;
    const list = byProject.get(r.case_study_id) ?? [];
    list.push({
      name: r.reviewer_name,
      company: r.reviewer_company,
      email: r.reviewer_email,
      rating: r.rating,
      quote: r.body.length > 240 ? `${r.body.slice(0, 237).trimEnd()}…` : r.body,
    });
    byProject.set(r.case_study_id, list);
  }

  // The company's own document: unlisted/private heroes are signed for its member.
  const heroes = await resolvePhotoUrls(
    projects.map((p) => ({
      project: { id: p.id, organizationId, visibility: p.visibility, status: "published" },
      url: p.hero_url,
    })),
    { kind: "member", organizationId },
  );
  return projects.map((p, i) => {
    const text = (p.summary?.trim() || p.challenge).trim();
    const scope = p.scope?.trim() || null;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      place: [p.city, p.province].filter(Boolean).join(", "),
      publishedAt: p.published_at,
      summary: text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text,
      heroUrl: heroes[i],
      visibility: normalizeVisibility(p.visibility),
      clientType: p.client_type ?? null,
      tradeName: p.trade_categories?.name ?? null,
      scope: scope && scope.length > 220 ? `${scope.slice(0, 217).trimEnd()}…` : scope,
      results: sanitizeResults(p.results),
      completedOn: p.completed_on ?? null,
      valueBand: p.budget_band?.trim() || null,
      shareToken: tokens.get(p.id) ?? null,
      references: byProject.get(p.id) ?? [],
    };
  });
}

/** Published projects to pick from on the capability sheet (id, title, visibility). */
export async function listSheetChoices(organizationId: string): Promise<{ id: string; title: string; visibility: Visibility }[]> {
  if (!isServiceConfigured()) return [];
  const db = createServiceClient();
  const run = (cols: string) =>
    db
      .from("case_studies")
      .select(cols)
      .eq("organization_id", organizationId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50);
  let { data, error } = await run("id,title,visibility");
  if (isSchemaMissing(error)) ({ data, error } = await run("id,title"));
  if (error || !data) return [];
  return (data as unknown as { id: string; title: string; visibility?: string | null }[]).map((r) => ({
    id: r.id,
    title: r.title,
    visibility: normalizeVisibility(r.visibility),
  }));
}

/**
 * Projects that count toward the free-plan limit: everything the company
 * has submitted except rejected and archived ones. Text case studies count
 * too, they're projects on the profile all the same.
 */
export async function countActiveProjects(organizationId: string, db?: SupabaseClient): Promise<number> {
  const supabase = db ?? (await createClient());
  const { count, error } = await supabase
    .from("case_studies")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .not("status", "in", "(rejected,archived)");
  return error ? 0 : (count ?? 0);
}
