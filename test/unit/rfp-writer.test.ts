import { describe, expect, it } from "vitest";
import { composeRfp, pickTemplate } from "@/lib/rfp-writer/compose";
import { wizardInputSchema, type WizardInput } from "@/lib/rfp-writer/schema";

const base: WizardInput = {
  tradeSlug: "roofing",
  tradeName: "Roofing",
  description: "Flat roof over the east wing leaks in heavy rain. About 18,000 sq ft, 20+ years old.",
  propertyType: "Condominium",
  city: "Mississauga",
  province: "Ontario",
  size: "18,000 sq ft",
  occupied: true,
  contractType: "project",
  timing: "1-3-months",
  bidDeadline: "2099-10-14",
  insurance: "5m",
  siteVisit: true,
  priority: "balanced",
};

describe("RFP writer composer (no-AI path)", () => {
  it("starts from the trade's expert template", () => {
    expect(pickTemplate(base)?.tradeSlug).toBe("roofing");
    expect(pickTemplate({ tradeSlug: "roofing", templateSlug: "emergency-roof-repair" })?.slug).toBe("emergency-roof-repair");
  });

  it("fills the answers in and leaves no template-only placeholders", () => {
    const rfp = composeRfp(base);
    expect(rfp.title).toBe("Flat Roof Replacement — Condominium, Mississauga");
    expect(rfp.summary).toContain("at a condominium in Mississauga.");
    expect(rfp.scope).toContain("(estimated 18,000 sq ft)");
    expect(rfp.scope).toContain("occupied during the work");
    expect(rfp.scope).toContain("18,000 sq ft");
    expect(rfp.scope).not.toContain("[X] sq ft");
    expect(rfp.requirements).toContain("$5M general liability");
    expect(rfp.requirements).not.toMatch(/PMRFP \/ building owner/);
  });

  it("uses the chosen insurance level", () => {
    expect(composeRfp({ ...base, insurance: "2m" }).requirements).toContain("$2M general liability");
  });

  it("computes the deadline, site visit and published weights", () => {
    const rfp = composeRfp({ ...base, priority: "price", budgetMin: 150000, budgetMax: 220000 });
    expect(rfp.submissionInstructions).toContain("Bids are due by October 14, 2099");
    expect(rfp.submissionInstructions).toContain("Questions in writing by October 9, 2099");
    expect(rfp.submissionInstructions).toContain("site visit");
    expect(rfp.submissionInstructions).toContain("$150,000–$220,000");
    expect(rfp.evaluationCriteria[0]).toBe("Price (55%)");
  });

  it("writes a generic but complete RFP for trades without a template", () => {
    const rfp = composeRfp({ ...base, tradeSlug: "garage-doors", tradeName: "Garage Doors", contractType: "service-contract" });
    expect(rfp.title).toContain("Garage Doors Service Contract");
    expect(rfp.requirements).toContain("garage doors work");
    expect(rfp.submissionInstructions).toContain("service contract");
    expect(rfp.questionsForBidders.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects thin or malformed input", () => {
    expect(wizardInputSchema.safeParse({ ...base, description: "fix roof" }).success).toBe(false);
    expect(wizardInputSchema.safeParse({ ...base, bidDeadline: "next week" }).success).toBe(false);
    expect(wizardInputSchema.safeParse(base).success).toBe(true);
  });
});
