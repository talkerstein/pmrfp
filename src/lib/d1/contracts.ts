/** Small structural subset of the native D1 API; shared by Worker and local tests. */
export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta: { changes?: number };
}
export interface D1Statement {
  bind(...values: (string | number | null)[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Binding {
  prepare(sql: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}
export interface SavedRfpItem { rfpId: string; title: string; slug: string; savedAt: string }
export interface SaveRfpInput { rfpId?: string; rfpSlug?: string; action?: "save" | "unsave" }
export class D1ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RFP_SLUG = /^[a-z0-9][a-z0-9-]{0,200}$/;
export function parseSaveInput(value: unknown): Required<Pick<SaveRfpInput, "action">> & SaveRfpInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new D1ApiError(400, "invalid_request");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(k => !["rfpId", "rfpSlug", "action"].includes(k))) throw new D1ApiError(400, "invalid_request");
  if (row.rfpId !== undefined && (typeof row.rfpId !== "string" || !UUID.test(row.rfpId))) throw new D1ApiError(400, "invalid_request");
  if (row.rfpSlug !== undefined && (typeof row.rfpSlug !== "string" || !RFP_SLUG.test(row.rfpSlug))) throw new D1ApiError(400, "invalid_request");
  if (!row.rfpId && !row.rfpSlug) throw new D1ApiError(400, "missing_rfp");
  if (row.action !== undefined && row.action !== "save" && row.action !== "unsave") throw new D1ApiError(400, "invalid_request");
  return { rfpId: row.rfpId as string | undefined, rfpSlug: row.rfpSlug as string | undefined, action: row.action === "unsave" ? "unsave" : "save" };
}

/** Read an actual bounded stream; Content-Length is not trusted. */
export async function readSaveInput(request: Request): Promise<SaveRfpInput> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new D1ApiError(415, "json_required");
  const reader = request.body?.getReader();
  if (!reader) throw new D1ApiError(400, "invalid_request");
  let total = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 4096) { await reader.cancel(); throw new D1ApiError(413, "request_too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new D1ApiError(400, "invalid_request"); }
  return parseSaveInput(body);
}
