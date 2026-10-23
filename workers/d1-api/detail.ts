import { D1ApiError, RFP_SLUG, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { DETAIL_IDS, DETAIL_TEXT, detailRow, type DetailRow } from "../../src/lib/d1/detail-contracts";
import type { AuthConfig } from "./auth";
/** A snapshot must never authorize private reads. Ask current source RLS using the actual user's token, selecting only ID. */
export async function readRfpDetail(db: D1Binding, request: Request, env: AuthConfig, fetcher: typeof fetch): Promise<{ item: DetailRow | null; dataset: string }> {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (!slug || !RFP_SLUG.test(slug) || [...url.searchParams.keys()].some(k => k !== "slug") || url.searchParams.getAll("slug").length !== 1) throw new D1ApiError(400, "invalid_request");
  const manifest = await db.prepare("SELECT source_sha256,state FROM _migration_manifest WHERE id=1").first<{ source_sha256: string; state: string }>();
  if (manifest?.state !== "validated" || !/^[a-f0-9]{64}$/.test(manifest.source_sha256)) throw new D1ApiError(503, "dataset_not_validated");
  const source = new URL("/rest/v1/rfp_posts", env.SUPABASE_URL);
  source.searchParams.set("select", "id"); source.searchParams.set("slug", `eq.${slug}`); source.searchParams.set("limit", "2");
  let response: Response;
  try {
    response = await fetcher(source, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: request.headers.get("authorization")! }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch { throw new D1ApiError(503, "authorization_unavailable"); }
  if (!response.ok) throw new D1ApiError(503, "authorization_unavailable");
  let rows: unknown;
  try { rows = await response.json(); } catch { throw new D1ApiError(503, "authorization_unavailable"); }
  if (!Array.isArray(rows) || rows.length > 1) throw new D1ApiError(503, "authorization_unavailable");
  if (rows.length === 0) return { item: null, dataset: manifest.source_sha256 };
  const id = rows[0]?.id;
  if (typeof id !== "string" || !UUID.test(id)) throw new D1ApiError(503, "authorization_unavailable");
  const row = await db.prepare(`SELECT id,slug,title,status,contact_visibility,is_demo,budget_public,budget_min,budget_max,${[...DETAIL_TEXT, ...DETAIL_IDS].join(",")} FROM rfp_posts WHERE id=? AND slug=?`).bind(id, slug).first<Record<string, unknown>>();
  // Distinguish an authorized but not yet synchronized row from a real permission denial. Never fall back to source full rows.
  if (!row) throw new D1ApiError(409, "record_not_synced");
  return { item: detailRow({ ...row, is_demo: row.is_demo === 1, budget_public: row.budget_public === 1, budget_min: row.budget_min === null ? null : Number(row.budget_min), budget_max: row.budget_max === null ? null : Number(row.budget_max) }), dataset: manifest.source_sha256 };
}
