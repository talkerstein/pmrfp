/**
 * CA-01 · SEAO open data (Système électronique d'appel d'offres), Données
 * Québec, CC BY 4.0: every Quebec public body and municipality, contracts of
 * $25K+. Weekly "hebdo" files (~17 MB) and monthly "mensuel" roll-ups
 * (~70 MB) of OCDS releases.
 *
 * robots.txt on www.donneesquebec.ca disallows the CKAN API (/recherche/api/,
 * /api/) and query-string dataset URLs, with Crawl-delay 10. So the file
 * list comes from the plain dataset page (allowed) and the files from their
 * /download/ URLs (allowed), one at a time, 10 s apart.
 *
 * Kept: competitive calls (open, selective, invitation; not gré à gré) for
 * building-trade work (the board's French trade rules), not goods and not
 * civil works (category C02). One row per award (supplier). End dates:
 * contracts[].period.endDate is stated when present (rare on active
 * contracts, always on terminated ones: the actual end). Bid lists: the
 * release-level `bids` array (supplier id + amount), names from
 * tender.tenderers; stored only when 2+ bids are listed.
 */
import { SEAO_ATTRIBUTION } from "@/lib/tenders/sources";
import { slugify } from "@/lib/tenders/shared";
import { politeFetch, politeText } from "../fetch";
import { SEAO_DATASET_PAGE, savedSeaoFiles, seaoFilesFromPage, type SeaoFile } from "./seao-files";

export { SEAO_DATASET_PAGE, savedSeaoFiles, seaoFilesFromPage };
import { businessNameOrNull, buyerKey, clip, emptyBatch, endDateFor, httpsOrNull, isoDay, money, nameKey, skip, winnerFields, type AwardHistoryInput, type BidResultInput, type ParsedBatch } from "../model";
import { tradesFr } from "../trades";

export const SEAO_SOURCE = "ca-seao";
export const SEAO_LICENCE = "CC BY 4.0 (Données Québec)";

interface Party {
  id?: string;
  name?: string;
  roles?: string[];
  address?: { locality?: string; region?: string };
}
interface Release {
  ocid: string;
  date?: string;
  tag?: string[];
  parties?: Party[];
  buyer?: { name?: string; id?: string };
  tender?: {
    id?: string;
    title?: string;
    status?: string;
    procurementMethod?: string;
    mainProcurementCategory?: string;
    items?: { id?: string; description?: string }[];
    numberOfTenderers?: number;
    tenderers?: { id?: string; name?: string }[];
    documents?: { url?: string }[];
  };
  bids?: { id?: string; value?: number | string; valueUnit?: string }[];
  awards?: { id?: string; date?: string; value?: { amount?: number; currency?: string }; suppliers?: { id?: string; name?: string }[] }[];
  contracts?: { id?: string; awardID?: string; status?: string; period?: { startDate?: string; endDate?: string }; value?: { amount?: number; currency?: string }; dateSigned?: string }[];
}


const COMPETITIVE = new Set(["open", "selective", "limited"]);

/** Award rows (and bid lists) from one SEAO JSON file. Later releases of the same award replace earlier ones. */
export function parseSeaoFile(json: { publishedDate?: string; releases?: Release[] }, opts: { since: string; asOf: string }): ParsedBatch {
  const batch = emptyBatch();
  const awards = new Map<string, { row: AwardHistoryInput; date: string; bids: BidResultInput[] }>();
  const asOf = isoDay(json.publishedDate) ?? opts.asOf;
  for (const r of json.releases ?? []) {
    batch.read++;
    const t = r.tender;
    if (!t || !r.awards?.length) {
      skip(batch, "no-award");
      continue;
    }
    if (!COMPETITIVE.has(t.procurementMethod ?? "")) {
      skip(batch, "not-competitive");
      continue;
    }
    if (t.mainProcurementCategory === "goods") {
      skip(batch, "goods");
      continue;
    }
    if ((t.items ?? []).some((i) => /^C02\b/.test(i.id ?? i.description ?? ""))) {
      skip(batch, "civil-works");
      continue;
    }
    const trades = tradesFr(t.title ?? "");
    if (!trades.length) {
      skip(batch, "not-building-work");
      continue;
    }
    const buyerParty = r.parties?.find((p) => p.roles?.includes("buyer"));
    const buyer = clip((r.buyer?.name ?? buyerParty?.name ?? "").replace(/\.\s*$/, ""), 200);
    const names = new Map<string, string>();
    for (const x of [...(t.tenderers ?? []), ...(r.parties ?? [])]) if (x.id && x.name) names.set(x.id, x.name);
    const notice = httpsOrNull(t.documents?.find((d) => d.url?.includes("seao.gouv.qc.ca"))?.url);
    for (const a of r.awards) {
      const supplier = a.suppliers?.[0];
      const awardDate = isoDay(a.date);
      if (!supplier?.name || !awardDate) {
        skip(batch, "award-incomplete");
        continue;
      }
      if (awardDate < opts.since) {
        skip(batch, "too-old");
        continue;
      }
      if ((a.value?.currency ?? "CAD") !== "CAD") {
        skip(batch, "currency");
        continue;
      }
      const winner = winnerFields(supplier.name);
      if (!winner) {
        skip(batch, "no-winner");
        continue;
      }
      const contract = r.contracts?.find((c) => c.awardID === a.id) ?? (r.contracts?.length === 1 ? r.contracts[0] : undefined);
      const end = endDateFor({ awardDate, stated: contract?.period?.endDate, text: t.title });
      const key = `${r.ocid}|${a.id ?? supplier.id ?? supplier.name}`;
      const row: AwardHistoryInput = {
        source: SEAO_SOURCE,
        source_key: key,
        board_ref: `qca-${slugify(t.id || r.ocid)}`,
        title: clip(t.title, 300) ?? "Contrat",
        description: clip((t.items ?? []).map((i) => i.description).filter(Boolean).join(" · "), 600),
        buyer,
        buyer_key: buyerKey(buyer),
        ...winner,
        value: money(contract?.value?.amount) ?? money(a.value?.amount),
        currency: "CAD",
        country: "CA",
        province: "Quebec",
        city: clip(buyerParty?.address?.locality, 80),
        award_date: awardDate,
        award_date_precision: "day",
        start_date: isoDay(contract?.period?.startDate),
        ...end,
        potential_end_date: null,
        number_of_bids: typeof t.numberOfTenderers === "number" && t.numberOfTenderers > 0 ? t.numberOfTenderers : null,
        trade_slugs: trades,
        notice_url: notice,
        licence: SEAO_LICENCE,
        attribution: SEAO_ATTRIBUTION,
        as_of: asOf,
      };
      const bids = seaoBids(r, names, supplier.id ?? null, row, asOf);
      const prev = awards.get(key);
      const when = r.date ?? "";
      if (!prev || when >= prev.date) awards.set(key, { row, date: when, bids: bids.length ? bids : prev?.bids ?? [] });
    }
  }
  for (const { row, bids } of awards.values()) {
    batch.awards.push(row);
    batch.bids.push(...bids);
  }
  return batch;
}

/**
 * The bid list on a release: every bid with its amount, ranked low to high,
 * the awarded supplier marked. Only when 2+ bids are listed (one bid is just
 * the winner). Bidders that look like individuals keep rank and amount, no name.
 */
export function seaoBids(r: Release, names: Map<string, string>, winnerId: string | null, award: AwardHistoryInput, asOf: string): BidResultInput[] {
  const list = (r.bids ?? []).filter((b) => b.id);
  if (list.length < 2) return [];
  const priced = list.map((b) => ({ id: b.id!, amount: b.valueUnit && b.valueUnit !== "1" ? null : money(b.value) }));
  const ranked = [...priced].sort((a, b) => (a.amount ?? Infinity) - (b.amount ?? Infinity));
  const out: BidResultInput[] = [];
  const used = new Set<string>();
  let individuals = 0;
  ranked.forEach((b, i) => {
    const raw = names.get(b.id) ?? null;
    const name = businessNameOrNull(raw);
    let key = name ? nameKey(name) : `individual:${++individuals}`;
    if (!key || used.has(key)) key = `${key || "bidder"}:${b.id}`;
    used.add(key);
    out.push({
      award_source: award.source,
      award_source_key: award.source_key,
      bidder_business_name: name,
      bidder_key: key,
      bidder_is_individual: !name,
      bid_amount: b.amount,
      currency: "CAD",
      rank: b.amount !== null ? i + 1 : null,
      status_label: winnerId && b.id === winnerId ? "awarded" : "not_awarded",
      as_of: asOf,
      source: SEAO_SOURCE,
    });
  });
  return out;
}


/**
 * The file list: the live dataset page when it answers with the page, else
 * the saved list. A bot challenge (AWS WAF answers 202 with a script) is
 * never solved or worked around; it just means "use the saved list".
 */
export async function seaoFileList(): Promise<{ files: SeaoFile[]; from: "page" | "saved" }> {
  try {
    const res = await politeFetch(SEAO_DATASET_PAGE, { accept: "text/html" });
    const html = res.status === 200 ? await res.text() : "";
    const live = seaoFilesFromPage(html);
    if (live.length) {
      const names = new Set(live.map((f) => f.name));
      return { files: [...live, ...savedSeaoFiles().filter((f) => !names.has(f.name))].sort((a, b) => b.from.localeCompare(a.from) || a.kind.localeCompare(b.kind)), from: "page" };
    }
  } catch {
    // Unreachable page: the saved list below.
  }
  return { files: savedSeaoFiles(), from: "saved" };
}

/** A /download/ link pasted by an admin (?url=): only Données Québec SEAO JSON files. */
export function seaoFileFromUrl(url: string): SeaoFile | null {
  return seaoFilesFromPage(url)[0] ?? null;
}

/**
 * One run: the newest weekly file, or the named files (`files`: names like
 * "mensuel_20250901_20250930.json", or "YYYY-MM" for that month's roll-up).
 */
export async function collectSeao(opts: { since: string; asOf: string; files?: string[]; weeks?: number; url?: string | null }): Promise<ParsedBatch & { files: string[]; fileList: "page" | "saved" | "url" }> {
  const pasted = opts.url ? seaoFileFromUrl(opts.url) : null;
  const { files: list, from } = pasted ? { files: [pasted], from: "url" as const } : await seaoFileList();
  let pick: typeof list;
  if (pasted) {
    pick = [pasted];
  } else if (opts.files?.length) {
    pick = opts.files
      .map((f) => (/^\d{4}-\d{2}$/.test(f) ? list.find((x) => x.kind === "mensuel" && x.from.startsWith(f.replace("-", ""))) : list.find((x) => x.name === f)))
      .filter((x): x is (typeof list)[number] => Boolean(x));
  } else {
    pick = list.filter((x) => x.kind === "hebdo").slice(0, opts.weeks ?? 1);
  }
  const total = { ...emptyBatch(), files: pick.map((p) => p.name), fileList: from };
  // Oldest first, so a later release of the same award replaces an earlier one downstream.
  for (const f of [...pick].sort((a, b) => a.from.localeCompare(b.from))) {
    const b = parseSeaoFile(JSON.parse(await politeText(f.url)) as { publishedDate?: string; releases?: Release[] }, opts);
    total.read += b.read;
    total.awards.push(...b.awards);
    total.bids.push(...b.bids);
    for (const [k, v] of Object.entries(b.skipped)) total.skipped[k] = (total.skipped[k] ?? 0) + v;
  }
  return total;
}
