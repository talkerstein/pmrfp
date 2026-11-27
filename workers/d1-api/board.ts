import { readAtValidatedCheckpoint } from "./checkpoint";
import { D1ApiError, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { BOARD_PAGE_SIZE, shardRange, publicBoardRow } from "../../src/lib/d1/board-contracts";

const nativeRevision = "SELECT revision FROM _native_board_revision WHERE id=1";

function parseNativeRevision(row: { revision?: unknown } | null | undefined): string {
  if (typeof row?.revision !== "number" || !Number.isSafeInteger(row.revision) || row.revision < 0) {
    throw new D1ApiError(503, "dataset_unavailable");
  }
  return "native:" + row.revision;
}

export async function readNativeBoardRevision(db: D1Binding) {
  return parseNativeRevision(await db.prepare(nativeRevision).first<{ revision: number }>());
}

export async function listPublicBoard(db: D1Binding, url: URL, native = false) {
  const keys = [...url.searchParams.keys()];
  const shardText = url.searchParams.get("shard") ?? "";
  const after = url.searchParams.get("after");
  if (new Set(keys).size !== keys.length || keys.some(k => k !== "shard" && k !== "after") || !/^(?:[0-9]|1[0-5])$/.test(shardText) || (after !== null && !UUID.test(after))) throw new D1ApiError(400, "invalid_request");
  const { lo, hi } = shardRange(Number(shardText));
  const cursor = after?.toLowerCase();
  if (cursor && ((lo && cursor < lo) || (hi && cursor >= hi))) throw new D1ApiError(400, "invalid_request");
  const bounds: string[] = []; const params: (string | number)[] = [];
  if (lo) { bounds.push("r.id>=?"); params.push(lo); }
  if (hi) { bounds.push("r.id<?"); params.push(hi); }
  if (cursor) { bounds.push("r.id>?"); params.push(cursor); }
  const query = db.prepare(`SELECT r.id,r.slug,r.title,r.summary,r.region_id AS regionId,
    r.property_type_id AS propertyTypeId,r.city,r.province,r.deadline,r.is_demo AS isDemo,
    r.source_type AS sourceType,r.gc_project_name AS gcProjectName,r.awarded_rfp_id AS awardedRfpId,
    r.published_at AS publishedAt,r.created_at AS createdAt,
    (SELECT json_group_array(category_id) FROM (SELECT category_id FROM rfp_categories WHERE rfp_id=r.id ORDER BY id)) AS categoryIds
    FROM rfp_posts r WHERE r.status='published'${bounds.map(b => " AND " + b).join("")} ORDER BY r.id LIMIT ?`)
    .bind(...params, BOARD_PAGE_SIZE + 1);
  const { dataset, results } = native
    ? await readNativeBoardPage(db, query)
    : await readAtValidatedCheckpoint<Record<string, unknown>>(db, query);
  const items = results.slice(0, BOARD_PAGE_SIZE).map(row => publicBoardRow({ ...row, isDemo: row.isDemo === 1, categoryIds: JSON.parse(String(row.categoryIds)) }));
  return { items, next: results.length > BOARD_PAGE_SIZE ? items.at(-1)!.id : null, dataset };
}

async function readNativeBoardPage(db: D1Binding, query: ReturnType<D1Binding["prepare"]>) {
  const [marker, data] = await db.batch<Record<string, unknown>>([db.prepare(nativeRevision), query]);
  if (!marker?.success || !data?.success) throw new D1ApiError(503, "dataset_unavailable");
  return { dataset: parseNativeRevision(marker.results[0]), results: data.results };
}
