import type { D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { createServiceClient } from "@/lib/supabase/service";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { followLimit, followUsage, type FollowStatus, type FollowUsage } from "./rules";

/**
 * Database side of following (service role, after the caller checked who is
 * asking): follow, unfollow and "my follows". Every function takes the
 * client, so tests pass a fake (test/unit/buyer-follows.test.ts).
 *
 * A follow goes through follow_buyer() (migration 20261021000110), which
 * enforces the free limit atomically. Before the migration runs, following
 * answers "unavailable" and nothing breaks.
 */

type Db = Pick<SupabaseClient, "from" | "rpc"> | D1Binding;
type ReadDb = Pick<SupabaseClient, "from"> | D1Binding;
const isD1 = (db: ReadDb): db is D1Binding => "prepare" in db;

export function followsDb(): Db {
  return isVpsLiveCustomerAuth() ? vpsAppDatabase() : createServiceClient();
}

const activeAccount = `u.status='active' AND ${customerAppAuthority}`;
const entitled = `EXISTS (SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
  WHERE m.user_id=u.id AND o.status='active' AND o.is_demo=0
    AND (EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id=o.id AND s.status IN ('active','comped') AND s.tier IN ('pro','featured'))
      OR EXISTS (SELECT 1 FROM trade_trials t WHERE t.organization_id=o.id AND o.organization_type='trade_company'
        AND julianday(t.started_at)<=julianday('now') AND julianday(t.ends_at)>julianday('now'))))`;

export interface FollowRow {
  key: string;
  createdAt: string;
}

export type FollowResult =
  | { status: FollowStatus | "unfollowed"; usage: FollowUsage }
  | { status: "unavailable" | "error"; usage: FollowUsage | null };

/** The person's follows, newest first. `missing`: the table isn't there yet. */
export async function myFollows(db: ReadDb, userId: string): Promise<{ rows: FollowRow[]; missing: boolean }> {
  if (isD1(db)) {
    const {results} = await db.prepare(`SELECT f.buyer_slug,f.created_at FROM buyer_follows f
      JOIN users_profile u ON u.id=f.user_id WHERE u.id=? AND ${activeAccount}
      ORDER BY f.created_at DESC,f.buyer_slug LIMIT 1000`).bind(userId).all<{buyer_slug:string;created_at:string}>();
    return { rows: results.map(row => ({key:row.buyer_slug,createdAt:row.created_at})), missing:false };
  }
  const { data, error } = await db.from("buyer_follows").select("buyer_slug,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000);
  if (error) return { rows: [], missing: isMissingTableError(error) };
  return { rows: ((data ?? []) as { buyer_slug: string; created_at: string }[]).map((r) => ({ key: r.buyer_slug, createdAt: r.created_at })), missing: false };
}

/** How many buyers the person follows now (null when it can't be read). */
export async function followCount(db: ReadDb, userId: string): Promise<number | null> {
  if (isD1(db)) return (await db.prepare("SELECT count(*) AS used FROM buyer_follows WHERE user_id=?")
    .bind(userId).first<{used:number}>())?.used ?? null;
  const { count, error } = await db.from("buyer_follows").select("buyer_slug", { count: "exact", head: true }).eq("user_id", userId);
  return error ? null : (count ?? 0);
}

/** Follow `key` (a page that exists: the caller checked). Free accounts stop at FREE_FOLLOW_LIMIT. */
export async function followBuyer(db: Db, x: { userId: string; orgId: string | null; key: string; pro: boolean }): Promise<FollowResult> {
  if (isD1(db)) {
    try {
      const selection = db.prepare(`SELECT (SELECT count(*) FROM buyer_follows WHERE user_id=u.id) AS used,
        EXISTS(SELECT 1 FROM buyer_follows WHERE user_id=u.id AND buyer_slug=?) AS follows,
        ${entitled} AS pro FROM users_profile u WHERE u.id=? AND ${activeAccount}
        AND (u.primary_role IN ('trade','supplier') OR ${entitled})`).bind(x.key,x.userId);
      const [write,state] = await db.batch([
        db.prepare(`INSERT INTO buyer_follows(user_id,org_id,buyer_slug)
          SELECT u.id,(SELECT organization_id FROM organization_members WHERE user_id=u.id AND organization_id=?),?
          FROM users_profile u WHERE u.id=? AND ${activeAccount}
          AND (u.primary_role IN ('trade','supplier') OR ${entitled})
          AND (${entitled} OR (SELECT count(*) FROM buyer_follows WHERE user_id=u.id)<?)
          ON CONFLICT(user_id,buyer_slug) DO NOTHING RETURNING user_id`)
          .bind(x.orgId,x.key,x.userId,followLimit(false)), selection,
      ]);
      const after = state.results[0] as {used:number;follows:number;pro:number} | undefined;
      if (!after) return {status:"unavailable",usage:null};
      return { status: write.results.length ? "followed" : after.follows ? "already" : "limit",
        usage: followUsage(after.used,after.pro===1) };
    } catch { return { status:"error",usage:null }; }
  }
  const { data, error } = await db.rpc("follow_buyer", { p_user: x.userId, p_org: x.orgId, p_key: x.key, p_limit: followLimit(x.pro) });
  if (error) {
    if (!isMissingTableError(error)) console.error("[follows] follow failed:", error.message);
    return { status: isMissingTableError(error) ? "unavailable" : "error", usage: null };
  }
  const status = data === "followed" || data === "already" || data === "limit" ? data : null;
  if (!status) return { status: "error", usage: null };
  const used = await followCount(db, x.userId);
  return { status, usage: followUsage(used ?? 0, x.pro) };
}

/** How many people follow one page right now (the public-buyer dashboard). Counts only; null when unreadable. */
export async function followersOf(db: ReadDb, key: string): Promise<number | null> {
  if (isD1(db)) return (await db.prepare("SELECT count(*) AS n FROM buyer_follows WHERE buyer_slug=?").bind(key).first<{n:number}>())?.n ?? null;
  const { count, error } = await db.from("buyer_follows").select("user_id", { count: "exact", head: true }).eq("buyer_slug", key);
  return error ? null : (count ?? 0);
}

/** Stop following `key`. */
export async function unfollowBuyer(db: ReadDb, x: { userId: string; key: string; pro: boolean }): Promise<FollowResult> {
  if (isD1(db)) {
    try {
      await db.prepare(`DELETE FROM buyer_follows WHERE user_id=? AND buyer_slug=?
        AND EXISTS(SELECT 1 FROM users_profile u WHERE u.id=buyer_follows.user_id AND ${activeAccount})`)
        .bind(x.userId,x.key).run();
      return { status:"unfollowed",usage:followUsage(await followCount(db,x.userId) ?? 0,x.pro) };
    } catch { return { status:"error",usage:null }; }
  }
  const { error } = await db.from("buyer_follows").delete().eq("user_id", x.userId).eq("buyer_slug", x.key);
  if (error) return { status: isMissingTableError(error) ? "unavailable" : "error", usage: null };
  const used = await followCount(db, x.userId);
  return { status: "unfollowed", usage: followUsage(used ?? 0, x.pro) };
}
