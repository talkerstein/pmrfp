import type { SupabaseClient } from "@supabase/supabase-js";

export interface RfpPrivateFields {
  budget_min: number | null;
  budget_max: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

/** Budget and contact, as the signed-in caller may see them (migration 20261104000100). Null without access. */
export async function rfpPrivateFields(supabase: SupabaseClient, rfpId: string): Promise<RfpPrivateFields | null> {
  const { data, error } = await supabase.rpc("rfp_private_fields", { p_rfp_id: rfpId });
  if (error) return null;
  return ((Array.isArray(data) ? data[0] : data) as RfpPrivateFields | undefined) ?? null;
}
