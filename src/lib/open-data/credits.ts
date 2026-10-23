/**
 * The open-data credits for the About page's "Where the public tenders come
 * from" list: one entry per publisher, each with the licence's own credit
 * line verbatim (the attribution wording is the licence's, so it is not
 * translated), and a short description per language.
 */
import { ARCGIS_CITIES } from "./arcgis-permits";
import { OGL_CALGARY, OGL_VANCOUVER } from "./attribution";

type Lang = "en" | "fr" | "es";
interface Entry {
  name: string;
  what: string;
  licence: string;
}

const WHAT = {
  vancouver: { en: "Awarded contracts and building permits", fr: "Contrats octroyés et permis de construction", es: "Contratos adjudicados y permisos de construcción" },
  calgary: { en: "Trade permit activity (HVAC, electrical, plumbing)", fr: "Activité des permis de métier (CVC, électricité, plomberie)", es: "Actividad de permisos de oficios (climatización, electricidad, plomería)" },
  permits: { en: "Building permits", fr: "Permis de construction", es: "Permisos de construcción" },
  toronto: { en: "Non-competitive contracts and planned procurements", fr: "Contrats sans concurrence et achats prévus", es: "Contratos sin competencia y compras planificadas" },
} as const;

/** Entries to append to the About page's source list. */
export function openDataAboutSources(lang: Lang): Entry[] {
  return [
    { name: "City of Vancouver", what: WHAT.vancouver[lang], licence: OGL_VANCOUVER },
    { name: "City of Calgary", what: WHAT.calgary[lang], licence: OGL_CALGARY },
    ...ARCGIS_CITIES.filter((c) => c.enabled).map((c) => ({ name: `City of ${c.city}`, what: WHAT.permits[lang], licence: c.attribution })),
  ];
}
