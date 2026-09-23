import { describe, expect, it } from "vitest";
import { bidCheckRows, bidCheckSchema, coveredRows, type BidCheck } from "@/lib/bid-check/schema";
import { noticeText } from "@/lib/bid-check/ai";

const unknown = { status: "unknown" as const, detail: "" };
const base: BidCheck = {
  plainSummary: "Maintain and monitor intrusion alarms for the City of Sainte-Agathe-des-Monts.",
  siteVisit: { status: "unknown", detail: "" },
  bonding: unknown,
  insurance: unknown,
  securityClearance: unknown,
  licences: [],
  experience: "",
  setAside: "",
  submission: "Through SEAO by October 5, 2026.",
  watchOuts: ["Documents are in French"],
};

describe("bid checklist", () => {
  it("shows only what the notice states, never guesses", () => {
    const rows = bidCheckRows(base);
    expect(rows).toHaveLength(8);
    expect(coveredRows(base).map((r) => r.key)).toEqual(["submission"]);
    expect(rows.find((r) => r.key === "bonding")?.state).toBe("unknown");
  });

  it("maps explicit answers", () => {
    const c: BidCheck = {
      ...base,
      siteVisit: { status: "mandatory", detail: "Oct 2, 10 a.m., Building 12" },
      bonding: { status: "required", detail: "10% bid bond" },
      securityClearance: { status: "not_required", detail: "" },
      licences: ["COR", "ESA licence"],
      setAside: "Indigenous businesses (PSIB)",
    };
    const byKey = Object.fromEntries(bidCheckRows(c).map((r) => [r.key, r]));
    expect(byKey.siteVisit).toMatchObject({ state: "yes", value: "Oct 2, 10 a.m., Building 12" });
    expect(byKey.bonding).toMatchObject({ state: "yes", value: "10% bid bond" });
    expect(byKey.securityClearance.state).toBe("no");
    expect(byKey.licences.value).toBe("COR, ESA licence");
    expect(coveredRows(c)).toHaveLength(6);
  });

  it("an optional site visit counts as stated, not required", () => {
    const row = bidCheckRows({ ...base, siteVisit: { status: "optional", detail: "Oct 3" } })[0];
    expect(row).toMatchObject({ state: "no", value: "Optional: Oct 3" });
  });

  it("rejects model output that doesn't match the schema", () => {
    expect(bidCheckSchema.safeParse({ ...base, bonding: { status: "maybe", detail: "" } }).success).toBe(false);
    expect(bidCheckSchema.safeParse({ ...base, licences: ["a", "b", "c", "d", "e", "f", "g"] }).success).toBe(false);
  });

  it("builds the notice text from what we have, capped", () => {
    const t = noticeText({ title: "Roof", summary: null, scope: "x".repeat(9000), requirements: null, province: "Ontario", deadline: "2026-10-01", issuer: "the City of Toronto" });
    expect(t).toContain("Issued by: the City of Toronto");
    expect(t).toContain("Location: Ontario");
    expect(t.length).toBeLessThan(7200);
  });
});
