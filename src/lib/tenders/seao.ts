/**
 * Quebec SEAO → PMRFP public-tender feed.
 *
 * Every Quebec public body (ministries, municipalities, school service
 * centres, CIUSSS/health, universities) posts tenders to SEAO, published
 * weekly as Open Contracting (OCDS) JSON on Données Québec under CC BY 4.0
 * (commercial reuse with attribution). This covers Montreal, Laval and the
 * rest of Quebec.
 *
 * Weekly files hold everything *published* that week (tenders, updates,
 * awards), not a snapshot of what's open — so the importer reads the last
 * several weeks, keeps each tender's latest release, and lists only active
 * open calls whose closing date hasn't passed. Titles are French; matching
 * uses French trade vocabulary.
 */
import type { TenderInsert } from "./canadabuys";
import { clean, slugify } from "./shared";
import { SEAO_ATTRIBUTION } from "./sources";
import { SEAO_DATASET_PAGE, savedSeaoFiles, seaoFilesFromPage, type SeaoFile } from "@/lib/contract-history/sources/seao-files";

/**
 * The weekly file list comes from the plain dataset page (SEAO_DATASET_PAGE).
 * robots.txt on www.donneesquebec.ca (re-checked 2026-10-16) disallows the
 * CKAN API (/recherche/api/, /api/) and query-string dataset URLs, allows the
 * dataset page and the /download/ file URLs, and asks for Crawl-delay: 10.
 */
export { SEAO_DATASET_PAGE };
/** Seconds between two requests to www.donneesquebec.ca (its robots.txt Crawl-delay). */
export const SEAO_CRAWL_DELAY_S = 10;
/** Weeks of weekly files to read — most calls close within 4–6 weeks. */
export const SEAO_WEEKS = 6;

/* Minimal OCDS shapes — only what we read. */
interface OcdsParty {
  name?: string;
  roles?: string[];
  address?: { locality?: string; region?: string };
}
interface OcdsTender {
  id?: string;
  title?: string;
  status?: string;
  procurementMethod?: string;
  procurementMethodDetails?: string;
  mainProcurementCategory?: string;
  items?: { description?: string; classification?: { description?: string } }[];
  tenderPeriod?: { startDate?: string; endDate?: string };
  documents?: { url?: string }[];
}
export interface OcdsAward {
  date?: string;
  value?: { amount?: number; currency?: string };
  suppliers?: { name?: string }[];
}
export interface OcdsRelease {
  ocid: string;
  date?: string;
  tag?: string[];
  parties?: OcdsParty[];
  buyer?: { name?: string };
  tender?: OcdsTender;
  awards?: OcdsAward[];
}

// French trade vocabulary → PMRFP category slugs. Accents are stripped first.
export const RULES_FR: [slug: string, pattern: RegExp][] = [
  ["snow-removal", /deneigement|enlevement de la neige|deglacage/],
  ["cleaning-janitorial", /entretien menager|conciergerie|nettoyage|menage des|lavage de vitres/],
  ["landscaping", /amenagement paysager|paysag|tonte|gazon|horticult|elagage|abattage d.arbres|entretien des terrains/],
  ["hvac", /\bcvac\b|chauffage|ventilation|climatisation|refrigeration|chaudiere(?!-appalaches)|thermopompe|chauffe-eau|systeme mecanique/],
  ["locksmith", /serrurerie|serrurier/],
  ["roofing", /toiture|\btoit\b|couverture/],
  ["electrical", /electri|generatrice|panneau de distribution/],
  ["lighting", /eclairage|luminaire/],
  ["plumbing", /plomberie|sanitaire|drain/],
  ["painting", /peinture/],
  ["pest-control", /extermination|parasit|vermine/],
  ["elevator-services", /ascenseur|monte-charge|monte-personne/],
  ["fire-safety", /incendie|gicleur|protection contre le feu/],
  ["access-control", /controle d.acces/],
  ["cameras-surveillance", /camera|videosurveillance/],
  ["security-systems", /alarme intrusion|systeme d.alarme|securite electronique/],
  ["security-personnel", /gardiennage|agents? de securite|surveillance des lieux/],
  ["flooring", /revetement de sol|plancher|couvre-sol|tapis/],
  ["glass-and-windows", /fenetre|fenestration|vitrage|mur-rideau/],
  ["demolition", /demolition/],
  ["environmental-hazardous-materials", /amiante|desamiantage|decontamination|moisissure|matieres dangereuses/],
  ["masonry", /maconnerie|brique/],
  ["waterproofing", /etancheite|impermeabilisation|calfeutrage/],
  ["concrete-and-asphalt", /asphalt|pavage|beton|stationnement/],
  ["waste-removal", /matieres residuelles|dechets|collecte des/],
  ["garage-doors", /portes? de garage|portes? basculantes?|portes? sectionnelles?/],
  ["general-contracting", /refection|renovation|reamenagement|entrepreneur general|agrandissement|mise aux normes|reparation du batiment|travaux de construction/],
  ["property-maintenance", /entretien (general|preventif) des batiments|entretien des immeubles|entretien de batiment/],
];

// Not building-trade work: civil infrastructure, IT, professional services,
// transport/vehicles, and pure goods purchases.
export const EXCLUDE_FR =
  /\bpont|ponceau|\broute|chaussee|egout|aqueduc|\brue\b|\brues\b|trottoir|talus|voirie|emissaire|enrochement|informatique|logiciel|infonuagique|services professionnels|ingenieur|ingenierie|architecte|consultant|expertise|etude|solutions technologiques|recensement|vehicule|camion|autobus|location de|fourniture de (?!.*installation)|achat de|acquisition de/;

export function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** The newest release per tender (ocid) across all weekly files. */
export function latestByOcid(releases: OcdsRelease[]): OcdsRelease[] {
  const latest = new Map<string, OcdsRelease>();
  for (const r of releases) {
    if (!r.ocid || !r.tender) continue;
    const prev = latest.get(r.ocid);
    if (!prev || (r.date ?? "") > (prev.date ?? "")) latest.set(r.ocid, r);
  }
  return [...latest.values()];
}

export function classifySeao(r: OcdsRelease, today: string): string[] {
  const t = r.tender;
  if (!t || t.status !== "active") return [];
  // Open or invited calls only — "direct" is a gré-à-gré award, not a call.
  if (t.procurementMethod !== "open" && t.procurementMethod !== "selective") return [];
  const closing = (t.tenderPeriod?.endDate ?? "").slice(0, 10);
  if (!closing || closing < today) return [];
  if (t.mainProcurementCategory === "goods") return [];
  const codes = (t.items ?? []).map((i) => i.description ?? "").join(" ");
  if (/\bC02\b/.test(codes)) return []; // "Ouvrages de génie civil"
  const title = fold(t.title ?? "");
  if (!title || EXCLUDE_FR.test(title)) return [];
  return RULES_FR.filter(([, p]) => p.test(title)).map(([slug]) => slug).slice(0, 3);
}

// PMRFP regions in Quebec; everything else is province-level "quebec".
const QC_CITIES: [pattern: RegExp, slug: string][] = [
  [/^montreal/, "montreal"],
  [/^laval/, "laval"],
  [/^saint-jerome/, "saint-jerome"],
];

export function regionForSeao(r: OcdsRelease): string {
  const buyer = r.parties?.find((p) => p.roles?.includes("buyer"));
  const city = fold(buyer?.address?.locality ?? "");
  return QC_CITIES.find(([p]) => p.test(city))?.[1] ?? "quebec";
}

export function seaoToRfpInsert(r: OcdsRelease, today: string): TenderInsert | null {
  const t = r.tender;
  const url = t?.documents?.find((d) => d.url?.includes("seao.gouv.qc.ca"))?.url;
  const title = clean(t?.title ?? "");
  if (!t || !url || !title) return null;
  const buyer = clean(r.buyer?.name ?? t.procurementMethodDetails ?? "") || "un organisme public du Québec";
  const buyerCity = r.parties?.find((p) => p.roles?.includes("buyer"))?.address?.locality ?? "";
  const start = (t.tenderPeriod?.startDate ?? "").slice(0, 10);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const categories = (t.items ?? []).map((i) => i.description).filter(Boolean).join(" · ");

  return {
    title: title.length > 180 ? `${title.slice(0, 177)}…` : title,
    slug: `${slugify(title).slice(0, 70)}-qc-${slugify(t.id || r.ocid)}`.replace(/-+/g, "-"),
    summary: `Public tender from ${buyer}${buyerCity ? ` (${buyerCity})` : ""}, posted on SEAO. Documents are in French.`,
    scope: [`Appel d'offres : ${title}`, `Organisme : ${buyer}`, categories && `Catégories : ${categories}`]
      .filter(Boolean)
      .join("\n"),
    requirements: null,
    province: "Quebec",
    deadline: (t.tenderPeriod?.endDate ?? "").slice(0, 10) || null,
    submission_instructions:
      `This is a public Quebec tender issued by ${buyer} (SEAO no. ${t.id ?? r.ocid}). ` +
      "Bids are submitted on SEAO — open the official notice for the documents (in French), addenda and any " +
      "site-visit dates. PMRFP does not manage this bid.",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: url,
    source_notes: `SEAO ${t.id ?? ""} · ${buyer}. ${SEAO_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: !start || start >= yesterday ? `${today}T00:00:00Z` : `${start}T00:00:00Z`,
  };
}

/* ── Past contracts ─────────────────────────────────────────────────────
 * The same weekly files carry award releases: who won a competitive call
 * and for how much. Listed as "Past public contract · Quebec (SEAO)" —
 * never as PMRFP activity — with deadline = award date so every open count,
 * alert and digest ignores them. */
export const SEAO_AWARD_WINDOW_DAYS = 180;

function firstAward(r: OcdsRelease): OcdsAward | null {
  return (r.awards ?? []).find((a) => a.suppliers?.[0]?.name && a.date) ?? null;
}

export function classifySeaoAward(r: OcdsRelease, today: string): string[] {
  const t = r.tender;
  if (!t || t.status !== "complete") return [];
  // Competitive calls only — a gré-à-gré award isn't work anyone could bid on.
  if (t.procurementMethod !== "open" && t.procurementMethod !== "selective") return [];
  if (t.mainProcurementCategory === "goods") return [];
  const codes = (t.items ?? []).map((i) => i.description ?? "").join(" ");
  if (/\bC02\b/.test(codes)) return [];
  const award = firstAward(r);
  const awarded = (award?.date ?? "").slice(0, 10);
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - SEAO_AWARD_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (!award || !awarded || awarded > today || awarded < cutoff) return [];
  if ((award.value?.currency ?? "CAD") !== "CAD") return [];
  const title = fold(t.title ?? "");
  if (!title || EXCLUDE_FR.test(title)) return [];
  return RULES_FR.filter(([, p]) => p.test(title)).map(([slug]) => slug).slice(0, 3);
}

export function seaoAwardToRfpInsert(r: OcdsRelease, _today?: string): TenderInsert | null {
  const t = r.tender;
  const award = firstAward(r);
  const url = t?.documents?.find((d) => d.url?.includes("seao.gouv.qc.ca"))?.url;
  const title = clean(t?.title ?? "");
  if (!t || !award || !url || !title) return null;
  const supplier = clean(award.suppliers?.[0]?.name ?? "");
  const awarded = (award.date ?? "").slice(0, 10);
  const amount = award.value?.amount ?? 0;
  const buyer = clean(r.buyer?.name ?? "") || "un organisme public du Québec";
  const value = amount > 0 ? `$${Math.round(amount).toLocaleString("en-CA")} CAD` : null;
  const when = new Date(`${awarded}T00:00:00Z`).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const headline = `Awarded ${when} to ${supplier}${value ? ` — ${value}` : " — value not disclosed"}.`;
  return {
    title: title.length > 180 ? `${title.slice(0, 177)}…` : title,
    slug: `${slugify(title).slice(0, 60)}-qca-${slugify(t.id || r.ocid)}`.replace(/-+/g, "-"),
    summary: `${headline} Past public contract from ${buyer}.`,
    scope: [headline, `Appel d'offres : ${title}`, `Organisme : ${buyer}`].join("\n"),
    requirements: null,
    province: "Quebec",
    deadline: awarded,
    submission_instructions:
      "This contract has already been awarded — it's listed so trades can see what this kind of work sells " +
      "for and who wins it. It did not go through PMRFP.",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: `${url}#award`,
    source_notes: `SEAO award ${t.id ?? ""} · ${buyer} · ${supplier}. ${SEAO_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: `${awarded}T00:00:00Z`,
  };
}

const SEAO_UA = "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)";
const SEAO_ALLOWED_PREFIX = "https://www.donneesquebec.ca/recherche/dataset/";

let lastSeaoHit = 0;
/** Tests only: forget the last request time. */
export function resetSeaoPacing(): void {
  lastSeaoHit = 0;
}
/**
 * Every request this importer makes: dataset-page or /download/ URLs only
 * (never the API, never a query string), one at a time, at least
 * SEAO_CRAWL_DELAY_S apart.
 */
export async function seaoGet(url: string, accept: string): Promise<Response> {
  if (!url.startsWith(SEAO_ALLOWED_PREFIX) || url.includes("?") || /\/api\//.test(url)) {
    throw new Error(`Not an allowed Données Québec URL: ${url}`);
  }
  const wait = lastSeaoHit + SEAO_CRAWL_DELAY_S * 1000 - Date.now();
  if (lastSeaoHit && wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSeaoHit = Date.now();
  return fetch(url, { cache: "no-store", headers: { "User-Agent": SEAO_UA, Accept: accept } });
}

/** The newest weekly "hebdo" /download/ URLs, newest first, from a file list. */
export function newestWeekly(files: SeaoFile[], weeks = SEAO_WEEKS): string[] {
  return files
    .filter((f) => f.kind === "hebdo")
    .sort((a, b) => b.from.localeCompare(a.from))
    .slice(0, weeks)
    .map((f) => f.url);
}

/**
 * URLs of the most recent weekly files, newest first: the /download/ links
 * on the dataset page, merged with the saved list (seao-files.ts) when the
 * page can't be read. A bot challenge is never solved or worked around.
 */
export async function seaoWeeklyUrls(weeks = SEAO_WEEKS): Promise<string[]> {
  let live: SeaoFile[] = [];
  try {
    const res = await seaoGet(SEAO_DATASET_PAGE, "text/html");
    if (res.status === 200) live = seaoFilesFromPage(await res.text());
  } catch {
    // Unreachable page: the saved list below.
  }
  const names = new Set(live.map((f) => f.name));
  return newestWeekly([...live, ...savedSeaoFiles().filter((f) => !names.has(f.name))], weeks);
}

/**
 * Reads the recent weekly files one at a time (each ~17 MB), 10 s apart,
 * and keeps only tender-bearing releases, so memory stays flat.
 */
export async function fetchSeaoReleases(): Promise<OcdsRelease[]> {
  const kept: OcdsRelease[] = [];
  for (const url of await seaoWeeklyUrls()) {
    const res = await seaoGet(url, "application/json");
    if (!res.ok) throw new Error(`SEAO weekly fetch failed: HTTP ${res.status}`);
    const { releases } = (await res.json()) as { releases: OcdsRelease[] };
    for (const r of releases) {
      if (r.tender && (r.tender.tenderPeriod?.endDate || r.awards?.length)) {
        kept.push({ ocid: r.ocid, date: r.date, parties: r.parties, buyer: r.buyer, tender: r.tender, awards: r.awards });
      }
    }
  }
  return latestByOcid(kept);
}
