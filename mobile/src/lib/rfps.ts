import { SITE_URL, storedToken } from "./session";
import { ApiError, apiFetch } from "./api";

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
  const response=await fetch(SITE_URL+"/api/mobile/rfps?"+new URLSearchParams({limit:String(limit)}));
  if (!response.ok) throw Error("Could not load opportunities.");
  return response.json();
}

export async function getRfp(id:string):Promise<{rfp:RfpTeaser|RfpFull;locked:boolean}|null> {
  const token=await storedToken();
  const response=await fetch(SITE_URL+"/api/mobile/rfps?"+new URLSearchParams({id}),{
    headers:token?{authorization:"Bearer "+token}:undefined,
  });
  if (!response.ok) throw Error("Could not load this opportunity.");
  return response.json();
}

/**
 * Express interest, through the web app's /api/rfp-interest route (bearer
 * token). Responses are written server-side only (the database no longer
 * takes them from the app directly): the route checks access, the free
 * monthly allowance on property-manager jobs, and emails the poster.
 * Interest is recorded against the company, once per listing.
 */
export async function expressInterest(rfpId: string, message: string) {
  try {
    await apiFetch("/api/rfp-interest", { method: "POST", body: { rfpId, message, acceptDisclaimer: true } });
    return { error: null };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 409) return { error: "You've already expressed interest in this one." };
      return { error: e.message };
    }
    return { error: "That didn't work. Try again." };
  }
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
