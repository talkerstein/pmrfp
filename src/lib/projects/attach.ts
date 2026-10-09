import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { isOwnPhotoUrl } from "./photos";
import { normalizeVisibility } from "./visibility";
import { isSchemaMissing } from "./compat";
import { ensureShareLink } from "./manage";

/**
 * Projects attached to an expression of interest (RFP or GC package).
 *
 * On submit: keep only ids that are this company's published projects, and
 * make sure each private one has a share link (attaching it IS the trade
 * choosing to show it to this buyer).
 *
 * On the PM's page: re-check every id against the interested company
 * (a member could write any id straight into rfp_interests through the
 * API), and link public/unlisted projects by slug, private ones by their
 * share link.
 */

export async function validAttachments(p: {
  organizationId: string;
  userId: string;
  ids: string[];
  label: string;
}): Promise<string[]> {
  if (!isServiceConfigured() || p.ids.length === 0) return [];
  const ids = [...new Set(p.ids)].slice(0, 3);
  const db = createServiceClient();
  const run = (cols: string) =>
    db.from("case_studies").select(cols).in("id", ids).eq("organization_id", p.organizationId).eq("status", "published");
  let { data, error } = await run("id,visibility");
  if (isSchemaMissing(error)) ({ data, error } = await run("id"));
  if (error || !data) return [];
  const rows = data as unknown as { id: string; visibility?: string | null }[];
  const ok: string[] = [];
  for (const r of rows) {
    if (normalizeVisibility(r.visibility) === "private") {
      const token = await ensureShareLink(db, {
        caseStudyId: r.id,
        organizationId: p.organizationId,
        userId: p.userId,
        label: p.label,
      });
      if (!token) continue;
    }
    ok.push(r.id);
  }
  // Keep the trade's order.
  return ids.filter((id) => ok.includes(id));
}

export interface AttachedProject {
  id: string;
  title: string;
  /** Site path: /case-studies/<slug> or /shared/<token>. */
  href: string;
  heroUrl: string | null;
  isCaseStudy: boolean;
}

export async function attachedProjectsFor(
  interests: { id: string; organizationId: string; caseStudyIds: string[] }[],
): Promise<Map<string, AttachedProject[]>> {
  const out = new Map<string, AttachedProject[]>();
  const all = [...new Set(interests.flatMap((i) => i.caseStudyIds))];
  if (!isServiceConfigured() || all.length === 0) return out;
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("case_studies")
      .select("id,organization_id,slug,title,hero_url,visibility,client_type,scope")
      .in("id", all)
      .eq("status", "published");
    if (error || !data) return out;
    const rows = data as {
      id: string;
      organization_id: string;
      slug: string;
      title: string;
      hero_url: string | null;
      visibility: string | null;
      client_type: string | null;
      scope: string | null;
    }[];
    const privateIds = rows.filter((r) => normalizeVisibility(r.visibility) === "private").map((r) => r.id);
    const tokens = new Map<string, string>();
    if (privateIds.length) {
      const { data: links } = await db
        .from("case_study_share_links")
        .select("case_study_id,organization_id,token")
        .in("case_study_id", privateIds)
        .is("revoked_at", null)
        .order("created_at", { ascending: true });
      for (const l of (links ?? []) as { case_study_id: string; organization_id: string; token: string }[]) {
        if (!tokens.has(l.case_study_id)) tokens.set(l.case_study_id, l.token);
      }
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    const sb = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    for (const i of interests) {
      const list: AttachedProject[] = [];
      for (const id of i.caseStudyIds) {
        const r = byId.get(id);
        // Only the interested company's own projects.
        if (!r || r.organization_id !== i.organizationId) continue;
        const priv = normalizeVisibility(r.visibility) === "private";
        const token = priv ? tokens.get(r.id) : null;
        if (priv && !token) continue; // link turned off: the trade withdrew it
        list.push({
          id: r.id,
          title: r.title,
          href: priv ? `/shared/${token}` : `/case-studies/${r.slug}`,
          heroUrl: r.hero_url && isOwnPhotoUrl(r.hero_url, sb) ? r.hero_url : null,
          isCaseStudy: Boolean(r.client_type && r.scope?.trim()),
        });
      }
      if (list.length) out.set(i.id, list);
    }
  } catch {
    // no attachments shown
  }
  return out;
}
