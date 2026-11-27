import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable, type ReportRow } from "./server";
import { hashSummaryToken, isSummaryToken, newSummaryToken, summaryTokenOpens, type SummaryInput, type SummaryReport } from "./summary";

/**
 * Repair Cost Summary: the reads and writes behind ./summary. Every read
 * here is scoped to one report's organization: the owner's page proves
 * membership first (the report through their own RLS client), the share
 * page through the link's token hash. The service role then reads the
 * linked RFPs' responses, the trades' names and (when the vendor insurance
 * tracker exists) the certificate dates. Nothing here reads contact
 * details, files or the trades' notes.
 */

type Db = SupabaseClient;

export const SUMMARY_REPORT_COLUMNS = "id,organization_id,created_by,title,report_type,country,created_at,building_name,street_address,city,region";

export type SummaryReportRow = SummaryReport & Pick<ReportRow, "id" | "organization_id"> & { created_by: string | null };

export type SummaryParts = Omit<SummaryInput, "report" | "includeAddress" | "fallbackTitle">;

export interface SummarySettings {
  includeAddress: boolean;
  /** When the current share link was made; null = no link. */
  shareCreatedAt: string | null;
  openCount: number;
  lastOpenedAt: string | null;
}

const NO_SETTINGS: SummarySettings = { includeAddress: false, shareCreatedAt: null, openCount: 0, lastOpenedAt: null };

/** The items, the RFPs each trade group became and the quotes trades sent, for one report. */
export async function loadSummaryParts(admin: Db, report: Pick<SummaryReportRow, "id" | "organization_id">, now: Date = new Date()): Promise<SummaryParts> {
  const [{ data: items }, { data: links, error: linkErr }, { data: sends }] = await Promise.all([
    admin.from("quote_report_items").select("trade_slug,item,location,urgency,position").eq("report_id", report.id).order("position", { ascending: true }).limit(500),
    admin.from("quote_report_rfps").select("trade_slug,rfp_id").eq("report_id", report.id).eq("organization_id", report.organization_id),
    admin.from("quote_report_sends").select("trade_slug,initiated_at").eq("report_id", report.id),
  ]);
  if (linkErr && !isMissingTable(linkErr)) console.error("[report-quotes] summary links", linkErr.message);
  const linkRows = (links ?? []) as { trade_slug: string; rfp_id: string }[];
  const rfpIds = [...new Set(linkRows.map((l) => l.rfp_id))];

  let rfps: SummaryParts["rfps"] = [];
  let responses: SummaryParts["responses"] = [];
  if (rfpIds.length) {
    const { data: rfpRows } = await admin.from("rfp_posts").select("id,status,created_at,published_at,posted_by_organization_id").in("id", rfpIds);
    // Only RFPs this organization posted, whatever a link row says.
    rfps = ((rfpRows ?? []) as { id: string; status: string; created_at: string; published_at: string | null; posted_by_organization_id: string | null }[])
      .filter((r) => r.posted_by_organization_id === report.organization_id)
      .map(({ id, status, created_at, published_at }) => ({ id, status, created_at, published_at }));
    const ownIds = rfps.map((r) => r.id);
    if (ownIds.length) {
      const withQuote = await admin.from("rfp_interests").select("rfp_id,trade_organization_id,quote_amount,quote_kind,start_date,created_at").in("rfp_id", ownIds);
      // Before the PM job flow migration there are no quote columns: responses count, without amounts.
      const fallback = withQuote.error ? await admin.from("rfp_interests").select("rfp_id,trade_organization_id,created_at").in("rfp_id", ownIds) : null;
      const rows = ((fallback ? fallback.data : withQuote.data) ?? []) as Partial<SummaryParts["responses"][number]>[];
      responses = rows.map((r) => ({
        rfp_id: String(r.rfp_id),
        trade_organization_id: String(r.trade_organization_id),
        quote_amount: r.quote_amount ?? null,
        quote_kind: r.quote_kind ?? null,
        start_date: r.start_date ?? null,
        created_at: String(r.created_at),
      }));
    }
  }

  const tradeIds = [...new Set(responses.map((r) => r.trade_organization_id))];
  const [tradeNames, insurance] = await Promise.all([loadTradeNames(admin, tradeIds), loadInsurance(admin, report.organization_id, tradeIds, now)]);
  return {
    items: ((items ?? []) as SummaryParts["items"][number][]).map((i) => ({ trade_slug: i.trade_slug, item: i.item, location: i.location ?? "", urgency: i.urgency })),
    links: linkRows,
    rfps,
    responses,
    tradeNames,
    insurance,
    sends: (sends ?? []) as { trade_slug: string; initiated_at: string }[],
  };
}

async function loadTradeNames(admin: Db, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await admin.from("organizations").select("id,name").in("id", ids);
  return Object.fromEntries(((data ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]));
}

/**
 * Current general liability certificates in the OWNER's vendor insurance
 * tracker (vendor_certificates, when that table exists), matched to the
 * trade's PMRFP company: trade id → upload date. A certificate without an
 * uploaded file, or past its expiry, doesn't count. No table, no line.
 */
export async function loadInsurance(admin: Db, ownerOrgId: string, tradeIds: string[], now: Date = new Date()): Promise<Record<string, string>> {
  if (!tradeIds.length) return {};
  const { data, error } = await admin
    .from("vendor_certificates")
    .select("vendor_organization_id,cert_type,file_path,file_uploaded_at,expires_on")
    .eq("organization_id", ownerOrgId)
    .in("vendor_organization_id", tradeIds);
  if (error) return {};
  const today = now.toISOString().slice(0, 10);
  const out: Record<string, string> = {};
  for (const c of (data ?? []) as { vendor_organization_id: string; cert_type: string; file_path: string | null; file_uploaded_at: string | null; expires_on: string | null }[]) {
    if (c.cert_type !== "general_liability" || !c.file_path || !c.file_uploaded_at) continue;
    if (c.expires_on && c.expires_on < today) continue;
    const prev = out[c.vendor_organization_id];
    if (!prev || new Date(c.file_uploaded_at).getTime() > new Date(prev).getTime()) out[c.vendor_organization_id] = c.file_uploaded_at;
  }
  return out;
}

export interface Branding {
  name: string;
  company: string;
  logoUrl: string | null;
}

/** The preparer's own name, company or brokerage and the company logo. Never an email or phone number. */
export async function loadBranding(admin: Db, userId: string | null, orgId: string): Promise<Branding> {
  const [{ data: org }, profile, list] = await Promise.all([
    admin.from("organizations").select("name,logo_url").eq("id", orgId).maybeSingle<{ name: string; logo_url: string | null }>(),
    userId ? admin.from("users_profile").select("full_name").eq("id", userId).maybeSingle<{ full_name: string | null }>() : Promise.resolve({ data: null }),
    userId ? admin.from("trusted_lists").select("brokerage").eq("owner_id", userId).maybeSingle<{ brokerage: string | null }>() : Promise.resolve({ data: null }),
  ]);
  const company = list.data?.brokerage?.trim() || org?.name || "";
  return { name: profile.data?.full_name?.trim() || "", company, logoUrl: safeLogo(org?.logo_url ?? null) };
}

/** Only an https image URL goes into the page. */
export function safeLogo(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

// ── Settings and the share link (service role, after the caller's own check) ──

export async function loadSummarySettings(db: Db, reportId: string): Promise<SummarySettings & { ready: boolean }> {
  const { data, error } = await db
    .from("quote_report_summaries")
    .select("include_address,share_created_at,open_count,last_opened_at")
    .eq("report_id", reportId)
    .maybeSingle<{ include_address: boolean; share_created_at: string | null; open_count: number; last_opened_at: string | null }>();
  if (error) return { ...NO_SETTINGS, ready: !isMissingTable(error) };
  if (!data) return { ...NO_SETTINGS, ready: true };
  return { includeAddress: data.include_address, shareCreatedAt: data.share_created_at, openCount: data.open_count ?? 0, lastOpenedAt: data.last_opened_at, ready: true };
}

type Owned = Pick<SummaryReportRow, "id" | "organization_id">;

async function upsertSettings(admin: Db, report: Owned, userId: string, patch: Record<string, unknown>): Promise<boolean> {
  const { error } = await admin
    .from("quote_report_summaries")
    .upsert({ report_id: report.id, organization_id: report.organization_id, prepared_by: userId, ...patch }, { onConflict: "report_id" });
  if (error) console.error("[report-quotes] summary settings", error.message);
  return !error;
}

/** Turn the share link on, or replace it. Returns the raw token once; only its hash is stored. */
export async function createSummaryShare(admin: Db, report: Owned, userId: string, now: Date = new Date()): Promise<string | null> {
  const token = newSummaryToken();
  const ok = await upsertSettings(admin, report, userId, { share_token_hash: hashSummaryToken(token), share_created_at: now.toISOString(), open_count: 0, last_opened_at: null });
  return ok ? token : null;
}

/** Turn the share link off: the old link opens nothing. */
export async function revokeSummaryShare(admin: Db, report: Owned, userId: string): Promise<boolean> {
  return upsertSettings(admin, report, userId, { share_token_hash: null, share_created_at: null });
}

export async function setSummaryAddress(admin: Db, report: Owned, userId: string, include: boolean): Promise<boolean> {
  return upsertSettings(admin, report, userId, { include_address: include });
}

export type SharedSummary =
  | { state: "open"; report: SummaryReportRow; includeAddress: boolean; preparedBy: string | null }
  | { state: "closed" };

/**
 * Someone opens a share link: the token's hash must be a summary's current
 * one. Counts the open. A turned-off or replaced link is "closed".
 */
export async function resolveSummaryShare(admin: Db, token: string, now: Date = new Date()): Promise<SharedSummary> {
  if (!isSummaryToken(token)) return { state: "closed" };
  const hash = hashSummaryToken(token);
  const { data: row, error } = await admin
    .from("quote_report_summaries")
    .select("report_id,share_token_hash,include_address,prepared_by,open_count")
    .eq("share_token_hash", hash)
    .maybeSingle<{ report_id: string; share_token_hash: string | null; include_address: boolean; prepared_by: string | null; open_count: number }>();
  if (error || !row || !summaryTokenOpens(row.share_token_hash, token)) return { state: "closed" };
  const { data: report } = await admin.from("quote_reports").select(SUMMARY_REPORT_COLUMNS).eq("id", row.report_id).maybeSingle<SummaryReportRow>();
  if (!report) return { state: "closed" };
  await admin
    .from("quote_report_summaries")
    .update({ open_count: (row.open_count ?? 0) + 1, last_opened_at: now.toISOString() })
    .eq("report_id", row.report_id);
  return { state: "open", report, includeAddress: row.include_address, preparedBy: row.prepared_by ?? report.created_by };
}

// ── Trade group → RFP links ──────────────────────────────────────────

export interface LinkCandidate {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  tradeSlugs: string[];
}

/** The organization's recent RFPs (through the user's own client), for linking a group by hand. */
export async function loadLinkCandidates(db: Db, orgId: string): Promise<LinkCandidate[]> {
  const { data, error } = await db
    .from("rfp_posts")
    .select("id,title,status,created_at,rfp_categories(trade_categories(slug))")
    .eq("posted_by_organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  type Row = { id: string; title: string; status: string; created_at: string; rfp_categories?: { trade_categories?: { slug?: string } | { slug?: string }[] | null }[] | null };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    createdAt: r.created_at,
    tradeSlugs: (r.rfp_categories ?? []).flatMap((c) => {
      const t = c.trade_categories;
      return (Array.isArray(t) ? t : t ? [t] : []).map((x) => x.slug).filter((s): s is string => Boolean(s));
    }),
  }));
}

export async function loadLinks(db: Db, reportId: string): Promise<{ id: string; trade_slug: string; rfp_id: string }[]> {
  const { data, error } = await db.from("quote_report_rfps").select("id,trade_slug,rfp_id").eq("report_id", reportId);
  if (error) return [];
  return (data ?? []) as { id: string; trade_slug: string; rfp_id: string }[];
}
