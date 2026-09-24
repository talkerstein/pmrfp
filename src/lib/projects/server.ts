import { getSession, type SessionContext } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Organization } from "@/types/db";
import { isOwnPhotoUrl } from "./photos";

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
  const session = await getSession();
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
}

interface MyProjectRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  city: string | null;
  province: string | null;
  created_at: string;
  hero_url?: string | null;
}

/** Every case study this company submitted (members can read all statuses). */
export async function listMyProjects(organizationId: string): Promise<MyProject[]> {
  const supabase = await createClient();
  const base = "id,slug,title,status,city,province,created_at";
  const run = (cols: string) =>
    supabase
      .from("case_studies")
      .select(cols)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100);
  let { data, error } = await run(`${base},hero_url`);
  if (error) ({ data, error } = await run(base));
  if (error || !data) return [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return (data as unknown as MyProjectRow[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status,
    city: r.city,
    province: r.province,
    createdAt: r.created_at,
    heroUrl: r.hero_url && isOwnPhotoUrl(r.hero_url, supabaseUrl) ? r.hero_url : null,
  }));
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

/**
 * Projects that count toward the free-plan limit: everything the company
 * has submitted except rejected and archived ones. Text case studies count
 * too, they're projects on the profile all the same.
 */
export async function countActiveProjects(organizationId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("case_studies")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .not("status", "in", "(rejected,archived)");
  return error ? 0 : (count ?? 0);
}
