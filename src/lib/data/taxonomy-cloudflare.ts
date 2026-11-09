import type { TaxonomyRow } from "./taxonomy";

const origin = "https://pmrfp-taxonomy-phase.pmrfp.workers.dev";

/** A Cloudflare result is usable only when its public projection matches the source. */
export function matchingTaxonomy(
  source: TaxonomyRow[],
  candidate: unknown,
  fields: readonly string[],
): TaxonomyRow[] | null {
  if (!candidate || typeof candidate !== "object" || !("items" in candidate) ||
    !Array.isArray(candidate.items) || !("next" in candidate) || candidate.next !== null ||
    source.length === 0 || candidate.items.length !== source.length) return null;

  const rows: TaxonomyRow[] = [];
  for (const [index, row] of candidate.items.entries()) {
    const expected = source[index] as unknown as Record<string, unknown>;
    if (!row || typeof row !== "object" || Array.isArray(row) ||
      fields.some(field => !Object.hasOwn(row, field) || !Object.is(row[field], expected[field]))) return null;
    rows.push(Object.fromEntries(fields.map(field => [field, row[field]])) as unknown as TaxonomyRow);
  }
  return rows;
}

export async function cloudflareTaxonomy(table: string, gateway: string): Promise<unknown> {
  const url = new URL("/v1/taxonomy", origin);
  url.searchParams.set("table", table);
  return fetchPublicProjection(url, gateway);
}

export async function cloudflareBoard(shard: number, gateway: string): Promise<unknown> {
  const url = new URL("/v1/board", origin);
  url.searchParams.set("shard", String(shard));
  return fetchPublicProjection(url, gateway);
}

async function fetchPublicProjection(url: URL, gateway: string): Promise<unknown> {
  if (gateway.length < 32 || gateway.length > 512) return null;
  const response = await fetch(url, {
    headers: { "x-pmrfp-gateway-key": gateway },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) return null;
  return response.json();
}
