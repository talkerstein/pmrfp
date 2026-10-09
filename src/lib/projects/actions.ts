"use server";

import { redirect } from "next/navigation";
import { getProjectSession } from "./server";
import { publishProject, requestReview, type PublishInput } from "./publish";
import { createShareLink, revokeShareLink, saveCaseStudy, setProjectVisibility } from "./manage";
import type { CaseStudyInput } from "./case-study";

// The rules live in ./publish and ./manage, shared with the JSON routes the
// mobile app calls. These wrappers only add the cookie session and the web's
// redirect.

const SIGN_IN = "Sign in to your company account first.";

export interface PublishState {
  error?: string;
}

/** Publish a captured project as a case study (see publishProject). */
export async function publishProjectAction(input: PublishInput): Promise<PublishState> {
  const session = await getProjectSession();
  if (!session) return { error: SIGN_IN };
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
  if (!session) return { error: SIGN_IN };
  const res = await requestReview(session, {
    caseStudyId: formData.get("caseStudyId"),
    clientName: formData.get("clientName"),
    clientEmail: formData.get("clientEmail"),
  });
  return res.ok ? { success: res.message } : { error: res.error };
}

// ── Case-study builder ───────────────────────────────────────────────

export interface SaveState {
  error?: string;
}

/** Save the builder (see saveCaseStudy), then back to the projects list. */
export async function saveCaseStudyAction(input: CaseStudyInput): Promise<SaveState> {
  const session = await getProjectSession();
  if (!session) return { error: SIGN_IN };
  const res = await saveCaseStudy(session, input);
  if (!res.ok) return { error: res.error };
  redirect(`/dashboard/projects?saved=${encodeURIComponent(res.slug)}&state=${res.status === "published" ? "live" : "review"}`);
}

// ── Visibility + share links (dashboard list) ────────────────────────

export interface ControlState {
  error?: string;
  ok?: boolean;
  /** New share link token, shown once so the trade can copy it. */
  token?: string;
}

export async function setVisibilityAction(_prev: ControlState, formData: FormData): Promise<ControlState> {
  const session = await getProjectSession();
  if (!session) return { error: SIGN_IN };
  const res = await setProjectVisibility(session, { id: formData.get("id"), visibility: formData.get("visibility") });
  return res.ok ? { ok: true } : { error: res.error };
}

export async function createShareLinkAction(_prev: ControlState, formData: FormData): Promise<ControlState> {
  const session = await getProjectSession();
  if (!session) return { error: SIGN_IN };
  const res = await createShareLink(session, { caseStudyId: formData.get("caseStudyId"), label: formData.get("label") });
  return res.ok ? { ok: true, token: res.token } : { error: res.error };
}

export async function revokeShareLinkAction(_prev: ControlState, formData: FormData): Promise<ControlState> {
  const session = await getProjectSession();
  if (!session) return { error: SIGN_IN };
  const res = await revokeShareLink(session, { id: formData.get("id") });
  return res.ok ? { ok: true } : { error: res.error };
}
