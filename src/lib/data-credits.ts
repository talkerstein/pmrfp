/**
 * Source credits (licence attribution statements) in every language.
 *
 * Importers store the English credit on each row (rfp_posts.source_notes,
 * award_history.attribution, major_projects.license) and the source
 * registries carry it as `attribution` / `license`. Pages render it through
 * localizeCredit(), so a French or Spanish page shows the credit in its own
 * language. The licences (OGL-Canada and the provincial/municipal OGLs,
 * CC BY 4.0, city terms of use) require the credit wherever the data is
 * shown; test/unit/data-credits.test.ts fails if any registered source's
 * credit is missing here or lacks a French or Spanish version.
 *
 * Pure: its one import (the city-flow config) is pure data, so it's safe anywhere.
 */
import { cityCredits } from "@/lib/tenders/city-sources";

export type CreditLang = "en" | "fr" | "es";
export interface Credit {
  /** The text importers store, when it isn't the English credit itself. */
  stored?: string;
  en: string;
  fr: string;
  es: string;
}

export const CREDITS: readonly Credit[] = [
  // ---- Open Government Licences (official attribution statements)
  {
    en: "Contains information licensed under the Open Government Licence – Canada.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Canada.",
    es: "Contiene información bajo la Open Government Licence – Canada (Licencia de Gobierno Abierto – Canadá).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – Toronto.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Toronto (Open Government Licence – Toronto).",
    es: "Contiene información bajo la Open Government Licence – Toronto (Licencia de Gobierno Abierto – Toronto).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – Nova Scotia.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Nouvelle-Écosse (Open Government Licence – Nova Scotia).",
    es: "Contiene información bajo la Open Government Licence – Nova Scotia (Licencia de Gobierno Abierto – Nueva Escocia).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – Yukon.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Yukon.",
    es: "Contiene información bajo la Open Government Licence – Yukon (Licencia de Gobierno Abierto – Yukón).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – British Columbia.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Colombie-Britannique (Open Government Licence – British Columbia).",
    es: "Contiene información bajo la Open Government Licence – British Columbia (Licencia de Gobierno Abierto – Columbia Británica).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – Ontario.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Ontario.",
    es: "Contiene información bajo la Open Government Licence – Ontario (Licencia de Gobierno Abierto – Ontario).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – City of Calgary.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Ville de Calgary (Open Government Licence – City of Calgary).",
    es: "Contiene información bajo la Open Government Licence – City of Calgary (Licencia de Gobierno Abierto – Ciudad de Calgary).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – City of Edmonton.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Ville d'Edmonton (Open Government Licence – City of Edmonton).",
    es: "Contiene información bajo la Open Government Licence – City of Edmonton (Licencia de Gobierno Abierto – Ciudad de Edmonton).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – City of Ottawa.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Ville d'Ottawa (Open Government Licence – City of Ottawa).",
    es: "Contiene información bajo la Open Government Licence – City of Ottawa (Licencia de Gobierno Abierto – Ciudad de Ottawa).",
  },
  {
    en: "Contains information licenced under the Open Government Licence – Halifax.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Halifax (Open Government Licence – Halifax).",
    es: "Contiene información bajo la Open Government Licence – Halifax (Licencia de Gobierno Abierto – Halifax).",
  },
  {
    en: "Contains information licensed under the Open Government License – City of Surrey.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Ville de Surrey (Open Government License – City of Surrey).",
    es: "Contiene información bajo la Open Government License – City of Surrey (Licencia de Gobierno Abierto – Ciudad de Surrey).",
  },
  {
    en: "Contains public sector information made available under The Regional Municipality of York's Open Data Licence.",
    fr: "Contient des informations du secteur public diffusées en vertu de la licence de données ouvertes de la Municipalité régionale de York (The Regional Municipality of York's Open Data Licence).",
    es: "Contiene información del sector público publicada bajo la licencia de datos abiertos de la Municipalidad Regional de York (The Regional Municipality of York's Open Data Licence).",
  },
  // ---- Toronto–Kitchener corridor permits and applications (2026-10-18)
  {
    en: "Contains information licensed under the Open Government Licence – The Corporation of the City of Kitchener.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – The Corporation of the City of Kitchener (Open Government Licence – City of Kitchener).",
    es: "Contiene información bajo la Open Government Licence – The Corporation of the City of Kitchener (Licencia de Gobierno Abierto – Ciudad de Kitchener).",
  },
  {
    en: "Contains information provided by the City of Waterloo under licence.",
    fr: "Contient des informations fournies par la Ville de Waterloo en vertu d'une licence (City of Waterloo Open Data Licence).",
    es: "Contiene información proporcionada por la Ciudad de Waterloo bajo licencia (City of Waterloo Open Data Licence).",
  },
  {
    en: "Contains information licensed under the Open Government License – City of Cambridge.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Ville de Cambridge (Open Government License – City of Cambridge).",
    es: "Contiene información bajo la Open Government License – City of Cambridge (Licencia de Gobierno Abierto – Ciudad de Cambridge).",
  },
  {
    en: "Source: City of Burlington Open Data, used under the City of Burlington Open Data Terms of Use (https://opendata.burlington.ca/opendata-terms-of-use/City%20of%20Burlington%20-%20Open%20Data%20Terms%20of%20Use.pdf).",
    fr: "Source : données ouvertes de la Ville de Burlington, utilisées conformément aux conditions d'utilisation des données ouvertes de la Ville de Burlington (https://opendata.burlington.ca/opendata-terms-of-use/City%20of%20Burlington%20-%20Open%20Data%20Terms%20of%20Use.pdf).",
    es: "Fuente: datos abiertos de la Ciudad de Burlington, usados conforme a los términos de uso de datos abiertos de la Ciudad de Burlington (https://opendata.burlington.ca/opendata-terms-of-use/City%20of%20Burlington%20-%20Open%20Data%20Terms%20of%20Use.pdf).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – Town of Oakville.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Ville d'Oakville (Open Government Licence – Town of Oakville).",
    es: "Contiene información bajo la Open Government Licence – Town of Oakville (Licencia de Gobierno Abierto – Ciudad de Oakville).",
  },
  {
    en: "Source: City of Brampton Open Data (geohub.brampton.ca), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).",
    fr: "Source : données ouvertes de la Ville de Brampton (geohub.brampton.ca), sous licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/deed.fr).",
    es: "Fuente: datos abiertos de la Ciudad de Brampton (geohub.brampton.ca), con licencia CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/deed.es).",
  },
  {
    en: "Contains public sector Data made available under the City of Hamilton's Open Data Licence.",
    fr: "Contient des données du secteur public diffusées en vertu de la licence de données ouvertes de la Ville de Hamilton (City of Hamilton's Open Data Licence).",
    es: "Contiene datos del sector público publicados bajo la licencia de datos abiertos de la Ciudad de Hamilton (City of Hamilton's Open Data Licence).",
  },
  {
    en: "Contains information from the Government of Manitoba, licensed under the OpenMB Information and Data Use License (Manitoba.ca/OpenMB).",
    fr: "Contient des informations du gouvernement du Manitoba, utilisées en vertu de la licence d'utilisation de l'information et des données OpenMB (OpenMB Information and Data Use License, Manitoba.ca/OpenMB).",
    es: "Contiene información del Gobierno de Manitoba, bajo la licencia de uso de información y datos OpenMB (OpenMB Information and Data Use License, Manitoba.ca/OpenMB).",
  },
  // ---- CC BY 4.0 (Québec)
  {
    en: "Source: Système électronique d'appel d'offres (SEAO), Secrétariat du Conseil du trésor du Québec — Données Québec, CC BY 4.0.",
    fr: "Source : Système électronique d'appel d'offres (SEAO), Secrétariat du Conseil du trésor du Québec — Données Québec, licence CC BY 4.0.",
    es: "Fuente: Système électronique d'appel d'offres (SEAO), Secrétariat du Conseil du trésor du Québec — Données Québec, licencia CC BY 4.0.",
  },
  {
    stored: "Source : Ville de Montréal, portail de données ouvertes (donnees.montreal.ca), CC BY 4.0.",
    en: "Source: Ville de Montréal open data portal (donnees.montreal.ca), CC BY 4.0.",
    fr: "Source : Ville de Montréal, portail de données ouvertes (donnees.montreal.ca), CC BY 4.0.",
    es: "Fuente: Ville de Montréal, portal de datos abiertos (donnees.montreal.ca), licencia CC BY 4.0.",
  },
  {
    en: "Source: Secrétariat du Conseil du trésor du Québec, « Tableau de bord des projets d'infrastructures de 20 M$ et plus », Données Québec, licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Labels translated and summarised by PMRFP.",
    fr: "Source : Secrétariat du Conseil du trésor du Québec, « Tableau de bord des projets d'infrastructures de 20 M$ et plus », Données Québec, licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Libellés traduits et résumés par PMRFP.",
    es: "Fuente: Secrétariat du Conseil du trésor du Québec, « Tableau de bord des projets d'infrastructures de 20 M$ et plus », Données Québec, licencia CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Etiquetas traducidas y resumidas por PMRFP.",
  },
  // ---- PMRFP's own research summaries (major projects researched by hand)
  {
    en: "PMRFP research summary of the public sources linked on this page. Facts belong to their publishers; check them before you rely on them.",
    fr: "Résumé de recherche de PMRFP à partir des sources publiques liées sur cette page. Les faits appartiennent à leurs éditeurs; vérifiez-les avant de vous y fier.",
    es: "Resumen de investigación de PMRFP a partir de las fuentes públicas enlazadas en esta página. Los datos pertenecen a sus editores; verifíquelos antes de confiar en ellos.",
  },
  // ---- City terms of use
  {
    en: "Source: City of Mississauga Open Data, used under the City of Mississauga Terms of Use (http://www5.mississauga.ca/research_catalogue/CityofMississauga_TermsofUse.pdf).",
    fr: "Source : données ouvertes de la Ville de Mississauga, utilisées conformément aux conditions d'utilisation de la Ville de Mississauga (http://www5.mississauga.ca/research_catalogue/CityofMississauga_TermsofUse.pdf).",
    es: "Fuente: datos abiertos de la Ciudad de Mississauga, usados conforme a los términos de uso de la Ciudad de Mississauga (http://www5.mississauga.ca/research_catalogue/CityofMississauga_TermsofUse.pdf).",
  },
  // ---- Canadian buyer websites (public notices, credited)
  {
    en: "Source: Ontario Northland Transportation Commission (ontarionorthland.ca) — public procurement notice.",
    fr: "Source : Commission de transport Ontario Northland (ontarionorthland.ca) — avis public d'approvisionnement.",
    es: "Fuente: Ontario Northland Transportation Commission (ontarionorthland.ca) — aviso público de contratación.",
  },
  {
    en: "Source: District of Saanich bid opportunities (saanich.ca) — public procurement notice.",
    fr: "Source : occasions de soumission du District de Saanich (saanich.ca) — avis public d'approvisionnement.",
    es: "Fuente: oportunidades de licitación del Distrito de Saanich (saanich.ca) — aviso público de contratación.",
  },
  {
    en: "Source: Fraser Valley Regional District tenders & RFPs (fvrd.ca) — public procurement notice.",
    fr: "Source : appels d'offres du District régional de Fraser Valley (fvrd.ca) — avis public d'approvisionnement.",
    es: "Fuente: licitaciones y solicitudes de propuestas del Distrito Regional de Fraser Valley (fvrd.ca) — aviso público de contratación.",
  },
  {
    en: "Source: City of Portage la Prairie tenders and proposals (city-plap.com) — public tender notice.",
    fr: "Source : appels d'offres et propositions de la Ville de Portage la Prairie (city-plap.com) — avis public d'appel d'offres.",
    es: "Fuente: licitaciones y propuestas de la Ciudad de Portage la Prairie (city-plap.com) — aviso público de licitación.",
  },
  {
    en: "Source: Township of Guelph/Eramosa bids and tenders (get.on.ca) — public tender notice.",
    fr: "Source : appels d'offres du Canton de Guelph/Eramosa (get.on.ca) — avis public d'appel d'offres.",
    es: "Fuente: licitaciones del Municipio de Guelph/Eramosa (get.on.ca) — aviso público de licitación.",
  },
  {
    en: "Source: SaskTenders (sasktenders.ca), Government of Saskatchewan — public competition notice.",
    fr: "Source : SaskTenders (sasktenders.ca), gouvernement de la Saskatchewan — avis public de concours.",
    es: "Fuente: SaskTenders (sasktenders.ca), Gobierno de Saskatchewan — aviso público de concurso.",
  },
  // ---- Buyers who said yes to being listed (lib/tenders/city-sources, each with its fr/es copy)
  ...cityCredits(),
  // ---- United States
  {
    en: "Source: SAM.gov Contract Opportunities, U.S. General Services Administration (U.S. federal government data, public domain).",
    fr: "Source : SAM.gov Contract Opportunities, General Services Administration des États-Unis (données du gouvernement fédéral américain, domaine public).",
    es: "Fuente: SAM.gov Contract Opportunities, Administración de Servicios Generales de EE. UU. (datos del gobierno federal de EE. UU., dominio público).",
  },
  {
    en: "Source: The City Record, City of New York — NYC Open Data (Current Solicitations).",
    fr: "Source : The City Record, Ville de New York — NYC Open Data (Current Solicitations).",
    es: "Fuente: The City Record, Ciudad de Nueva York — NYC Open Data (Current Solicitations).",
  },
  {
    en: "Source: Florida Vendor Bid System, MyFloridaMarketPlace — State of Florida public solicitation notice.",
    fr: "Source : Florida Vendor Bid System, MyFloridaMarketPlace — avis public de sollicitation de l'État de la Floride.",
    es: "Fuente: Florida Vendor Bid System, MyFloridaMarketPlace — aviso público de convocatoria del Estado de Florida.",
  },
  {
    en: "Source: State of Delaware Open Data — Open Bids (data.delaware.gov), public solicitation notice.",
    fr: "Source : données ouvertes de l'État du Delaware — Open Bids (data.delaware.gov), avis public de sollicitation.",
    es: "Fuente: datos abiertos del Estado de Delaware — Open Bids (data.delaware.gov), aviso público de convocatoria.",
  },
  {
    en: "Source: Los Angeles County open solicitations list (camisvr.co.la.ca.us/LACoBids) — public solicitation notice.",
    fr: "Source : liste des sollicitations ouvertes du comté de Los Angeles (camisvr.co.la.ca.us/LACoBids) — avis public de sollicitation.",
    es: "Fuente: lista de convocatorias abiertas del Condado de Los Ángeles (camisvr.co.la.ca.us/LACoBids) — aviso público de convocatoria.",
  },
  {
    en: "Source: North Carolina electronic Vendor Portal (eVP), NC Department of Administration — public solicitation notice.",
    fr: "Source : North Carolina electronic Vendor Portal (eVP), département de l'Administration de la Caroline du Nord — avis public de sollicitation.",
    es: "Fuente: North Carolina electronic Vendor Portal (eVP), Departamento de Administración de Carolina del Norte — aviso público de convocatoria.",
  },
  {
    en: "Source: University of North Carolina System Office, Opportunities to Do Business with the Universities (northcarolina.edu) — public solicitation notice.",
    fr: "Source : bureau du système de l'Université de la Caroline du Nord, Opportunities to Do Business with the Universities (northcarolina.edu) — avis public de sollicitation.",
    es: "Fuente: Oficina del Sistema de la Universidad de Carolina del Norte, Opportunities to Do Business with the Universities (northcarolina.edu) — aviso público de convocatoria.",
  },
  {
    en: "Source: South Carolina Business Opportunities (SCBO), SC Division of Procurement Services — public advertisement.",
    fr: "Source : South Carolina Business Opportunities (SCBO), division des services d'approvisionnement de la Caroline du Sud — avis public.",
    es: "Fuente: South Carolina Business Opportunities (SCBO), División de Servicios de Adquisiciones de Carolina del Sur — anuncio público.",
  },
  {
    en: "Source: City of Los Angeles Open Data (data.lacity.org) — RAMP Open Bid Opportunities, CC0 1.0 public domain.",
    fr: "Source : données ouvertes de la Ville de Los Angeles (data.lacity.org) — RAMP Open Bid Opportunities, CC0 1.0 domaine public.",
    es: "Fuente: datos abiertos de la Ciudad de Los Ángeles (data.lacity.org) — RAMP Open Bid Opportunities, CC0 1.0 dominio público.",
  },
  {
    en: "Source: COMMBUYS (Commonwealth of Massachusetts) — public bid notice",
    fr: "Source : COMMBUYS (Commonwealth du Massachusetts) — avis public d'appel d'offres",
    es: "Fuente: COMMBUYS (Commonwealth de Massachusetts) — aviso público de licitación",
  },
  {
    en: "Source: OregonBuys (State of Oregon) — public bid notice",
    fr: "Source : OregonBuys (État de l'Oregon) — avis public d'appel d'offres",
    es: "Fuente: OregonBuys (Estado de Oregón) — aviso público de licitación",
  },
  {
    en: "Source: Nevada ePro (State of Nevada) — public bid notice",
    fr: "Source : Nevada ePro (État du Nevada) — avis public d'appel d'offres",
    es: "Fuente: Nevada ePro (Estado de Nevada) — aviso público de licitación",
  },
  {
    en: "Source: BidBuy (State of Illinois) — public bid notice",
    fr: "Source : BidBuy (État de l'Illinois) — avis public d'appel d'offres",
    es: "Fuente: BidBuy (Estado de Illinois) — aviso público de licitación",
  },
  {
    en: "Source: NJSTART (State of New Jersey) — public bid notice",
    fr: "Source : NJSTART (État du New Jersey) — avis public d'appel d'offres",
    es: "Fuente: NJSTART (Estado de Nueva Jersey) — aviso público de licitación",
  },
  {
    en: "Source: ARBuy (State of Arkansas) — public bid notice",
    fr: "Source : ARBuy (État de l'Arkansas) — avis public d'appel d'offres",
    es: "Fuente: ARBuy (Estado de Arkansas) — aviso público de licitación",
  },
  {
    en: "Source: USAspending.gov, U.S. Department of the Treasury (federal contract award data, public domain).",
    fr: "Source : USAspending.gov, département du Trésor des États-Unis (données fédérales sur l'octroi de contrats, domaine public).",
    es: "Fuente: USAspending.gov, Departamento del Tesoro de EE. UU. (datos federales de adjudicación de contratos, dominio público).",
  },
  {
    en: "Source: Texas Department of Transportation, Bid Tabulations (data.texas.gov). Bid totals as read; not a statement that a contract was awarded.",
    fr: "Source : Texas Department of Transportation, Bid Tabulations (data.texas.gov). Totaux des soumissions tels que lus; n'indique pas qu'un contrat a été octroyé.",
    es: "Fuente: Texas Department of Transportation, Bid Tabulations (data.texas.gov). Totales de las ofertas tal como se leyeron; no indica que se haya adjudicado un contrato.",
  },
  // ---- Open data batch 1 (2026-10-23): Vancouver and the ArcGIS permit pilot cities
  {
    en: "Contains information licensed under the Open Government Licence – Vancouver.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Vancouver (Open Government Licence – Vancouver).",
    es: "Contiene información bajo la Open Government Licence – Vancouver (Licencia de Gobierno Abierto – Vancouver).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – Maple Ridge.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Maple Ridge (Open Government Licence – Maple Ridge).",
    es: "Contiene información bajo la Open Government Licence – Maple Ridge (Licencia de Gobierno Abierto – Maple Ridge).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – City of Airdrie.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Ville d'Airdrie (Open Government Licence – City of Airdrie).",
    es: "Contiene información bajo la Open Government Licence – City of Airdrie (Licencia de Gobierno Abierto – Ciudad de Airdrie).",
  },
  {
    en: "Contains information licensed under the Open Government Licence – City of Grande Prairie.",
    fr: "Contient des informations visées par la Licence du gouvernement ouvert – Ville de Grande Prairie (Open Government Licence – City of Grande Prairie).",
    es: "Contiene información bajo la Open Government Licence – City of Grande Prairie (Licencia de Gobierno Abierto – Ciudad de Grande Prairie).",
  },
];

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const BY_EN = new Map(CREDITS.flatMap((c) => [[norm(c.en), c] as const, ...(c.stored ? [[norm(c.stored), c] as const] : [])]));

/** The credit in every language, or null when the stored text isn't registered. */
export function creditFor(text: string | null | undefined): Credit | null {
  return text ? BY_EN.get(norm(text)) ?? null : null;
}

/**
 * A stored English credit in the page's language. Unknown text is returned
 * as stored (never dropped: showing the English credit beats showing none).
 */
export function localizeCredit(text: string | null | undefined, lang: string): string {
  if (!text) return "";
  const c = creditFor(text);
  if (!c) return text;
  return lang === "fr" ? c.fr : lang === "es" ? c.es : c.en;
}

/** Several credits, localized and de-duplicated, in first-seen order. */
export function localizeCredits(texts: Iterable<string | null | undefined>, lang: string): string[] {
  return [...new Set([...texts].filter((t): t is string => !!t).map((t) => localizeCredit(t, lang)))];
}
