import { D1ApiError, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { BOARD_PAGE_SIZE, shardRange, publicBoardRow } from "../../src/lib/d1/board-contracts";

export async function listPublicBoard(db: D1Binding, url: URL) {
  const keys = [...url.searchParams.keys()];
  const shardText = url.searchParams.get("shard") ?? "";
  const after = url.searchParams.get("after");
  if (new Set(keys).size !== keys.length || keys.some(k => k !== "shard" && k !== "after") || !/^(?:[0-9]|1[0-5])$/.test(shardText) || (after !== null && !UUID.test(after))) throw new D1ApiError(400, "invalid_request");
  const { lo, hi } = shardRange(Number(shardText));
  const cursor = after?.toLowerCase();
  if (cursor && ((lo && cursor < lo) || (hi && cursor >= hi))) throw new D1ApiError(400, "invalid_request");
  const manifest = await db.prepare("SELECT source_sha256,state FROM _migration_manifest WHERE id=1").first<{ source_sha256: string; state: string }>();
  if (manifest?.state !== "validated" || !/^[a-f0-9]{64}$/.test(manifest.source_sha256)) throw new D1ApiError(503, "dataset_unavailable");
  const bounds: string[] = []; const params: (string | number)[] = [];
  if (lo) { bounds.push("r.id>=?"); params.push(lo); }
  if (hi) { bounds.push("r.id<?"); params.push(hi); }
  if (cursor) { bounds.push("r.id>?"); params.push(cursor); }
  const { results } = await db.prepare(`SELECT r.id,r.slug,r.title,r.summary,r.region_id AS regionId,
    r.property_type_id AS propertyTypeId,r.city,r.province,r.deadline,r.is_demo AS isDemo,
    r.source_type AS sourceType,r.gc_project_name AS gcProjectName,r.awarded_rfp_id AS awardedRfpId,
    r.published_at AS publishedAt,r.created_at AS createdAt,
    (SELECT json_group_array(category_id) FROM (SELECT category_id FROM rfp_categories WHERE rfp_id=r.id ORDER BY id)) AS categoryIds
    FROM rfp_posts r WHERE r.status='published'${bounds.map(b => " AND " + b).join("")} ORDER BY r.id LIMIT ?`)
    .bind(...params, BOARD_PAGE_SIZE + 1).all<Record<string, unknown>>();
  const items = results.slice(0, BOARD_PAGE_SIZE).map(row => publicBoardRow({ ...row, isDemo: row.isDemo === 1, categoryIds: JSON.parse(String(row.categoryIds)) }));
  return { items, next: results.length > BOARD_PAGE_SIZE ? items.at(-1)!.id : null, dataset: manifest.source_sha256 };
}
