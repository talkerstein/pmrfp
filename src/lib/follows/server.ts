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

type Db = Pick<SupabaseClient, "from" | "rpc">;

export interface FollowRow {
  key: string;
  createdAt: string;
}

export type FollowResult =
  | { status: FollowStatus | "unfollowed"; usage: FollowUsage }
  | { status: "unavailable" | "error"; usage: FollowUsage | null };

/** The person's follows, newest first. `missing`: the table isn't there yet. */
export async function myFollows(db: Pick<SupabaseClient, "from">, userId: string): Promise<{ rows: FollowRow[]; missing: boolean }> {
  const { data, error } = await db.from("buyer_follows").select("buyer_slug,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000);
  if (error) return { rows: [], missing: isMissingTableError(error) };
  return { rows: ((data ?? []) as { buyer_slug: string; created_at: string }[]).map((r) => ({ key: r.buyer_slug, createdAt: r.created_at })), missing: false };
}

/** How many buyers the person follows now (null when it can't be read). */
export async function followCount(db: Pick<SupabaseClient, "from">, userId: string): Promise<number | null> {
  const { count, error } = await db.from("buyer_follows").select("buyer_slug", { count: "exact", head: true }).eq("user_id", userId);
  return error ? null : (count ?? 0);
}

/** Follow `key` (a page that exists: the caller checked). Free accounts stop at FREE_FOLLOW_LIMIT. */
export async function followBuyer(db: Db, x: { userId: string; orgId: string | null; key: string; pro: boolean }): Promise<FollowResult> {
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
export async function followersOf(db: Pick<SupabaseClient, "from">, key: string): Promise<number | null> {
  const { count, error } = await db.from("buyer_follows").select("user_id", { count: "exact", head: true }).eq("buyer_slug", key);
  return error ? null : (count ?? 0);
}

/** Stop following `key`. */
export async function unfollowBuyer(db: Pick<SupabaseClient, "from">, x: { userId: string; key: string; pro: boolean }): Promise<FollowResult> {
  const { error } = await db.from("buyer_follows").delete().eq("user_id", x.userId).eq("buyer_slug", x.key);
  if (error) return { status: isMissingTableError(error) ? "unavailable" : "error", usage: null };
  const used = await followCount(db, x.userId);
  return { status: "unfollowed", usage: followUsage(used ?? 0, x.pro) };
}
