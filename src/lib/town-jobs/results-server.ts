import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { awardHistoryRow, cleanRationale, planAward, resultsReady, summarize, type AwardError, type ResultsSummary, type SummaryResponse } from "./results";
import { isClosed, isOpened, townClosesAt, type SealedState } from "./sealed";
import { sealedStateFor } from "./sealed-server";
import { logTownEvent, type TownJob } from "./server";
import { todayToronto } from "./rules";

/**
 * Results, the council summary and the award, server side (service role;
 * server only). Callers check the town (or admin) first. Responses only
 * exist once a sealed box is opened (the database guarantees it), so these
 * reads can't show a sealed quote early. Tested in
 * test/unit/towns-part-c.test.ts and test/db/towns-part-c.test.ts.
 */

type Db = SupabaseClient;

const BASE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

export interface TownResultsRow {
  rfp_id: string;
  recommended_interest_id: string | null;
  rationale: string | null;
  recommended_by: string | null;
  recommended_at: string | null;
  award_interest_id: string | null;
  award_winner_name: string | null;
  award_amount: number | null;
  award_amount_public: boolean;
  award_date: string | null;
  award_published_at: string | null;
}

export interface TownResults {
  ready: boolean;
  closesAt: string | null;
  closed: boolean;
  sealed: SealedState | null;
  summary: ResultsSummary | null;
  /** The picked response (PM job flow), when the town has picked one. */
  picked: SummaryResponse | null;
  saved: TownResultsRow | null;
  recommendedByName: string | null;
}

interface InterestRow {
  id: string;
  status: string;
  trade_organization_id: string;
  quote_amount: number | string | null;
  quote_kind: "estimate" | "firm" | null;
  quote_notes: string | null;
  start_date: string | null;
  message: string | null;
  created_at: string;
}

interface OrgRow {
  id: string;
  name: string;
  profile_status: string | null;
  verified: boolean | null;
  insurance_status: string | null;
  wsib_status: string | null;
}

/** Every response with its company (for the table), lowest price first. */
export async function responsesFor(db: Db, rfpId: string): Promise<SummaryResponse[]> {
  const { data } = await db
    .from("rfp_interests")
    .select("id,status,trade_organization_id,quote_amount,quote_kind,quote_notes,start_date,message,created_at")
    .eq("rfp_id", rfpId)
    .limit(500);
  const rows = (data ?? []) as InterestRow[];
  if (!rows.length) return [];
  const { data: orgs } = await db.from("organizations").select("id,name,profile_status,verified,insurance_status,wsib_status").in("id", [...new Set(rows.map((r) => r.trade_organization_id))]);
  const byId = new Map(((orgs ?? []) as OrgRow[]).map((o) => [o.id, o]));
  return rows.map((r) => {
    const o = byId.get(r.trade_organization_id);
    return {
      id: r.id,
      status: r.status,
      orgId: r.trade_organization_id,
      company: o?.name ?? "—",
      amount: r.quote_amount == null ? null : Number(r.quote_amount),
      kind: r.quote_kind,
      startDate: r.start_date,
      notes: r.quote_notes,
      message: r.message,
      createdAt: r.created_at,
      profileStatus: o?.profile_status ?? null,
      verified: Boolean(o?.verified),
      insurance: o?.insurance_status?.trim() || null,
      wsib: o?.wsib_status?.trim() || null,
    };
  });
}

async function invitesOf(db: Db, rfpId: string): Promise<{ sent: number; invitedOrgIds: Set<string> }> {
  const { data } = await db.from("town_invites").select("trade_organization_id,status").eq("rfp_id", rfpId);
  const rows = ((data ?? []) as { trade_organization_id: string | null; status: string }[]).filter((r) => r.status === "sent");
  return { sent: rows.length, invitedOrgIds: new Set(rows.map((r) => r.trade_organization_id).filter((x): x is string => Boolean(x))) };
}

export async function savedResults(db: Db, rfpId: string): Promise<TownResultsRow | null> {
  const { data, error } = await db.from("town_job_results").select("*").eq("rfp_id", rfpId).maybeSingle();
  if (error || !data) return null;
  const r = data as TownResultsRow;
  return { ...r, award_amount: r.award_amount == null ? null : Number(r.award_amount) };
}

/** Everything the results card and the council summary show. */
export async function loadResults(db: Db, job: TownJob, actorId: string, known?: SealedState | null): Promise<TownResults> {
  const sealed = job.sealed ? (known !== undefined ? known : await sealedStateFor(db, job.id, actorId)) : null;
  const closesAt = sealed?.closes_at ?? townClosesAt(job.deadline, job.buyer_key);
  const closed = sealed ? sealed.closed : isClosed(closesAt);
  const ready = resultsReady({ sealed: Boolean(job.sealed), opened: isOpened(sealed), closed, status: job.status });
  if (!ready) return { ready, closesAt, closed, sealed, summary: null, picked: null, saved: null, recommendedByName: null };
  const [responses, invites, saved] = await Promise.all([responsesFor(db, job.id), invitesOf(db, job.id), savedResults(db, job.id)]);
  const summary = summarize(responses, invites);
  let recommendedByName: string | null = null;
  if (saved?.recommended_by) {
    const { data } = await db.from("users_profile").select("full_name,email").eq("id", saved.recommended_by).maybeSingle();
    const u = data as { full_name: string | null; email: string | null } | null;
    recommendedByName = u?.full_name?.trim() || u?.email || null;
  }
  return { ready, closesAt, closed, sealed, summary, picked: responses.find((r) => r.status === "picked") ?? null, saved, recommendedByName };
}

export type RecommendError = "not_ready" | "invalid" | "rationale" | "failed";

/** The town's recommendation and its reason (changeable until the award is published). */
export async function saveRecommendation(db: Db, p: { job: TownJob; actorId: string; interestId: unknown; rationale: unknown }): Promise<{ ok: true } | { ok: false; error: RecommendError }> {
  const res = await loadResults(db, p.job, p.actorId);
  if (!res.ready || !res.summary) return { ok: false, error: "not_ready" };
  const id = typeof p.interestId === "string" ? p.interestId : "";
  const choice = res.summary.rows.find((r) => r.id === id);
  if (!choice || choice.status === "declined") return { ok: false, error: "invalid" };
  const rationale = cleanRationale(p.rationale);
  if (!rationale) return { ok: false, error: "rationale" };
  const { error } = await db.from("town_job_results").upsert(
    { rfp_id: p.job.id, organization_id: p.job.posted_by_organization_id, recommended_interest_id: choice.id, rationale, recommended_by: p.actorId, recommended_at: new Date().toISOString() },
    { onConflict: "rfp_id" },
  );
  if (error) return { ok: false, error: "failed" };
  await logTownEvent(db, { rfpId: p.job.id, organizationId: p.job.posted_by_organization_id, buyerKey: p.job.buyer_key, actorUserId: p.actorId, event: "recommendation_saved", detail: { response: choice.id } });
  return { ok: true };
}

export type PublishError = Exclude<AwardError, null> | "not_picked" | "history" | "failed";

/**
 * "Publish award": after the town picked the winner (the PM job flow's pick).
 * Saves the award (the listing shows "Awarded to X"; the amount only when
 * the town chose to publish it) and writes it to award history, the same
 * shape the public award imports use. Re-publishing corrects it.
 */
export async function publishAward(db: Db, p: { job: TownJob; actorId: string; input: { winnerName: unknown; amount: unknown; amountPublic: unknown; awardDate: unknown } }): Promise<{ ok: true; history: boolean } | { ok: false; error: PublishError }> {
  const res = await loadResults(db, p.job, p.actorId);
  if (!res.ready || !res.summary || !res.picked) return { ok: false, error: "not_picked" };
  const planned = planAward(p.input, todayToronto());
  if (!planned.ok) return { ok: false, error: planned.error };
  const a = planned.award;
  const now = new Date().toISOString();
  const { error } = await db.from("town_job_results").upsert(
    {
      rfp_id: p.job.id,
      organization_id: p.job.posted_by_organization_id,
      award_interest_id: res.picked.id,
      award_winner_name: a.winnerName,
      award_amount: a.amount,
      award_amount_public: a.amountPublic,
      award_date: a.awardDate,
      award_published_at: now,
      award_published_by: p.actorId,
    },
    { onConflict: "rfp_id" },
  );
  if (error) return { ok: false, error: "failed" };

  // Award history ("who won, what it paid"), in the importers' shape.
  const [{ data: post }, { data: cats }] = await Promise.all([
    db.from("rfp_posts").select("province,city").eq("id", p.job.id).maybeSingle(),
    db.from("rfp_categories").select("trade_categories(slug)").eq("rfp_id", p.job.id),
  ]);
  const place = post as { province: string | null; city: string | null } | null;
  const tradeSlugs = ((cats ?? []) as { trade_categories: { slug: string } | { slug: string }[] | null }[])
    .flatMap((c) => (Array.isArray(c.trade_categories) ? c.trade_categories : c.trade_categories ? [c.trade_categories] : []))
    .map((t) => t.slug);
  const row = awardHistoryRow({
    rfpId: p.job.id,
    slug: p.job.slug,
    title: p.job.title,
    buyerName: p.job.buyer_name,
    province: place?.province ?? null,
    city: place?.city ?? null,
    winnerName: a.winnerName,
    amount: a.amount,
    amountPublic: a.amountPublic,
    awardDate: a.awardDate,
    startDate: res.picked.startDate,
    quotes: res.summary.received,
    tradeSlugs,
    today: todayToronto(),
    base: BASE(),
  });
  let history = false;
  if (row) {
    const { error: hErr } = await db.from("award_history").upsert({ ...row, updated_at: now }, { onConflict: "source,source_key" });
    if (hErr) console.error("[town-results] award history failed", hErr.message);
    else history = true;
  }
  await db.from("rfp_posts").update({ status: "awarded", closed_at: now }).eq("id", p.job.id).in("status", ["published", "closed", "expired"]);
  await logTownEvent(db, {
    rfpId: p.job.id,
    organizationId: p.job.posted_by_organization_id,
    buyerKey: p.job.buyer_key,
    actorUserId: p.actorId,
    event: "award_published",
    detail: { winner: a.winnerName, amount_public: a.amountPublic, has_amount: a.amount != null, history },
  });
  return { ok: true, history };
}

/** The town's name and logo for the council summary (its managed page). */
export async function townBrand(db: Db, organizationId: string | null): Promise<{ name: string | null; logoUrl: string | null }> {
  if (!organizationId) return { name: null, logoUrl: null };
  const { data } = await db.from("buyer_pages").select("buyer_name,logo_url").eq("organization_id", organizationId).maybeSingle();
  const p = data as { buyer_name: string; logo_url: string | null } | null;
  if (p) return { name: p.buyer_name, logoUrl: p.logo_url };
  const { data: org } = await db.from("organizations").select("name,logo_url").eq("id", organizationId).maybeSingle();
  const o = org as { name: string; logo_url: string | null } | null;
  return { name: o?.name ?? null, logoUrl: o?.logo_url && /^https:\/\//.test(o.logo_url) ? o.logo_url : null };
}
