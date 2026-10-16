/**
 * Forum home "This week in your trade and region" (pure part, tested in
 * test/forum-rooms.test.ts): which rooms lead for a viewer, and which of
 * this week's open-bids threads to show. Nothing is invented: every item is
 * a real thread; with nothing to show, the block says so.
 */
import { canonicalProvince } from "@/lib/data/price-benchmarks";
import { forumForTrade, roomCountry, roomForProvince, type ForumCategorySlug, type RoomCountry } from "./categories";

export const MAX_HOME_ROOMS = 4;

/**
 * Followed rooms first, then the member's trade room(s), then their own
 * regional room; a regional room from the other country is never added.
 */
export function pickRooms(i: {
  followed: readonly ForumCategorySlug[];
  tradeSlugs: readonly string[];
  province: string | null;
  country: RoomCountry;
}): ForumCategorySlug[] {
  const out: ForumCategorySlug[] = [];
  const add = (r: ForumCategorySlug | null) => {
    if (!r || out.includes(r)) return;
    const c = roomCountry(r);
    if (c && c !== i.country) return;
    out.push(r);
  };
  for (const r of i.followed) add(r);
  for (const t of i.tradeSlugs) add(forumForTrade(t));
  add(roomForProvince(canonicalProvince(i.province)));
  return out.slice(0, MAX_HOME_ROOMS);
}

/** This week's open-bids threads for the viewer's rooms (newest per room), else the newest ones in their country. */
export function pickOpenBids<T extends { categorySlug: ForumCategorySlug; createdAt: string }>(threads: readonly T[], rooms: readonly ForumCategorySlug[], limit = 4, now = new Date()): T[] {
  const fresh = threads.filter((t) => now.getTime() - Date.parse(t.createdAt) < 8 * 86_400_000).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const mine: T[] = [];
  for (const room of rooms) {
    const hit = fresh.find((t) => t.categorySlug === room);
    if (hit) mine.push(hit);
  }
  if (mine.length) return mine.slice(0, limit);
  // No rooms yet (or none with bids): the newest regional and trade threads.
  return fresh.slice(0, limit);
}
