import { D1ApiError, UUID } from "./contracts";
export const DETAIL_TEXT = ["summary", "city", "province", "deadline", "scope", "requirements", "desired_start_date", "site_visit_date", "submission_instructions", "contact_name", "contact_email", "contact_phone", "source_type", "gc_project_name", "source_url", "source_notes"] as const;
export const DETAIL_IDS = ["region_id", "property_type_id", "awarded_rfp_id"] as const;
export type DetailRow = { id: string; slug: string; title: string; status: string; contact_visibility: "public_contact" | "pmrfp_mediated" | "anonymous_until_interest_approved"; is_demo: boolean; budget_public: boolean; budget_min: number | null; budget_max: number | null } & Record<typeof DETAIL_TEXT[number] | typeof DETAIL_IDS[number], string | null>;
/** Only fields already consumed by getFullRfp. Never return owner IDs, moderation or keep-alive tokens. */
export function detailRow(value: unknown): DetailRow {
  const bad = () => new D1ApiError(503, "gateway_unavailable");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw bad();
  const r = value as Record<string, unknown>;
  if (typeof r.id !== "string" || !UUID.test(r.id) || typeof r.slug !== "string" || typeof r.title !== "string" || typeof r.status !== "string" || typeof r.is_demo !== "boolean" || typeof r.budget_public !== "boolean" || !["public_contact", "pmrfp_mediated", "anonymous_until_interest_approved"].includes(String(r.contact_visibility))) throw bad();
  for (const key of DETAIL_TEXT) if (r[key] !== null && typeof r[key] !== "string") throw bad();
  for (const key of DETAIL_IDS) if (r[key] !== null && (typeof r[key] !== "string" || !UUID.test(r[key]))) throw bad();
  for (const key of ["budget_min", "budget_max"]) if (r[key] !== null && (typeof r[key] !== "number" || !Number.isFinite(r[key]))) throw bad();
  return Object.fromEntries(["id", "slug", "title", "status", "contact_visibility", "is_demo", "budget_public", "budget_min", "budget_max", ...DETAIL_TEXT, ...DETAIL_IDS].map(key => [key, r[key]])) as DetailRow;
}
