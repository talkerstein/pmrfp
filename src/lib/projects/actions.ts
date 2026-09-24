"use server";

import { redirect } from "next/navigation";
import { getProjectSession } from "./server";
import { publishProject, requestReview, type PublishInput } from "./publish";

// The rules live in ./publish, shared with the JSON routes the mobile app
// calls. These wrappers only add the cookie session and the web's redirect.

export interface PublishState {
  error?: string;
}

/** Publish a captured project as a case study (see publishProject). */
export async function publishProjectAction(input: PublishInput): Promise<PublishState> {
  const session = await getProjectSession();
  if (!session) return { error: "Sign in to your company account first." };
  const res = await publishProject(session, input);
  if (!res.ok) return { error: res.error };
  redirect(`/dashboard/projects?${res.live ? `published=${encodeURIComponent(res.slug)}` : "submitted=1"}`);
}

// ── Review requests ──────────────────────────────────────────────────

export interface InviteState {
  error?: string;
  success?: string;
}

/** Trade Pro: email a client a one-time review link (see requestReview). */
export async function requestReviewAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const session = await getProjectSession();
  if (!session) return { error: "Sign in to your company account first." };
  const res = await requestReview(session, {
    caseStudyId: formData.get("caseStudyId"),
    clientName: formData.get("clientName"),
    clientEmail: formData.get("clientEmail"),
  });
  return res.ok ? { success: res.message } : { error: res.error };
}
