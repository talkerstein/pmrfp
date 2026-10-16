import { describe, expect, it } from "vitest";
import { CREDITS, creditFor, localizeCredit, localizeCredits } from "@/lib/data-credits";
import { PUBLIC_TENDER_SOURCES } from "@/lib/tenders/sources";
import { HISTORY_SOURCES } from "@/lib/contract-history/registry";
import { LICENSES } from "@/lib/major-projects/sources";
import { WAVE2_LICENSES } from "@/lib/major-projects/sources-wave2";
import { MANUAL_LICENSE } from "@/lib/major-projects/research-csv";
import { TORONTO_ATTRIBUTION } from "@/lib/data/toronto-awards";

/** Every place a source's credit is registered: tender labels, award history, major projects. */
const registered: { key: string; credit: string }[] = [
  ...PUBLIC_TENDER_SOURCES.map((s) => ({ key: `tender:${s.key}${s.past ? ":past" : ""}${s.closedArchive ? ":closed" : ""}`, credit: s.attribution })),
  ...HISTORY_SOURCES.map((s) => ({ key: `history:${s.key}`, credit: s.attribution })),
  ...Object.entries(LICENSES).map(([k, v]) => ({ key: `major:${k}`, credit: v })),
  ...Object.entries(WAVE2_LICENSES).map(([k, v]) => ({ key: `major2:${k}`, credit: v })),
  { key: "major:manual", credit: MANUAL_LICENSE },
  { key: "toronto-awards-pages", credit: TORONTO_ATTRIBUTION },
];

describe("source credits (licence attribution)", () => {
  it.each(registered)("$key has a credit in en, fr and es", ({ credit }) => {
    expect(credit.trim()).not.toBe("");
    const c = creditFor(credit);
    expect(c, `no CREDITS entry for: ${credit}`).not.toBeNull();
    for (const lang of ["en", "fr", "es"] as const) expect(c![lang].trim().length).toBeGreaterThan(10);
    // A real translation, not the English copied over.
    expect(c!.fr).not.toBe(c!.en);
    expect(c!.es).not.toBe(c!.en);
  });

  it("covers a known number of sources (a new source must add its credit)", () => {
    expect(registered.length).toBeGreaterThanOrEqual(40);
  });

  it("names the licence in every language where the English names one", () => {
    for (const c of CREDITS) {
      for (const lic of ["CC BY 4.0", "CC0", "Open Government Licen", "public domain"]) {
        if (!c.en.includes(lic)) continue;
        if (lic === "public domain") {
          expect(c.fr).toMatch(/domaine public/);
          expect(c.es).toMatch(/dominio público/);
        } else if (lic === "Open Government Licen") {
          expect(c.fr).toMatch(/Licence du gouvernement ouvert/);
          expect(c.es).toMatch(/Open Government Licen/);
        } else {
          expect(c.fr).toContain(lic);
          expect(c.es).toContain(lic);
        }
      }
    }
  });

  it("localizes by page language and never drops an unknown credit", () => {
    const ogl = "Contains information licensed under the Open Government Licence – Canada.";
    expect(localizeCredit(ogl, "fr")).toBe("Contient des informations visées par la Licence du gouvernement ouvert – Canada.");
    expect(localizeCredit(ogl, "en")).toBe(ogl);
    expect(localizeCredit("Some new credit.", "fr")).toBe("Some new credit.");
    expect(localizeCredit(null, "fr")).toBe("");
    expect(localizeCredits([ogl, ogl, null, "x"], "es")).toEqual([creditFor(ogl)!.es, "x"]);
  });

  it("shows the Montréal credit in English on English pages (stored in French)", () => {
    const stored = "Source : Ville de Montréal, portail de données ouvertes (donnees.montreal.ca), CC BY 4.0.";
    expect(localizeCredit(stored, "en")).toMatch(/^Source: Ville de Montréal open data portal/);
    expect(localizeCredit(stored, "fr")).toBe(stored);
  });
});
