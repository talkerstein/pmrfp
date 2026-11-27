import { cache } from "react";
import { createReadClient } from "@/lib/supabase/read";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession, isAdminRole } from "@/lib/access/access";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { rotateFeatured } from "./perks";
import { isKarmaKind, isLevel, levelProgress, scoreLedger, type CapReason, type KarmaKind, type LevelNumber, type LevelProgress } from "./rules";

/**
 * Reputation reads. Public reads only ever see LEVELS (org_karma_public,
 * gc_package_levels) through the cached anon client. A company's own number
 * and ledger are read server-side for its signed-in members only. Every
 * reader degrades to "nothing" until the migration has run.
 */

/** Every listed company's level, once per request (cached 5 min upstream). */
export const publicLevels = cache(async (): Promise<Map<string, LevelNumber>> => {
  const out = new Map<string, LevelNumber>();
  if (isVpsLiveCustomerAuth()) {
    const db = vpsAppDatabase();
    for (let from = 0; from < 50000; from += 1000) {
      const rows = await db.prepare(`SELECT k.org_id,k.level FROM org_karma k JOIN organizations o ON o.id=k.org_id
        WHERE o.status='active' AND o.profile_status='approved' AND o.is_demo=0 AND ${customerAppAuthority}
        ORDER BY k.org_id LIMIT 1000 OFFSET ?`).bind(from).all<{ org_id: string; level: number }>();
      for (const row of rows.results) if (isLevel(row.level)) out.set(row.org_id, row.level);
      if (rows.results.length < 1000) break;
    }
    return out;
  }
  if (!isSupabaseConfigured()) return out;
  const db = createReadClient();
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db.from("org_karma_public").select("org_id,level").order("org_id").range(from, from + 999);
    if (error || !data) break;
    for (const r of data as { org_id: string; level: number }[]) if (isLevel(r.level)) out.set(r.org_id, r.level);
    if (data.length < 1000) break;
  }
  return out;
});

export async function orgLevel(orgId: string | null | undefined): Promise<LevelNumber | null> {
  if (!orgId) return null;
  return (await publicLevels()).get(orgId) ?? null;
}

/** Poster level (2+) of published GC packages, by package slug. */
export async function packageLevels(slugs: string[]): Promise<Map<string, LevelNumber>> {
  const out = new Map<string, LevelNumber>();
  if (isVpsLiveCustomerAuth() && slugs.length) {
    const rows = await vpsAppDatabase().prepare(`SELECT r.slug,k.level FROM rfp_posts r
      JOIN org_karma k ON k.org_id=r.posted_by_organization_id JOIN organizations o ON o.id=k.org_id
      WHERE r.status='published' AND r.source_type='gc_package' AND r.is_demo=0 AND o.is_demo=0 AND k.level>=2
      AND o.status='active' AND o.profile_status='approved' AND r.slug IN (SELECT value FROM json_each(?)) AND ${customerAppAuthority}`)
      .bind(JSON.stringify(slugs.slice(0,200))).all<{ slug: string; level: number }>();
    for (const row of rows.results) if (isLevel(row.level)) out.set(row.slug, row.level);
    return out;
  }
  if (!slugs.length || !isSupabaseConfigured()) return out;
  const { data, error } = await createReadClient().from("gc_package_levels").select("slug,level").in("slug", slugs.slice(0, 200));
  if (error || !data) return out;
  for (const r of data as { slug: string; level: number }[]) if (isLevel(r.level)) out.set(r.slug, r.level);
  return out;
}

export interface FeaturedCompany {
  orgId: string;
  name: string;
  slug: string;
  level: LevelNumber;
  /** Trade companies and suppliers have a public directory page. */
  listed: boolean;
}

/** Up to `n` level 4-5 companies, rotated daily. Real companies only. */
export async function featuredContributors(n = 3, day = new Date().toISOString().slice(0, 10)): Promise<FeaturedCompany[]> {
  const levels = await publicLevels();
  const pool = [...levels].filter(([, l]) => l >= 4).map(([orgId, level]) => ({ orgId, level }));
  const native = isVpsLiveCustomerAuth();
  if (!pool.length || (!native && !isSupabaseConfigured())) return [];
  const ids = pool.map((p) => p.orgId).slice(0, 200);
  const { data, error } = native ? { data: (await vpsAppDatabase().prepare(`SELECT id,name,slug,organization_type,profile_status,status,is_demo
    FROM organizations WHERE id IN (SELECT value FROM json_each(?)) AND ${customerAppAuthority}`)
    .bind(JSON.stringify(ids)).all()).results, error: null } : await createReadClient()
    .from("organizations")
    .select("id,name,slug,organization_type,profile_status,status,is_demo")
    .in("id", ids);
  if (error || !data) return [];
  const rows = (data as { id: string; name: string; slug: string; organization_type: string; profile_status: string; status: string; is_demo: boolean }[])
    .filter((o) => o.profile_status === "approved" && o.status === "active" && !o.is_demo);
  const byId = new Map(rows.map((o) => [o.id, o]));
  const picks = rotateFeatured(pool.filter((p) => byId.has(p.orgId)), n, day);
  return picks.map((p) => {
    const o = byId.get(p.orgId)!;
    return { orgId: p.orgId, name: o.name, slug: o.slug, level: p.level, listed: ["trade_company", "supplier"].includes(o.organization_type) };
  });
}

// ── A company's own reputation (dashboard) ──────────────────────────
export interface LedgerRow {
  id: string;
  kind: KarmaKind;
  points: number;
  counted: number;
  capped: CapReason | null;
  reversed: boolean;
  reversedReason: string | null;
  reason: string | null;
  sourceType: string;
  createdAt: string;
}

export interface OrgReputation {
  ready: boolean;
  score: number;
  raw: number;
  decay: number;
  lastEarnedAt: string | null;
  level: LevelNumber;
  progress: LevelProgress;
  ledger: LedgerRow[];
  /** Per kind: points that counted. */
  byKind: Partial<Record<KarmaKind, number>>;
}

const EMPTY: OrgReputation = {
  ready: false, score: 0, raw: 0, decay: 1, lastEarnedAt: null, level: 1, progress: levelProgress(0), ledger: [], byKind: {},
};

/**
 * The caller MUST have checked that the signed-in user belongs to `orgId`
 * (session.organization.id). Reads with the service role so caps can be
 * shown exactly as scored, then drops the actor column before returning.
 */
export async function getOrgReputation(orgId: string | null | undefined, now = new Date()): Promise<OrgReputation> {
  const native = isVpsLiveCustomerAuth();
  if (!orgId || (!native && !isServiceConfigured())) return EMPTY;
  const session = native ? await getSession() : null;
  if (native && (!session || session.profile.status !== "active"
    || (session.organization?.id !== orgId && !isAdminRole(session.profile.primary_role)))) return EMPTY;
  const { data, error } = native ? { data: (await vpsAppDatabase().prepare(`SELECT id,kind,points,actor_id,source_type,
    reason,created_at,reversed_at,reversed_reason FROM karma_events e WHERE org_id=? AND ${customerAppAuthority}
    AND EXISTS(SELECT 1 FROM users_profile u WHERE id=? AND status='active' AND
      (primary_role IN ('admin','super_admin') OR EXISTS(SELECT 1 FROM organization_members m WHERE m.user_id=u.id AND m.organization_id=e.org_id)))
    ORDER BY created_at DESC LIMIT 2000`).bind(orgId, session!.userId).all()).results, error: null }
    : await createServiceClient().from("karma_events").select("id,kind,points,actor_id,source_type,reason,created_at,reversed_at,reversed_reason")
      .eq("org_id", orgId).order("created_at", { ascending: false }).limit(2000);
  if (error || !data) return EMPTY;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const events = (data as any[])
    .filter((r) => isKarmaKind(r.kind))
    .map((r) => ({
      id: r.id as string, kind: r.kind as KarmaKind, points: r.points as number, actorId: r.actor_id as string,
      sourceType: r.source_type as string, reason: r.reason as string | null, createdAt: r.created_at as string,
      reversedAt: r.reversed_at as string | null, reversedReason: r.reversed_reason as string | null,
    }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const s = scoreLedger(events, now);
  const byKind: Partial<Record<KarmaKind, number>> = {};
  for (const e of s.events) if (e.counted) byKind[e.event.kind] = (byKind[e.event.kind] ?? 0) + e.counted;
  const ledger: LedgerRow[] = s.events
    .map((e) => ({
      id: e.event.id, kind: e.event.kind, points: e.event.points, counted: e.counted, capped: e.capped, reversed: e.reversed,
      reversedReason: e.event.reversedReason, reason: e.event.kind === "admin_adjustment" ? e.event.reason : null,
      sourceType: e.event.sourceType, createdAt: e.event.createdAt,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ready: true, score: s.score, raw: s.raw, decay: s.decay, lastEarnedAt: s.lastEarnedAt, level: s.level, progress: levelProgress(s.score), ledger, byKind };
}

/** True once the karma migration has run (for "coming soon" states). */
export async function karmaReady(): Promise<boolean> {
  if (isVpsLiveCustomerAuth()) {
    const row = await vpsAppDatabase().prepare(`SELECT count(*) AS n FROM org_karma WHERE ${customerAppAuthority}`)
      .first().catch(() => null);
    return Boolean(row);
  }
  if (!isSupabaseConfigured()) return false;
  const { error } = await createReadClient().from("org_karma_public").select("org_id", { head: true, count: "exact" });
  return !error;
}
