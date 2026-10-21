import { describe, expect, it } from "vitest";
import { composeRfp } from "@/lib/rfp-writer/compose";
import { composeRfpFr } from "@/lib/rfp-writer/compose-fr";
import { composeRfpEs } from "@/lib/rfp-writer/compose-es";
import { RFP_TEMPLATES } from "@/lib/seo/rfp-templates";
import {
  blankInventedFacts,
  countBlanks,
  defaultDeadlineDays,
  ensureQuebecLicence,
  fillPercentBlanks,
  finalizeDraft,
  tidyUserText,
} from "@/lib/rfp-writer/postprocess";
import type { RfpDraft, WizardInput } from "@/lib/rfp-writer/schema";

/** Dana's persona-QA input (2026-10-21), word for word. */
const dana: WizardInput = {
  tradeSlug: "roofing",
  tradeName: "Roofing",
  description: "flat roof leaking into top floor units after rain, 120 unit condo in mississauga. need it fixed asap, maybe full replacement",
  propertyType: "Condominium",
  city: "Mississauga",
  province: "Ontario",
  size: "120 units",
  occupied: true,
  contractType: "project",
  timing: "1-3-months",
  bidDeadline: "2099-11-11",
  insurance: "5m",
  siteVisit: true,
  priority: "balanced",
};

const occurrences = (haystack: string, needle: string) => haystack.toLowerCase().split(needle.toLowerCase()).length - 1;
const allText = (r: RfpDraft) => [r.title, r.summary, r.scope, r.requirements, r.submissionInstructions, ...r.questionsForBidders].join("\n");

describe("RFP writer post-processing", () => {
  it("never states the template's sample site facts (Dana's draft)", () => {
    const rfp = composeRfp({ ...dana, templateSlug: "flat-roof-replacement" });
    const text = allText(rfp);
    expect(text).not.toMatch(/crane staging area available/i);
    expect(text).not.toMatch(/north parking lot/i);
    expect(text).not.toMatch(/7am/i);
    expect(text).not.toMatch(/interior stairwell \+ roof hatch/i);
    expect(rfp.scope).toContain("Site access (to confirm for this property):");
    expect(rfp.scope).toContain("[Confirm: site access details]");
    expect(rfp.scope).toContain("[Confirm: working hours]");
  });

  it("pastes the manager's words once, sentence-cased, and builds the summary from the answers", () => {
    const rfp = composeRfp({ ...dana, templateSlug: "flat-roof-replacement" });
    const text = allText(rfp);
    expect(occurrences(text, "flat roof leaking into top floor units")).toBe(1);
    expect(rfp.summary).not.toMatch(/leaking/i);
    expect(rfp.summary).toBe("Flat roof replacement at a condominium in Mississauga. Work to take place in the next 1–3 months.");
    expect(rfp.scope).toContain("Flat roof leaking into top floor units after rain, 120 unit condo in Mississauga. Need it fixed asap, maybe full replacement.");
  });

  it("never leaves an [X]% blank, in any template or language", () => {
    const langs = [composeRfp, composeRfpFr, composeRfpEs];
    for (const t of RFP_TEMPLATES) {
      for (const compose of langs) {
        const rfp = compose({ ...dana, tradeSlug: t.tradeSlug, tradeName: t.tradeName, templateSlug: t.slug });
        expect(allText(rfp), `${t.slug} (${compose.name})`).not.toMatch(/\[X\]\s?%/);
        // Nor any template sample working hours stated as fact.
        expect(rfp.scope, `${t.slug} (${compose.name})`).not.toMatch(/\b(?:7am|8am|7 h à 18 h|8 h à 17 h|7 a\. m\.|8 a\. m\.)/);
      }
    }
  });

  it("gives known [X]% blanks a default with a confirm note, and drops unknown ones", () => {
    expect(fillPercentBlanks("- Structural deck replacement beyond [X]% of total area.", "en")).toBe(
      "- Structural deck replacement beyond 10% of total area (confirm the threshold).",
    );
    expect(fillPercentBlanks("- Uptime target: [X]% per elevator per month.", "en")).toBe("- Uptime target: 98% (confirm) per elevator per month.");
    expect(fillPercentBlanks("- Remplacement structural du pontage au-delà de [X] % de la surface totale.", "fr")).toContain("10 %");
    expect(fillPercentBlanks("a\n- Something odd at [X]% capacity.\nb", "en")).toBe("a\nb");
  });

  it("turns invented-fact patterns into visible blanks unless the manager gave them", () => {
    const invented = "Roof access via interior stairwell + roof hatch. Crane staging area available in north parking lot. Work hours 7am–6pm weekdays. Service elevator available for materials.";
    const out = blankInventedFacts(invented, "en", "flat roof leaks");
    expect(out).not.toMatch(/stairwell|north parking lot|7am|Service elevator available/i);
    expect(out).toContain("[Confirm: site access details]");
    expect(out).toContain("[Confirm: crane / staging area]");
    expect(out).toContain("[Confirm: working hours]");
    expect(out).toContain("[Confirm: service elevator availability]");

    // Given by the manager: kept.
    const given = blankInventedFacts("Work hours 8am–4pm weekdays.", "en", "Work hours are 8am to 4pm on weekdays only");
    expect(given).toBe("Work hours 8am–4pm weekdays.");

    const fr = blankInventedFacts("Heures de travail : de 7 h à 18 h en semaine.", "fr", "toit qui fuit");
    expect(fr).toContain("[À confirmer : heures de travail]");
    const es = blankInventedFacts("Horario de trabajo: de 7 a. m. a 6 p. m. entre semana.", "es", "techo con goteras");
    expect(es).toContain("[Por confirmar: horario de trabajo]");
  });

  it("cleans an AI draft the same way (idempotent on a clean draft)", () => {
    const base = composeRfp(dana);
    const ai: RfpDraft = {
      ...base,
      summary: `${dana.description}. Crane staging area available in the north lot.`,
      scope: `${base.scope}\nRoof access via the east stairwell.\n- Deck replacement beyond [X]% of total area.`,
    };
    const out = finalizeDraft(ai, dana, { lang: "en", structuredSummary: base.summary });
    expect(out.summary).toBe(base.summary);
    expect(out.scope).not.toMatch(/east stairwell/);
    expect(out.scope).not.toMatch(/\[X\]\s?%/);
    expect(finalizeDraft(out, dana, { lang: "en", structuredSummary: base.summary })).toEqual(out);
  });

  it("asks for an RBQ licence on Québec drafts, in every language", () => {
    const qc = { ...dana, city: "Montréal", province: "Quebec" };
    expect(composeRfp(qc).requirements).toMatch(/RBQ/);
    expect(composeRfp(qc).requirements).toMatch(/CNESST/);
    expect(composeRfp(qc).requirements).not.toMatch(/WSIB/);
    expect(composeRfpFr({ ...qc, lang: "fr" }).requirements).toMatch(/RBQ/);
    expect(composeRfpFr({ ...qc, lang: "fr" }).requirements).toMatch(/CNESST/);
    expect(composeRfpEs({ ...qc, lang: "es" }).requirements).toMatch(/RBQ/);
    // Not outside Québec, and only once.
    expect(composeRfp(dana).requirements).not.toMatch(/RBQ/);
    const once = ensureQuebecLicence(ensureQuebecLicence("- Insurance.", "en", "Quebec"), "en", "Quebec");
    expect(occurrences(once, "RBQ")).toBe(1);
  });

  it("uses the emergency repair template for an urgent leak", () => {
    const rfp = composeRfp({ ...dana, timing: "asap" });
    expect(rfp.title).toMatch(/^Emergency Roof Repair/);
    expect(composeRfp(dana).title).toMatch(/^Flat Roof Replacement/);
  });

  it("shortens the default bid deadline for urgent work", () => {
    expect(defaultDeadlineDays("asap")).toBe(5);
    expect(defaultDeadlineDays("1-3-months")).toBe(21);
  });

  it("sentence-cases the manager's text without rewriting it", () => {
    expect(tidyUserText("need it fixed asap. i think the drain is blocked", { city: "mississauga" })).toBe("Need it fixed asap. I think the drain is blocked.");
    expect(tidyUserText("roof in toronto leaks", { city: "Toronto", province: "Ontario" })).toBe("Roof in Toronto leaks.");
  });

  it("counts the blanks left to fill", () => {
    const rfp = composeRfp(dana);
    expect(countBlanks(rfp)).toBeGreaterThan(0);
    expect(countBlanks({ ...rfp, scope: "", requirements: "", summary: "", title: "", submissionInstructions: "", questionsForBidders: [] })).toBe(0);
  });
});
