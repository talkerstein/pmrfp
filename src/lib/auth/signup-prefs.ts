import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Most trade / region picks kept from the sign-up page. */
export const MAX_PREF_SLUGS = 40;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Trade and region slugs picked on the sign-up page, cleaned for auth
 * metadata: strings that look like slugs, de-duplicated, capped. They are only
 * a pre-selection for onboarding (which re-validates against the taxonomy).
 */
export function parsePrefSlugs(values: unknown): string[] {
  const list = Array.isArray(values) ? values : [];
  const out: string[] = [];
  for (const v of list) {
    if (typeof v !== "string") continue;
    const s = v.trim().toLowerCase();
    if (s.length > 80 || !SLUG.test(s) || out.includes(s)) continue;
    out.push(s);
    if (out.length >= MAX_PREF_SLUGS) break;
  }
  return out;
}

/** The sign-up picks saved in the signed-in user's auth metadata. */
export async function getSignupPrefs(): Promise<{ categories: string[]; regions: string[]; company: string | null }> {
  if (!isSupabaseConfigured()) return { categories: [], regions: [], company: null };
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const company = typeof meta.pref_company === "string" ? meta.pref_company.trim().slice(0, 120) || null : null;
    return { categories: parsePrefSlugs(meta.pref_categories), regions: parsePrefSlugs(meta.pref_regions), company };
  } catch {
    return { categories: [], regions: [], company: null };
  }
}
