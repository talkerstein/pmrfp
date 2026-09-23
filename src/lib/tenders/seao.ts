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

export const SEAO_PACKAGE_URL =
  "https://www.donneesquebec.ca/recherche/api/3/action/package_show?id=systeme-electronique-dappel-doffres-seao";
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
export interface OcdsRelease {
  ocid: string;
  date?: string;
  tag?: string[];
  parties?: OcdsParty[];
  buyer?: { name?: string };
  tender?: OcdsTender;
}

// French trade vocabulary → PMRFP category slugs. Accents are stripped first.
const RULES_FR: [slug: string, pattern: RegExp][] = [
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
const EXCLUDE_FR =
  /\bpont|ponceau|\broute|chaussee|egout|aqueduc|\brue\b|\brues\b|trottoir|talus|voirie|emissaire|enrochement|informatique|logiciel|infonuagique|services professionnels|ingenieur|ingenierie|architecte|consultant|expertise|etude|solutions technologiques|recensement|vehicule|camion|autobus|location de|fourniture de (?!.*installation)|achat de|acquisition de/;

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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

/** URLs of the most recent weekly files, newest first. */
export async function seaoWeeklyUrls(weeks = SEAO_WEEKS): Promise<string[]> {
  const res = await fetch(SEAO_PACKAGE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Données Québec package lookup failed: HTTP ${res.status}`);
  const pkg = (await res.json()) as { result: { resources: { name?: string; url: string }[] } };
  return pkg.result.resources
    .filter((r) => /^hebdo_\d{8}_\d{8}\.json$/.test(r.name ?? ""))
    .sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""))
    .slice(0, weeks)
    .map((r) => r.url);
}

/**
 * Reads the recent weekly files one at a time (each ~17 MB) and keeps only
 * tender-bearing releases, so memory stays flat.
 */
export async function fetchSeaoReleases(): Promise<OcdsRelease[]> {
  const kept: OcdsRelease[] = [];
  for (const url of await seaoWeeklyUrls()) {
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" } });
    if (!res.ok) throw new Error(`SEAO weekly fetch failed: HTTP ${res.status}`);
    const { releases } = (await res.json()) as { releases: OcdsRelease[] };
    for (const r of releases) {
      if (r.tender?.tenderPeriod?.endDate) {
        kept.push({ ocid: r.ocid, date: r.date, parties: r.parties, buyer: r.buyer, tender: r.tender });
      }
    }
  }
  return latestByOcid(kept);
}
