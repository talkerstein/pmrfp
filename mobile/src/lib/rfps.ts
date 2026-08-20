import { supabase } from "./supabase";

/** Teaser columns — what `rfp_public` exposes to anyone, subscribed or not. */
export type RfpTeaser = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  city: string | null;
  province: string | null;
  deadline: string | null;
  published_at: string | null;
};

/** The gated columns. Present only when RLS lets the full row through. */
export type RfpFull = RfpTeaser & {
  scope: string | null;
  requirements: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_public: boolean;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  submission_instructions: string | null;
};

export async function listRfps(limit = 50): Promise<RfpTeaser[]> {
  // Hide anything already past its closing date. `rfp_public` only filters on
  // status='published', and a post keeps that status until the expiry job flips
  // it — so without this the board shows work nobody can still bid on.
  // Undated posts are kept: no deadline is not the same as a passed one.
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("rfp_public")
    .select("id,title,slug,summary,city,province,deadline,published_at")
    .or(`deadline.gte.${today},deadline.is.null`)
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as RfpTeaser[];
}

/**
 * Fetch one RFP, returning whatever this user is actually entitled to.
 *
 * We ask `rfp_posts` for the full row first. If the caller lacks access, RLS
 * returns no row — not an error — so we fall back to the public teaser. That
 * means the paywall is enforced by the database rather than by this code, and
 * the app cannot leak a scope it wasn't granted even if this logic is wrong.
 */
export async function getRfp(
  id: string,
): Promise<{ rfp: RfpTeaser | RfpFull; locked: boolean } | null> {
  const { data: full } = await supabase
    .from("rfp_posts")
    .select(
      "id,title,slug,summary,city,province,deadline,published_at,scope,requirements,budget_min,budget_max,budget_public,contact_name,contact_email,contact_phone,submission_instructions",
    )
    .eq("id", id)
    .maybeSingle();

  if (full) return { rfp: full as RfpFull, locked: false };

  const { data: teaser } = await supabase
    .from("rfp_public")
    .select("id,title,slug,summary,city,province,deadline,published_at")
    .eq("id", id)
    .maybeSingle();

  return teaser ? { rfp: teaser as RfpTeaser, locked: true } : null;
}

/**
 * Express interest. The web app's /api/rfp-interest route re-checks access
 * server-side; here the `rfp_interests` RLS policy is the equivalent guard, so
 * an unsubscribed user's insert is rejected by the database.
 */
export async function expressInterest(rfpId: string, message: string) {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return { error: "You need to sign in first." };

  // Interest is recorded against the ORGANISATION, not the person — the table
  // requires trade_organization_id and is unique on (rfp_id, org), so two
  // people from the same company can't double-submit.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    return { error: "Your account isn't linked to a company yet." };
  }

  const { error } = await supabase.from("rfp_interests").insert({
    rfp_id: rfpId,
    trade_organization_id: membership.organization_id,
    submitted_by_user_id: userId,
    message,
  });

  if (error) {
    // The unique constraint is the expected collision here, not a real failure.
    if (error.code === "23505") return { error: "You've already expressed interest in this one." };
    return { error: error.message };
  }
  return { error: null };
}

export function deadlineLabel(deadline: string | null): string {
  if (!deadline) return "No deadline";
  const days = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) return "Closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  if (days <= 14) return `Closes in ${days} days`;
  return new Date(deadline).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}
