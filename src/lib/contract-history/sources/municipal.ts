/**
 * City award lists (winners, values, dates): history for Toronto, Montréal
 * and Ottawa. None publishes losing bidders or end dates; Montréal's
 * decision text often states the number of bids ("(2 SOUM.)") and the term
 * ("D'UNE DURÉE DE 36 MOIS"), which become number_of_bids and a
 * derived_from_title end date.
 *
 *  CA-06 Toronto Bids Awarded Contracts — Open Government Licence – Toronto,
 *        daily. CKAN datastore dump (ckan0…/datastore/dump/<id>): robots.txt
 *        there allows /api/ and only disallows /dataset/*\/resource/*\/download/*,
 *        so the datastore dump is used, never the /download/ link.
 *  CA-12 Montréal contracts (conseil municipal, conseil d'agglomération,
 *        comité exécutif, fonctionnaires) — CC BY 4.0. robots.txt on
 *        donnees.montreal.ca disallows /api/ (CKAN API) with Crawl-delay 10,
 *        so file URLs come from the dataset pages and files from /download/.
 *  CA-07 Ottawa contracts awarded over $25,000 under delegated authority —
 *        City of Ottawa Open Data Licence (open.ottawa.ca says the hub's data
 *        is "under our Open Data License"; licence page text not fetched, see
 *        PR notes). ArcGIS FeatureServer layers on services.arcgis.com, one
 *        per half-year, no award date: the date is the half-year's last day
 *        (award_date_precision = half_year).
 */
import { TORONTO_ATTRIBUTION, TORONTO_DATASET_URL, rowsFromCsv } from "@/lib/data/toronto-awards";
import { readCsv } from "../csv-stream";
import { politeJson, politeText } from "../fetch";
import { buyerKey, clip, emptyBatch, endDateFor, isoDay, money, skip, winnerFields, type AwardHistoryInput, type ParsedBatch } from "../model";
import { tradesEn, tradesFr } from "../trades";

/* ------------------------------------------------------------------ Toronto */

export const TORONTO_SOURCE = "ca-toronto-awards";
export const TORONTO_DUMP_URL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/e211f003-5909-4bea-bd96-d75899d8e612";
export const TORONTO_LICENCE = "Open Government Licence – Toronto";

export function parseToronto(text: string, opts: { since: string; asOf: string }): ParsedBatch {
  const batch = emptyBatch();
  const seen = new Map<string, AwardHistoryInput>();
  for (const r of rowsFromCsv(text)) {
    batch.read++;
    if (!r.date) {
      skip(batch, "no-date");
      continue;
    }
    if (r.date < opts.since) {
      skip(batch, "too-old");
      continue;
    }
    if (/goods/i.test(r.category) && !/services/i.test(r.category)) {
      skip(batch, "goods");
      continue;
    }
    const trades = tradesEn(r.description);
    if (!trades.length) {
      skip(batch, "not-building-work");
      continue;
    }
    const winner = winnerFields(r.supplier);
    if (!winner) {
      skip(batch, "no-supplier");
      continue;
    }
    const buyer = "City of Toronto";
    const key = `${r.doc || r.description.slice(0, 60)}|${winner.winner_key ?? "individual"}`;
    seen.set(key, {
      source: TORONTO_SOURCE,
      source_key: key,
      board_ref: null,
      title: clip(r.description, 300) ?? `Toronto contract ${r.doc}`,
      description: clip([r.type, r.category, r.division].filter(Boolean).join(" · "), 400),
      buyer,
      buyer_key: buyerKey(buyer),
      ...winner,
      value: r.amount,
      currency: "CAD",
      country: "CA",
      province: "Ontario",
      city: "Toronto",
      award_date: r.date,
      award_date_precision: "day",
      start_date: null,
      ...endDateFor({ awardDate: r.date, text: r.description }),
      potential_end_date: null,
      number_of_bids: null,
      trade_slugs: trades,
      notice_url: TORONTO_DATASET_URL,
      licence: TORONTO_LICENCE,
      attribution: TORONTO_ATTRIBUTION,
      as_of: opts.asOf,
    });
  }
  batch.awards = [...seen.values()];
  return batch;
}

export async function collectToronto(opts: { since: string; asOf: string }): Promise<ParsedBatch> {
  return parseToronto(await politeText(TORONTO_DUMP_URL, { accept: "text/csv" }), opts);
}

/* ------------------------------------------------------------------ Montréal */

export const MONTREAL_SOURCE = "ca-montreal-contracts";
export const MONTREAL_LICENCE = "CC BY 4.0 (Ville de Montréal)";
export const MONTREAL_ATTRIBUTION = "Source : Ville de Montréal, portail de données ouvertes (donnees.montreal.ca), CC BY 4.0.";
/** Dataset pages (allowed by robots.txt); their /download/ CSV links are read from the HTML. */
export const MONTREAL_DATASETS = [
  "https://donnees.montreal.ca/dataset/contrats-conseil-municipal-et-conseil-d-agglomeration",
  "https://donnees.montreal.ca/dataset/contrats-comite-executif",
  "https://donnees.montreal.ca/dataset/contrats-octroyes-par-les-fonctionnaires-ville-centrale",
];

export function montrealCsvLinks(html: string): string[] {
  return [...new Set([...html.matchAll(/https:\/\/donnees\.montreal\.ca\/dataset\/[0-9a-f-]+\/resource\/[0-9a-f-]+\/download\/[^"'\s<>]+\.csv/gi)].map((m) => m[0]))];
}

/** Header lookup tolerant of accents and wording ("DATE SIGNATURE", "DATE D'APPROBATION"). */
function pick(r: Record<string, string>, ...patterns: RegExp[]): string {
  const keys = Object.keys(r);
  for (const p of patterns) {
    const k = keys.find((h) => p.test(h.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()));
    if (k && r[k]?.trim()) return r[k].trim();
  }
  return "";
}

export function parseMontreal(text: string, opts: { since: string; asOf: string; file: string; datasetUrl: string }): ParsedBatch {
  const batch = emptyBatch();
  const seen = new Map<string, AwardHistoryInput>();
  for (const r of readCsv(text)) {
    batch.read++;
    const date = isoDay(pick(r, /^DATE SIGNATURE/, /^DATE D.APPROBATION/, /^DATE/));
    if (!date) {
      skip(batch, "no-date");
      continue;
    }
    if (date < opts.since) {
      skip(batch, "too-old");
      continue;
    }
    const objet = pick(r, /^OBJET/, /^DESCRIPTION/);
    const trades = tradesFr(objet);
    if (!trades.length) {
      skip(batch, "not-building-work");
      continue;
    }
    const winner = winnerFields(pick(r, /^FOURNISSEUR/, /^NOM FOURNISSEUR/, /^NOM DU FOURNISSEUR/));
    if (!winner) {
      skip(batch, "no-supplier");
      continue;
    }
    const dossier = pick(r, /^NO DE DOSSIER/, /^NUMERO/, /^NO\b/);
    const decision = pick(r, /^NO DECISION/, /^NO\. DECISION/);
    const service = pick(r, /^SERVICE/);
    const bids = objet.match(/\((\d{1,2})\s*SOUM/i);
    const key = `${opts.file}|${dossier || decision || objet.slice(0, 60)}|${winner.winner_key ?? "individual"}`;
    const buyer = "Ville de Montréal";
    seen.set(key, {
      source: MONTREAL_SOURCE,
      source_key: key,
      board_ref: null,
      title: clip(objet, 300) ?? "Contrat",
      description: clip([service, decision && `Décision ${decision}`].filter(Boolean).join(" · "), 400),
      buyer,
      buyer_key: buyerKey(buyer),
      ...winner,
      value: money(pick(r, /^MONTANT/)),
      currency: "CAD",
      country: "CA",
      province: "Quebec",
      city: "Montréal",
      award_date: date,
      award_date_precision: "day",
      start_date: null,
      ...endDateFor({ awardDate: date, text: objet }),
      potential_end_date: null,
      number_of_bids: bids ? Number(bids[1]) || null : null,
      trade_slugs: trades,
      notice_url: opts.datasetUrl,
      licence: MONTREAL_LICENCE,
      attribution: MONTREAL_ATTRIBUTION,
      as_of: opts.asOf,
    });
  }
  batch.awards = [...seen.values()];
  return batch;
}

export async function collectMontreal(opts: { since: string; asOf: string }): Promise<ParsedBatch & { files: string[] }> {
  const total = { ...emptyBatch(), files: [] as string[] };
  for (const page of MONTREAL_DATASETS) {
    const links = montrealCsvLinks(await politeText(page, { accept: "text/html" }));
    for (const url of links) {
      const file = url.split("/").pop() ?? url;
      total.files.push(file);
      const b = parseMontreal(await politeText(url, { accept: "text/csv" }), { ...opts, file, datasetUrl: page });
      total.read += b.read;
      total.awards.push(...b.awards);
      for (const [k, v] of Object.entries(b.skipped)) total.skipped[k] = (total.skipped[k] ?? 0) + v;
    }
  }
  return total;
}

/* ------------------------------------------------------------------ Ottawa */

export const OTTAWA_SOURCE = "ca-ottawa-contracts";
export const OTTAWA_LICENCE = "Open Data Licence – City of Ottawa";
export const OTTAWA_ATTRIBUTION = "Contains information licensed under the Open Government Licence – City of Ottawa.";
export const OTTAWA_HUB = "https://open.ottawa.ca/";
const ARCGIS = "https://services.arcgis.com/G6F8XLCl5KtAlZ2G/arcgis/rest/services";

/** Half-year layers (name → the period's last day), checked 2026-10-16. */
export const OTTAWA_LAYERS: { name: string; to: string }[] = [
  { name: "Contracts_25000_Awarded_DOA_Jul_Dec_2025", to: "2025-12-31" },
  { name: "2025_Contracts_Awarded_greater_than_25000_Jan_-_Jun", to: "2025-06-30" },
  { name: "Contracts_awarded_for_Q3_Q4_2024", to: "2024-12-31" },
  { name: "Contracts_awarded_under_delegation_of_authority_for_Jan_June_2024_AODA_All_Departments", to: "2024-06-30" },
  { name: "Contracts_awarded_under_delegation_of_authority_for_the_period_July_Dec_2023_AODA", to: "2023-12-31" },
  { name: "Ottawa_and_Open_data_Contracts_awarded_under_DA_January_1_2023_to_June_30_2023_AODA", to: "2023-06-30" },
];

export function parseOttawaFeatures(features: { attributes: Record<string, unknown> }[], opts: { layer: string; to: string; since: string; asOf: string }): ParsedBatch {
  const batch = emptyBatch();
  for (const f of features) {
    batch.read++;
    const a = f.attributes;
    const get = (re: RegExp) => {
      const k = Object.keys(a).find((x) => re.test(x));
      return k ? String(a[k] ?? "").trim() : "";
    };
    if (opts.to < opts.since) {
      skip(batch, "too-old");
      continue;
    }
    if (/^y/i.test(get(/^Professional/i))) {
      skip(batch, "professional-services");
      continue;
    }
    const description = get(/^Description$/i);
    const trades = tradesEn(description);
    if (!trades.length) {
      skip(batch, "not-building-work");
      continue;
    }
    const winner = winnerFields(get(/^Vendor$/i));
    if (!winner) {
      skip(batch, "no-supplier");
      continue;
    }
    const contract = get(/^Contract$/i);
    const department = get(/^Department$/i);
    const buyer = "City of Ottawa";
    batch.awards.push({
      source: OTTAWA_SOURCE,
      source_key: `${opts.layer}|${contract || description.slice(0, 60)}|${winner.winner_key ?? "individual"}`,
      board_ref: null,
      title: clip(description, 300) ?? `Ottawa contract ${contract}`,
      description: clip([department, get(/^Contract_Approval/i), get(/^Non_Competitive/i)].filter(Boolean).join(" · "), 400),
      buyer,
      buyer_key: buyerKey(buyer),
      ...winner,
      value: money(get(/^Amount$/i)),
      currency: "CAD",
      country: "CA",
      province: "Ontario",
      city: "Ottawa",
      award_date: opts.to,
      award_date_precision: "half_year",
      start_date: null,
      ...endDateFor({ awardDate: opts.to, text: description }),
      potential_end_date: null,
      number_of_bids: null,
      trade_slugs: trades,
      notice_url: OTTAWA_HUB,
      licence: OTTAWA_LICENCE,
      attribution: OTTAWA_ATTRIBUTION,
      as_of: opts.asOf,
    });
  }
  return batch;
}

export async function collectOttawa(opts: { since: string; asOf: string }): Promise<ParsedBatch> {
  const total = emptyBatch();
  for (const layer of OTTAWA_LAYERS) {
    if (layer.to < opts.since) continue;
    for (let offset = 0; offset < 20_000; offset += 2000) {
      const url = `${ARCGIS}/${encodeURIComponent(layer.name)}/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&resultOffset=${offset}&resultRecordCount=2000&f=json`;
      const json = await politeJson<{ features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean; error?: { message?: string } }>(url);
      if (json.error) throw new Error(`Ottawa ${layer.name}: ${json.error.message ?? "error"}`);
      const b = parseOttawaFeatures(json.features ?? [], { layer: layer.name, to: layer.to, ...opts });
      total.read += b.read;
      total.awards.push(...b.awards);
      for (const [k, v] of Object.entries(b.skipped)) total.skipped[k] = (total.skipped[k] ?? 0) + v;
      if (!json.exceededTransferLimit) break;
    }
  }
  return total;
}
