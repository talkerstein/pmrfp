"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/access/access";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { endorseVpsTalent, saveVpsTalent } from "@/lib/d1/vps-talent";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { upsertGhlContact } from "@/lib/ghl/client";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localMessage } from "@/lib/jobs/rules";
import { TALENT_MESSAGES, endorsementSchema, normalizeTalentHandle, parseTickets, tagSlug, talentProfileSchema } from "./rules";

export interface TalentFormState {
  error?: string;
}

/**
 * The language of the form that called (a hidden "lang" input, or a field,
 * from useLang()). Missing or unknown: English, exactly as before.
 */
function langOf(v: unknown): Locale {
  return isEnabledLocale(v) ? v : DEFAULT_LOCALE;
}

/** The messages returned to the form, in its language (English is TALENT_MESSAGES). */
function messages(lang: Locale) {
  return getDictionary(lang).jobsClient.errors.talent;
}

/** Create or update the signed-in person's talent profile. */
export async function saveTalentProfileAction(_prev: TalentFormState, formData: FormData): Promise<TalentFormState> {
  const lang = langOf(formData.get("lang"));
  const m = messages(lang);
  const native = isVpsLiveCustomerAuth();
  if (!native && !isSupabaseConfigured()) return { error: m.unavailable };
  const session = await getSession();
  if (!session) redirect(localizePath(`/sign-in?next=${encodeURIComponent("/talent/edit")}`, lang));

  const parsed = talentProfileSchema.safeParse({
    handle: formData.get("handle") ?? "",
    displayName: formData.get("displayName") ?? "",
    headline: formData.get("headline") ?? "",
    primaryTrade: formData.get("primaryTrade") ?? "",
    otherTrades: formData.getAll("otherTrades").map(String),
    region: formData.get("region") ?? "",
    city: formData.get("city") ?? "",
    yearsExperience: formData.get("yearsExperience")?.toString().trim() || undefined,
    tickets: [...formData.getAll("ticketPick").map(String), formData.get("tickets")?.toString() ?? ""].join(","),
    availability: formData.get("availability") ?? "",
    employmentTypes: formData.getAll("employmentTypes").map(String),
    payExpectation: formData.get("payExpectation") ?? "",
    bio: formData.get("bio") ?? "",
    phone: formData.get("phone") ?? "",
    published: formData.get("published") === "on",
    contactVisible: formData.get("contactVisible") === "on",
  });
  if (!parsed.success) return { error: localMessage(parsed.error.issues[0]?.message, lang, TALENT_MESSAGES, m, m.checkForm) };
  const d = parsed.data;
  const handle = normalizeTalentHandle(d.handle);
  if (!handle) return { error: m.badHandle };

  if (native) {
    const saved = await saveVpsTalent(session.userId, handle, d).catch(() => "couldNotSave" as const);
    if (saved !== "saved") return { error: m[saved] };
  } else {
    const supabase = await createClient();
    const slugs = [d.primaryTrade, ...d.otherTrades.filter((t) => t !== d.primaryTrade)];
    const [{ data: cats }, { data: reg }] = await Promise.all([
      supabase.from("trade_categories").select("id,slug").in("slug", slugs),
      supabase.from("regions").select("id").eq("slug", d.region).maybeSingle<{ id: string }>(),
    ]);
    const catBySlug = new Map(((cats as { id: string; slug: string }[] | null) ?? []).map((c) => [c.slug, c.id]));
    const primary = catBySlug.get(d.primaryTrade);
    if (!primary) return { error: m.pickTrade };
    if (!reg) return { error: m.pickRegion };

    const { error } = await supabase.from("talent_profiles").upsert(
      {
        user_id: session.userId,
        handle,
        display_name: d.displayName,
        headline: d.headline || null,
        primary_trade_id: primary,
        other_trade_ids: d.otherTrades.map((s) => catBySlug.get(s)).filter((id): id is string => Boolean(id) && id !== primary),
        region_id: reg.id,
        city: d.city || null,
        years_experience: d.yearsExperience ?? null,
        certifications: parseTickets(d.tickets),
        availability: d.availability,
        employment_types: d.employmentTypes,
        pay_expectation: d.payExpectation || null,
        bio: d.bio || null,
        published: d.published,
        contact_visible: d.contactVisible,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      if (error.code === "23505") return { error: m.handleTaken };
      if (/talent_profiles/.test(error.message) && /does not exist|schema cache/.test(error.message)) {
        return { error: m.switchingOn };
      }
      return { error: m.couldNotSave };
    }
    await supabase.from("talent_private").upsert({ user_id: session.userId, phone: d.phone || null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (!session.profile.onboarding_completed) {
      await supabase.from("users_profile").update({ onboarding_completed: true }).eq("id", session.userId);
    }
  }

  const [firstName, ...rest] = d.displayName.split(/\s+/);
  await Promise.allSettled([
    upsertGhlContact({
      email: session.profile.email,
      firstName,
      lastName: rest.join(" ") || undefined,
      phone: d.phone || undefined,
      tags: ["pmrfp-talent", `pmrfp-talent-${tagSlug(d.availability)}`, `pmrfp-trade-${tagSlug(d.primaryTrade)}`],
      customFields: { pmrfp_role: "talent", pmrfp_category: d.primaryTrade, pmrfp_city: d.city },
    }),
  ]);

  revalidatePath("/talent");
  revalidatePath(`/talent/${handle}`);
  redirect(localizePath(`/talent/${handle}?saved=1`, lang));
}

/**
 * An approved company vouches for someone it has worked with. The proof we
 * can check: they applied to one of the company's jobs, or the company
 * contacted them through PMRFP. One endorsement per company per person.
 */
export async function endorseTalentAction(input: { handle: string; note: string; lang?: string }): Promise<{ error?: string }> {
  const lang = langOf(input.lang);
  const m = messages(lang);
  const parsed = endorsementSchema.safeParse(input);
  if (!parsed.success) return { error: localMessage(parsed.error.issues[0]?.message, lang, TALENT_MESSAGES, m, m.checkNote) };
  const session = await getSession();
  if (!session) return { error: m.signInToEndorse };
  const org = session.organization;
  if (!org || org.profile_status !== "approved" || org.status !== "active") {
    return { error: m.onlyApproved };
  }
  if (isVpsLiveCustomerAuth()) {
    const result = await endorseVpsTalent({ userId: session.userId, orgId: org.id }, parsed.data).catch(() => "couldNotEndorse" as const);
    if (result !== "saved") return { error: m[result] };
    revalidatePath(`/talent/${parsed.data.handle}`);
    return {};
  }
  if (!isServiceConfigured()) return { error: m.unavailable };
  const admin = createServiceClient();
  const { data: t } = await admin
    .from("talent_profiles")
    .select("user_id,published")
    .eq("handle", parsed.data.handle)
    .maybeSingle<{ user_id: string; published: boolean }>();
  if (!t || !t.published) return { error: m.profileUnavailable };
  if (t.user_id === session.userId) return { error: m.selfEndorse };

  const { data: person } = await admin.from("users_profile").select("email").eq("id", t.user_id).maybeSingle<{ email: string | null }>();
  const [{ count: contacted }, { data: jobs }] = await Promise.all([
    admin.from("talent_contacts").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("talent_user_id", t.user_id),
    admin.from("job_posts").select("id").eq("organization_id", org.id).limit(500),
  ]);
  let applied = 0;
  const jobIds = ((jobs as { id: string }[] | null) ?? []).map((j) => j.id);
  if (person?.email && jobIds.length) {
    const { count } = await admin
      .from("job_applications")
      .select("id", { count: "exact", head: true })
      .in("job_id", jobIds)
      .ilike("email", person.email.replace(/[\\%_]/g, (m) => `\\${m}`));
    applied = count ?? 0;
  }
  if (!contacted && !applied) {
    return { error: m.endorseProof };
  }

  const { error } = await admin.from("talent_endorsements").upsert(
    { talent_user_id: t.user_id, organization_id: org.id, endorsed_by: session.userId, note: parsed.data.note },
    { onConflict: "talent_user_id,organization_id" },
  );
  if (error) return { error: m.couldNotEndorse };
  revalidatePath(`/talent/${parsed.data.handle}`);
  return {};
}
