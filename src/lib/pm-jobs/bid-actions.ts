"use server";

import { revalidatePath } from "next/cache";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { declineResponse, loadJobForDecision, ownsJob, pickResponse, shareContactWith, toggleShortlist, type DecisionError } from "./decisions";

/**
 * The poster's buttons on /pm-dashboard/rfps/[id]/interests: shortlist,
 * decline (optional note), pick, share my contact. Each checks that the
 * signed-in user posted the job (or belongs to the posting company, or is an
 * admin), then writes with the service role (lib/pm-jobs/decisions).
 * Answers with a code; the buttons show it in the page's language.
 */
export interface BidActionState {
  done?: "shortlist" | "decline" | "pick" | "share";
  error?: DecisionError | "demo";
}

type Kind = NonNullable<BidActionState["done"]>;

async function run(kind: Kind, formData: FormData): Promise<BidActionState> {
  if (!isSupabaseConfigured() || !isServiceConfigured()) return { error: "demo" };
  const session = await getSession();
  if (!session) return { error: "not_owner" };
  const rfpId = String(formData.get("rfpId") ?? "");
  const interestId = String(formData.get("interestId") ?? "");
  if (!rfpId || !interestId) return { error: "not_found" };

  const db = createServiceClient();
  const job = await loadJobForDecision(db, rfpId);
  if (!job) return { error: "not_found" };
  if (!ownsJob(job, { userId: session.userId, organizationId: session.organization?.id ?? null, admin: isAdminRole(session.profile.primary_role) })) {
    return { error: "not_owner" };
  }

  const result =
    kind === "shortlist"
      ? await toggleShortlist(db, job, interestId)
      : kind === "decline"
        ? await declineResponse(db, job, interestId, String(formData.get("note") ?? "") || null)
        : kind === "pick"
          ? await pickResponse(db, job, interestId)
          : await shareContactWith(db, job, interestId);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/pm-dashboard/rfps/${rfpId}/interests`);
  revalidatePath("/pm-dashboard/rfps");
  revalidatePath("/dashboard/interests");
  if (kind === "pick" && job.slug) revalidatePath(`/rfps/${job.slug}`);
  // A town's job is handled from its own dashboard (lib/town-jobs).
  if (job.source_type === "public_buyer_direct") {
    revalidatePath(`/buyer-dashboard/jobs/${rfpId}/responses`);
    revalidatePath(`/buyer-dashboard/jobs/${rfpId}`);
    revalidatePath("/buyer-dashboard/jobs");
  }
  return { done: kind };
}

export async function shortlistAction(_prev: BidActionState, formData: FormData): Promise<BidActionState> {
  return run("shortlist", formData);
}

export async function declineAction(_prev: BidActionState, formData: FormData): Promise<BidActionState> {
  return run("decline", formData);
}

export async function pickAction(_prev: BidActionState, formData: FormData): Promise<BidActionState> {
  return run("pick", formData);
}

export async function shareContactAction(_prev: BidActionState, formData: FormData): Promise<BidActionState> {
  return run("share", formData);
}
