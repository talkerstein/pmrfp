import { readAtValidatedCheckpoint } from "./checkpoint";
import { D1ApiError, UUID, type D1Binding } from "../../src/lib/d1/contracts";

/** Anonymous-equivalent photo metadata only; paid documents and unpublished parents are excluded. */
export async function listPublicPhotos(db: D1Binding, url: URL) {
  const ids = url.searchParams.getAll("id");
  const after = url.searchParams.get("after");
  if (!ids.length || ids.length > 40 || ids.some(id => !UUID.test(id)) || new Set(ids.map(id => id.toLowerCase())).size !== ids.length || url.searchParams.getAll("after").length > 1 || (after !== null && !UUID.test(after)) || [...url.searchParams.keys()].some(key => key !== "id" && key !== "after")) throw new D1ApiError(400, "invalid_request");
  const { dataset, results } = await readAtValidatedCheckpoint<{ id: string; rfpId: string; url: string; createdAt: string }>(db, db.prepare(`SELECT d.id,d.rfp_id AS rfpId,d.file_url AS url,d.created_at AS createdAt
    FROM rfp_documents d JOIN rfp_posts r ON r.id=d.rfp_id
    WHERE r.status='published' AND d.visibility='public' AND d.file_type GLOB 'image/*'
    AND d.file_url IS NOT NULL AND d.file_url<>'' AND d.rfp_id IN (${ids.map(() => "?").join(",")})
    ${after ? "AND d.id>?" : ""} ORDER BY d.id LIMIT 251`)
    .bind(...ids.map(id => id.toLowerCase()), ...(after ? [after.toLowerCase()] : [])), "dataset_not_validated");
  const items = results.slice(0, 250);
  return { items, next: results.length > 250 ? items.at(-1)!.id : null, dataset };
}
