import { D1ApiError, type D1Binding, type D1Statement } from "../../src/lib/d1/contracts";

const sql = "SELECT source_sha256, state FROM _migration_manifest WHERE id=1";

function validatedDigest(marker: Record<string, unknown> | null | undefined, error: string) {
  const digest = marker?.source_sha256;
  if (marker?.state !== "validated" || typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new D1ApiError(503, error);
  }
  return digest;
}

export async function readValidatedCheckpoint(db: D1Binding) {
  return validatedDigest(await db.prepare(sql).first<Record<string, unknown>>(), "dataset_unavailable");
}

export async function readAtValidatedCheckpoint<T extends Record<string, unknown>>(
  db: D1Binding,
  query: D1Statement,
  error = "dataset_unavailable",
) {
  // Both statements run in one D1 transaction. A refresh cannot advance the
  // manifest between reading the checkpoint and reading the associated rows.
  const [marker, data] = await db.batch([db.prepare(sql), query]);
  if (!marker?.success || !data?.success) throw new D1ApiError(503, error);
  return { dataset: validatedDigest(marker.results[0], error), results: data.results as T[] };
}
