import { describe, expect, it } from "vitest";
import { classifySeao, latestByOcid, regionForSeao, seaoToRfpInsert, type OcdsRelease } from "@/lib/tenders/seao";
import { publicTenderSource } from "@/lib/tenders/sources";

const TODAY = "2026-09-23";
const rel = (title: string, over: Partial<NonNullable<OcdsRelease["tender"]>> = {}, city = "Montréal"): OcdsRelease => ({
  ocid: "ocds-ec9k95-1",
  date: "2026-09-15T10:00:00-04:00",
  parties: [{ name: "Ville de Montréal", roles: ["buyer"], address: { locality: city } }],
  buyer: { name: "Ville de Montréal" },
  tender: {
    id: "26-12345",
    title,
    status: "active",
    procurementMethod: "open",
    mainProcurementCategory: "works",
    items: [{ description: "C01 - Bâtiments" }],
    tenderPeriod: { startDate: "2026-09-10T00:00:00-04:00", endDate: "2026-10-13T14:00:00-04:00" },
    documents: [{ url: "https://seao.gouv.qc.ca/avis-resultat-recherche/consulter?ItemId=abc" }],
    ...over,
  },
});

describe("SEAO", () => {
  it("matches French trade vocabulary", () => {
    expect(classifySeao(rel("Déneigement du secteur nord 2026-2029"), TODAY)).toEqual(["snow-removal"]);
    expect(classifySeao(rel("Réfection des toitures Aile P - Hôpital Notre-Dame"), TODAY)).toContain("roofing");
    expect(classifySeao(rel("Mise à niveau CVAC de la cuisine"), TODAY)).toEqual(["hvac"]);
  });
  it("doesn't read the Chaudière-Appalaches region as a boiler", () => {
    expect(classifySeao(rel("Contrat à exécution sur demande - Serrurerie - Chaudière-Appalaches"), TODAY)).toEqual(["locksmith"]);
  });
  it("skips civil works, goods, direct awards, engineering and closed calls", () => {
    expect(classifySeao(rel("Réfection de l'émissaire", { items: [{ description: "C02 - Ouvrages de génie civil" }] }), TODAY)).toEqual([]);
    expect(classifySeao(rel("Fourniture d'articles de plomberie", { mainProcurementCategory: "goods" }), TODAY)).toEqual([]);
    expect(classifySeao(rel("Déneigement", { procurementMethod: "direct" }), TODAY)).toEqual([]);
    expect(classifySeao(rel("Services d'ingénierie mécanique-électrique"), TODAY)).toEqual([]);
    expect(classifySeao(rel("Déneigement", { tenderPeriod: { endDate: "2026-09-01T00:00:00-04:00" } }), TODAY)).toEqual([]);
  });
  it("keeps only the newest release per tender", () => {
    const a = rel("Déneigement");
    const b = { ...rel("Déneigement (addenda 1)"), date: "2026-09-18T10:00:00-04:00" };
    expect(latestByOcid([a, b]).map((r) => r.tender?.title)).toEqual(["Déneigement (addenda 1)"]);
  });
  it("maps region, link and attribution", () => {
    expect(regionForSeao(rel("x"))).toBe("montreal");
    expect(regionForSeao(rel("x", {}, "Rimouski"))).toBe("quebec");
    const ins = seaoToRfpInsert(rel("Déneigement du secteur nord"), TODAY)!;
    expect(ins.source_url).toContain("seao.gouv.qc.ca");
    expect(ins.source_notes).toContain("CC BY 4.0");
    expect(ins.deadline).toBe("2026-10-13");
    expect(publicTenderSource(ins.slug).key).toBe("seao");
  });
});
