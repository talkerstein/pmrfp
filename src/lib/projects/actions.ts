"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { sendReviewRequest } from "@/lib/email/send";
import { countActiveProjects, getProjectSession } from "./server";
import { publishLimitError } from "./limits";
import { anyPrivacyFlag, privacySchema } from "./draft";
import { isOwnPhotoUrl, pickHero, projectPhotoSchema } from "./photos";
import { projectSlug } from "./slug";
import { generateReviewToken, hashReviewToken } from "./tokens";
import { isOwnEmail } from "./reviews";

const SITE_BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

// Lighter floors than the long form (80 chars): the capture flow is phone-
// first and usually AI-drafted, but a one-word "Fixed it." still isn't a
// case study.
const publishSchema = z.object({
  title: z.string().trim().min(10, "Give the project a clear title (10+ characters).").max(140),
  summary: z.string().trim().max(400).default(""),
  challenge: z.string().trim().min(40, "Say a bit more about the challenge (a sentence or two).").max(3000),
  approach: z.string().trim().min(40, "Say a bit more about what you did (a sentence or two).").max(3000),
  outcome: z.string().trim().min(40, "Say a bit more about the result (a sentence or two).").max(3000),
  categorySlug: z.string().max(80).default(""),
  propertyTypeSlug: z.string().max(80).default(""),
  regionSlug: z.string().max(80).default(""),
  city: z.string().trim().max(80).default(""),
  photos: z.array(projectPhotoSchema).min(1, "Add at least one photo.").max(50),
  privacy: privacySchema,
  photosChecked: z.boolean(),
  clientApproved: z.boolean(),
});

export type PublishInput = z.input<typeof publishSchema>;
export interface PublishState {
  error?: string;
}

/**
 * Publish a captured project as a case study. Membership is proven by the
 * session; the insert then uses the service role because RLS stops members
 * from setting status 'published' (Trade Pro with an approved profile
 * skips moderation; everyone else goes to the review queue).
 */
export async function publishProjectAction(input: PublishInput): Promise<PublishState> {
  const session = await getProjectSession();
  if (!session) return { error: "Sign in to your company account first." };
  if (!isServiceConfigured()) return { error: "Publishing isn't set up here yet." };

  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  const org = session.organization;
  const paid = session.hasTradeAccess;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (d.photos.some((p) => !isOwnPhotoUrl(p.url, supabaseUrl, org.id) || !p.url.endsWith(`/${p.path}`))) {
    return { error: "One of those photos isn't from this project. Remove it and try again." };
  }
  if (anyPrivacyFlag(d.privacy) && !d.photosChecked) {
    return { error: "Tick \"I've checked the photos\" to publish." };
  }
  const limit = publishLimitError({
    paid,
    existingProjects: await countActiveProjects(org.id),
    photoCount: d.photos.length,
  });
  if (limit) return { error: limit };

  const db = createServiceClient();
  const [cat, region, propertyType] = await Promise.all([
    d.categorySlug
      ? db.from("trade_categories").select("id").eq("slug", d.categorySlug).maybeSingle()
      : Promise.resolve({ data: null }),
    d.regionSlug
      ? db.from("regions").select("id,province").eq("slug", d.regionSlug).maybeSingle()
      : Promise.resolve({ data: null }),
    d.propertyTypeSlug
      ? db.from("property_types").select("name").eq("slug", d.propertyTypeSlug).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Straight to live only for Trade Pro companies whose profile we've
  // approved; everything else goes through the same review queue as the
  // long form.
  const live = paid && org.profile_status === "approved";
  const status = live ? "published" : "pending_review";
  const row = {
    organization_id: org.id,
    submitted_by_user_id: session.userId,
    title: d.title,
    summary: d.summary || null,
    category_id: (cat.data as { id: string } | null)?.id ?? null,
    region_id: (region.data as { id: string } | null)?.id ?? null,
    province: (region.data as { province: string | null } | null)?.province ?? null,
    property_type: (propertyType.data as { name: string } | null)?.name ?? null,
    city: d.city || null,
    challenge: d.challenge,
    approach: d.approach,
    outcome: d.outcome,
    photos: d.photos,
    hero_url: pickHero(d.photos)?.url ?? null,
    source: "capture",
    client_approved: d.clientApproved,
    status,
    published_at: live ? new Date().toISOString() : null,
  };

  let slug = "";
  let saved = false;
  for (let attempt = 0; attempt < 3 && !saved; attempt++) {
    slug = projectSlug(d.title);
    const { error } = await db.from("case_studies").insert({ ...row, slug });
    if (!error) saved = true;
    else if (error.code !== "23505") {
      console.error("[projects/publish]", error.message);
      // 42703 = undefined column: the Projects migration isn't applied yet.
      return {
        error:
          error.code === "42703"
            ? "Projects aren't switched on yet. Try again soon."
            : "Couldn't save the project. Try again in a minute.",
      };
    }
  }
  if (!saved) return { error: "Couldn't save the project. Try again in a minute." };

  revalidatePath("/dashboard/projects");
  if (live) {
    revalidatePath("/case-studies");
    revalidatePath(`/case-studies/${slug}`);
    revalidatePath(`/directory/${org.slug}`);
  }
  redirect(`/dashboard/projects?${live ? `published=${encodeURIComponent(slug)}` : "submitted=1"}`);
}

// ── Review requests ──────────────────────────────────────────────────

/** How many review links one project can send. Stops a list blast. */
const MAX_INVITES_PER_PROJECT = 10;

const inviteSchema = z.object({
  caseStudyId: z.string().uuid(),
  clientName: z.string().trim().min(2, "Add your client's name.").max(100),
  clientEmail: z.string().trim().toLowerCase().email("Enter a valid email.").max(200),
});

export interface InviteState {
  error?: string;
  success?: string;
}

/**
 * Trade Pro: email a client a one-time link to review one published
 * project. Every review lands in moderation; there's no rating filter.
 */
export async function requestReviewAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const session = await getProjectSession();
  if (!session) return { error: "Sign in to your company account first." };
  if (!session.hasTradeAccess) return { error: "Review requests are part of Trade Pro." };
  if (!isServiceConfigured()) return { error: "Review requests aren't set up here yet." };
  // Keyed by user, not IP: this caps one account's sending, wherever it is.
  if (await checkRateLimitByIp(`user:${session.userId}`, "contact")) {
    return { error: "That's a lot of requests at once. Wait a minute and try again." };
  }

  const parsed = inviteSchema.safeParse({
    caseStudyId: formData.get("caseStudyId"),
    clientName: formData.get("clientName"),
    clientEmail: formData.get("clientEmail"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  const org = session.organization;

  if (isOwnEmail(d.clientEmail, [session.profile.email, org.email])) {
    return { error: "Send this to your client, not to your own address." };
  }

  const db = createServiceClient();
  const { data: cs } = await db
    .from("case_studies")
    .select("id,title")
    .eq("id", d.caseStudyId)
    .eq("organization_id", org.id)
    .eq("status", "published")
    .maybeSingle();
  const project = cs as { id: string; title: string } | null;
  if (!project) return { error: "You can ask for reviews once the project is published." };

  const { data: existing, error: existingErr } = await db
    .from("review_invites")
    .select("client_email,used_at")
    .eq("case_study_id", project.id);
  if (existingErr) {
    console.error("[projects/invite]", existingErr.message);
    return { error: "Review requests aren't switched on yet. Try again soon." };
  }
  const invites = (existing ?? []) as { client_email: string; used_at: string | null }[];
  if (invites.some((i) => i.client_email.toLowerCase() === d.clientEmail)) {
    return { error: `You've already asked ${d.clientEmail} about this project.` };
  }
  if (invites.length >= MAX_INVITES_PER_PROJECT) {
    return { error: `You've sent ${MAX_INVITES_PER_PROJECT} requests for this project. That's the limit.` };
  }

  const token = generateReviewToken();
  const { error } = await db.from("review_invites").insert({
    token_hash: hashReviewToken(token),
    case_study_id: project.id,
    organization_id: org.id,
    client_name: d.clientName,
    client_email: d.clientEmail,
    created_by_user_id: session.userId,
  });
  if (error) {
    console.error("[projects/invite]", error.message);
    return { error: "Couldn't create the request. Try again in a minute." };
  }

  await sendReviewRequest(d.clientEmail, {
    clientName: d.clientName,
    tradeName: org.name,
    projectTitle: project.title,
    url: `${SITE_BASE}/review/${token}`,
  });

  revalidatePath("/dashboard/projects");
  return { success: `Sent to ${d.clientEmail}. You'll see it here once they reply.` };
}
