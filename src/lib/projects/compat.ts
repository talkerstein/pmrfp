/**
 * Production deploys before the SQL runs. A query that names a column or
 * table from a migration that isn't applied yet fails with one of these;
 * callers retry the old way (or hide the feature) only for THIS error, never
 * for a network blip, so a transient failure can't widen what a list shows.
 */
export function isSchemaMissing(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  if (["42703", "PGRST204", "42P01", "PGRST205", "PGRST200"].includes(err.code ?? "")) return true;
  return /does not exist|schema cache/i.test(err.message ?? "");
}
