"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, isAdminRole, type SessionContext } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { getAccountGeo } from "@/lib/visitor-geo.server";
import { emailLang } from "@/lib/pm-jobs/email-copy";
import { pmContactCard } from "@/lib/pm-jobs/rules";
import {
  MAX_BIDS,
  cleanBidInput,
  cleanComparisonInput,
  cleanRecommendation,
  cleanScopeItems,
  readScopeItems,
  type BidCountry,
  type BidFieldError,
} from "./rules";
import {
  awardBid,
  checkBidderOrg,
  companyCountry,
  importRfpResponses,
  inviteBidders,
  isMissingTable,
  linkBidder,
  removeQuoteFiles,
  searchBidderOrgs,
  setShareLink,
  type InviteResult,
  type OrgHit,
} from "./server";

/**
 * The Bid Comparison Sheet's server actions. Every one checks the session
 * again (server actions are plain POST endpoints). What a PM types goes
 * through their own client, so RLS keeps each company to its own rows;
 * the server-only columns go through lib/bid-compare/server, which
 * re-checks the company. Errors come back as keys the page translates
 * (bidCompare.sheet.errors).
 */

const LIST = "/pm-dashboard/bid-comparisons";
const ROLES = ["property_manager", "real_estate_agent"];

export type BidErrorKey =
  | "signIn"
  | "noOrg"
  | "unavailable"
  | "notFound"
  | "title"
  | "rfp"
  | "max"
  | "awarded"
  | "invitesOff"
  | BidFieldError;

type Pm = { session: SessionContext; orgId: string; country: BidCountry };

async function pm(): Promise<Pm | { error: BidErrorKey }> {
  if (!isSupabaseConfigured()) return { error: "unavailable" };
  const session = await getSession();
  if (!session || !ROLES.includes(session.profile.primary_role)) return { error: "signIn" };
  if (!session.organization) return { error: "noOrg" };
  const geo = await getAccountGeo(session).catch(() => null);
  const country: BidCountry = geo?.country === "US" || geo?.country === "CA" ? geo.country : companyCountry(session.organization);
  return { session, orgId: session.organization.id, country };
}

const uuid = (v: unknown): v is string => typeof v === "string" && z.uuid().safeParse(v).success;

function touch(id?: string) {
  revalidatePath(LIST);
  if (id) {
    revalidatePath(`${LIST}/${id}`);
    revalidatePath(`/bid-sheet/${id}`);
  }
}

// ── Comparisons ──────────────────────────────────────────────────────

export interface CreateState {
  error?: BidErrorKey;
  id?: string;
}

/** New comparison (title, building, trade, optional own RFP). Redirect is the client's (it has the language). */
export async function createComparisonAction(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const raw = Object.fromEntries(formData.entries());
  const res = cleanComparisonInput(raw);
  if (!res.ok) return { error: res.field };
  const rfpId = uuid(raw.rfp_id) ? raw.rfp_id : null;
  const db = await createClient();
  const { data, error } = await db
    .from("bid_comparisons")
    .insert({ ...res.value, organization_id: who.orgId, created_by: who.session.userId, country: who.country, rfp_id: rfpId })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    if (error && !isMissingTable(error)) console.error("[bid-compare] create", error.message);
    // The insert policy refuses an RFP that isn't the PM's (or their company's).
    return { error: rfpId && error?.code === "42501" ? "rfp" : "unavailable" };
  }
  if (rfpId && formData.get("import") === "on") {
    await importRfpResponses(data.id, { userId: who.session.userId, organizationId: who.orgId, admin: isAdminRole(who.session.profile.primary_role) }).catch(() => undefined);
  }
  touch(data.id);
  return { id: data.id };
}

export interface SaveState {
  ok?: boolean;
  error?: BidErrorKey;
  savedAt?: number;
}

/** Edit the title, building, trade or linked RFP. */
export async function saveComparisonAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const raw = Object.fromEntries(formData.entries());
  if (!uuid(raw.id)) return { error: "notFound" };
  const res = cleanComparisonInput(raw);
  if (!res.ok) return { error: res.field };
  const db = await createClient();
  const { data, error } = await db
    .from("bid_comparisons")
    .update({ ...res.value, rfp_id: uuid(raw.rfp_id) ? raw.rfp_id : null })
    .eq("id", raw.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.code === "42501" ? "rfp" : isMissingTable(error) ? "unavailable" : "notFound" };
  if (!data) return { error: "notFound" };
  touch(raw.id);
  return { ok: true, savedAt: Date.now() };
}

export async function deleteComparisonAction(id: string): Promise<{ ok?: boolean; error?: BidErrorKey }> {
  if (!uuid(id)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const { data: files } = await db.from("bid_comparison_bids").select("file_path").eq("comparison_id", id);
  const { data, error } = await db.from("bid_comparisons").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) return { error: "notFound" };
  if (isServiceConfigured()) {
    await removeQuoteFiles(createServiceClient(), ((files ?? []) as { file_path: string | null }[]).map((f) => f.file_path)).catch(() => undefined);
  }
  revalidatePath(LIST);
  return { ok: true };
}

/** Save the scope items (ids kept, so bids keep their line prices when a label changes). */
export async function saveScopeItemsAction(id: string, rows: { id?: string; label?: string }[]): Promise<{ ok?: boolean; error?: BidErrorKey }> {
  if (!uuid(id) || !Array.isArray(rows)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const items = cleanScopeItems(rows.slice(0, 60));
  const db = await createClient();
  const { data, error } = await db.from("bid_comparisons").update({ scope_items: items }).eq("id", id).select("id").maybeSingle();
  if (error || !data) return { error: error && isMissingTable(error) ? "unavailable" : "notFound" };
  touch(id);
  return { ok: true };
}

/** The PM's pick and why (shown on the board sheet). */
export async function saveRecommendationAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const id = formData.get("id");
  if (!uuid(id)) return { error: "notFound" };
  const pick = formData.get("recommended_bid_id");
  const db = await createClient();
  let recommended: string | null = null;
  if (uuid(pick)) {
    const { data: bid } = await db.from("bid_comparison_bids").select("id").eq("id", pick).eq("comparison_id", id).maybeSingle();
    if (!bid) return { error: "notFound" };
    recommended = pick;
  }
  const { data, error } = await db
    .from("bid_comparisons")
    .update({ recommended_bid_id: recommended, recommendation: cleanRecommendation(formData.get("recommendation")) })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: error && isMissingTable(error) ? "unavailable" : "notFound" };
  touch(id);
  return { ok: true, savedAt: Date.now() };
}

// ── Bids ─────────────────────────────────────────────────────────────

/** Add a bid (no bid id) or edit one (bid id). Line items come in as line_<scope item id>. */
export async function saveBidAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const raw = Object.fromEntries(formData.entries());
  const comparisonId = raw.comparison_id;
  if (!uuid(comparisonId)) return { error: "notFound" };
  const db = await createClient();
  const { data: cmp } = await db.from("bid_comparisons").select("id,organization_id,scope_items,country").eq("id", comparisonId).maybeSingle<{
    id: string;
    organization_id: string;
    scope_items: unknown;
    country: BidCountry;
  }>();
  if (!cmp) return { error: "notFound" };
  const res = cleanBidInput(raw, readScopeItems(cmp.scope_items));
  if (!res.ok) return { error: res.field };

  // A PMRFP company picked in the form: only an approved one in the comparison's country.
  const pickedOrg = uuid(raw.bidder_organization_id) ? raw.bidder_organization_id : null;
  const orgOk = pickedOrg ? await checkBidderOrg(db, pickedOrg, cmp.country) : false;

  const bidId = uuid(raw.id) ? raw.id : null;
  if (bidId) {
    const { data: before } = await db
      .from("bid_comparison_bids")
      .select("id,organization_id,contact_email,bidder_organization_id,rfp_interest_id")
      .eq("id", bidId)
      .eq("comparison_id", cmp.id)
      .maybeSingle<{ id: string; organization_id: string; contact_email: string | null; bidder_organization_id: string | null; rfp_interest_id: string | null }>();
    if (!before) return { error: "notFound" };
    const { data, error } = await db.from("bid_comparison_bids").update(res.value).eq("id", bidId).select("id").maybeSingle();
    if (error) return { error: isMissingTable(error) ? "unavailable" : "notFound" };
    if (!data) return { error: "notFound" };
    const nextOrg = orgOk ? pickedOrg : raw.unlink === "1" ? null : before.bidder_organization_id;
    if (nextOrg !== before.bidder_organization_id || (!nextOrg && before.contact_email !== res.value.contact_email)) {
      await linkBidder(before, { orgId: nextOrg, email: nextOrg ? null : res.value.contact_email });
    }
  } else {
    const { data: existing } = await db.from("bid_comparison_bids").select("position").eq("comparison_id", cmp.id);
    const have = (existing ?? []) as { position: number }[];
    if (have.length >= MAX_BIDS) return { error: "max" };
    const position = Math.min(99, have.reduce((m, b) => Math.max(m, b.position + 1), 0));
    const { data, error } = await db
      .from("bid_comparison_bids")
      .insert({ ...res.value, comparison_id: cmp.id, organization_id: cmp.organization_id, created_by: who.session.userId, position })
      .select("id,organization_id,rfp_interest_id")
      .single<{ id: string; organization_id: string; rfp_interest_id: string | null }>();
    if (error || !data) {
      if (error && /at most 6 bids/i.test(error.message)) return { error: "max" };
      if (error && !isMissingTable(error)) console.error("[bid-compare] insert bid", error.message);
      return { error: "unavailable" };
    }
    if (orgOk || res.value.contact_email) await linkBidder(data, { orgId: orgOk ? pickedOrg : null, email: orgOk ? null : res.value.contact_email });
  }
  touch(cmp.id);
  return { ok: true, savedAt: Date.now() };
}

export async function deleteBidAction(comparisonId: string, bidId: string): Promise<{ ok?: boolean; error?: BidErrorKey }> {
  if (!uuid(comparisonId) || !uuid(bidId)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const { data, error } = await db.from("bid_comparison_bids").delete().eq("id", bidId).eq("comparison_id", comparisonId).select("file_path").maybeSingle<{ file_path: string | null }>();
  if (error || !data) return { error: "notFound" };
  if (data.file_path && isServiceConfigured()) await removeQuoteFiles(createServiceClient(), [data.file_path]).catch(() => undefined);
  touch(comparisonId);
  return { ok: true };
}

/** Approved PMRFP bidder companies by name, in the PM's country. */
export async function searchBidderOrgsAction(q: string): Promise<{ hits: OrgHit[] }> {
  if (typeof q !== "string") return { hits: [] };
  const who = await pm();
  if ("error" in who) return { hits: [] };
  return { hits: await searchBidderOrgs(await createClient(), q, who.country).catch(() => []) };
}

/** Pull in the trades that responded to the linked RFP. */
export async function importResponsesAction(comparisonId: string): Promise<{ added?: number; full?: boolean; error?: BidErrorKey }> {
  if (!uuid(comparisonId)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const res = await importRfpResponses(comparisonId, { userId: who.session.userId, organizationId: who.orgId, admin: isAdminRole(who.session.profile.primary_role) });
  if (!res.ok) return { error: res.error };
  touch(comparisonId);
  return { added: res.added, full: res.full };
}

// ── Share, award, invite ─────────────────────────────────────────────

/** Create or replace (on) or turn off (off) the read-only board link. The raw token comes back once. */
export async function shareLinkAction(comparisonId: string, on: boolean): Promise<{ token?: string | null; error?: BidErrorKey }> {
  if (!uuid(comparisonId)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const res = await setShareLink(comparisonId, who.orgId, Boolean(on));
  if (!res.ok) return { error: res.error };
  touch(comparisonId);
  return { token: res.token };
}

export interface AwardActionResult {
  ok?: boolean;
  rfpRecorded?: boolean;
  rfpClosed?: boolean;
  notified?: boolean;
  error?: BidErrorKey;
}

/** "Award to this bidder" (through the RFP's own pick flow when the bid came from it). */
export async function awardBidAction(comparisonId: string, bidId: string, notify: boolean, lang: string): Promise<AwardActionResult> {
  if (!uuid(comparisonId) || !uuid(bidId)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const org = who.session.organization!;
  const res = await awardBid(
    { comparisonId, bidId, notify: Boolean(notify) },
    {
      userId: who.session.userId,
      organizationId: who.orgId,
      admin: isAdminRole(who.session.profile.primary_role),
      company: org.name,
      lang: emailLang(lang),
      contact: pmContactCard({ rfp: {}, poster: who.session.profile, posterOrg: org }),
    },
  );
  if (!res.ok) return { error: res.error };
  touch(comparisonId);
  if (res.rfpRecorded) {
    revalidatePath("/pm-dashboard/rfps");
    revalidatePath("/dashboard/interests");
  }
  return { ok: true, rfpRecorded: res.rfpRecorded, rfpClosed: res.rfpClosed, notified: res.notified };
}

/** "Invite these bidders to PMRFP". */
export async function inviteBiddersAction(comparisonId: string, lang: string): Promise<{ result?: Extract<InviteResult, { ok: true }>; error?: BidErrorKey }> {
  if (!uuid(comparisonId)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const res = await inviteBidders({ comparisonId, orgId: who.orgId, company: who.session.organization!.name, lang: emailLang(lang) });
  if (!res.ok) return { error: res.error };
  touch(comparisonId);
  return { result: res };
}
