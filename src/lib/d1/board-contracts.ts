import { D1ApiError, UUID } from "./contracts";
export const BOARD_SHARDS = 16;
export const BOARD_PAGE_SIZE = 250;
/** Exactly the existing cookieless public-board projection; no paid/contact fields. */
export interface BoardRow {
  id: string; slug: string; title: string; summary: string | null;
  regionId: string | null; propertyTypeId: string | null;
  city: string | null; province: string | null; deadline: string | null;
  isDemo: boolean; sourceType: string | null; gcProjectName: string | null;
  awardedRfpId: string | null; publishedAt: string | null; createdAt: string | null;
  categoryIds: string[];
}
export function shardRange(shard: number): { lo: string | null; hi: string | null } {
  if (!Number.isInteger(shard) || shard < 0 || shard >= BOARD_SHARDS) throw new D1ApiError(400, "invalid_request");
  const bound = (digit: number) => `${digit.toString(16)}0000000-0000-0000-0000-000000000000`;
  return { lo: shard === 0 ? null : bound(shard), hi: shard === BOARD_SHARDS - 1 ? null : bound(shard + 1) };
}
export function publicBoardRow(value: unknown): BoardRow {
  const bad = () => new D1ApiError(503, "gateway_unavailable");
  if (!value || typeof value !== "object") throw bad();
  const r = value as Record<string, unknown>;
  if (typeof r.id !== "string" || !UUID.test(r.id) || typeof r.slug !== "string" || typeof r.title !== "string" || typeof r.isDemo !== "boolean" || !Array.isArray(r.categoryIds) || r.categoryIds.some(id => typeof id !== "string" || !UUID.test(id))) throw bad();
  const nullableText = ["summary", "city", "province", "deadline", "sourceType", "gcProjectName", "publishedAt", "createdAt"] as const;
  for (const key of nullableText) if (r[key] !== null && typeof r[key] !== "string") throw bad();
  for (const key of ["regionId", "propertyTypeId", "awardedRfpId"] as const) if (r[key] !== null && (typeof r[key] !== "string" || !UUID.test(r[key]))) throw bad();
  // Whitelist even a compromised upstream response rather than copying unknown fields.
  return Object.fromEntries(["id", "slug", "title", ...nullableText, "regionId", "propertyTypeId", "awardedRfpId", "isDemo", "categoryIds"].map(k => [k, r[k]])) as unknown as BoardRow;
}
