import { D1ApiError, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { isTaxonomyTable, TAXONOMY_PAGE_SIZE, TAXONOMY_SELECTS } from "../../src/lib/d1/taxonomy-contracts";

/** Cookieless public reads mirror anon RLS: inactive taxonomy is not public. */
export async function listPublicTaxonomy(db: D1Binding, url: URL): Promise<{ items: unknown[]; next: string | null }> {
  const keys = [...url.searchParams.keys()];
  const table = url.searchParams.get("table") ?? "";
  const cursor = url.searchParams.get("after");
  if (new Set(keys).size !== keys.length || keys.some(k => k !== "table" && k !== "after") || !isTaxonomyTable(table) || (cursor !== null && !UUID.test(cursor))) throw new D1ApiError(400, "invalid_request");
  // Only fixed identifiers enter SQL. Pagination values are bound parameters.
  const { results } = await db.prepare(`SELECT ${TAXONOMY_SELECTS[table]} FROM ${table}
    WHERE active=1${cursor ? " AND id>?" : ""} ORDER BY id LIMIT ?`)
    .bind(...(cursor ? [cursor.toLowerCase()] : []), TAXONOMY_PAGE_SIZE + 1).all<Record<string, unknown>>();
  const page = results.slice(0, TAXONOMY_PAGE_SIZE);
  return { items: page.map(row => ({ ...row, active: row.active === 1 })), next: results.length > TAXONOMY_PAGE_SIZE ? String(page.at(-1)!.id) : null };
}
