import { describe, expect, it } from "vitest";
import {
  finishHref,
  missingSteps,
  nextStepAfter,
  patchChanges,
  normalizeWebsite,
  pickStep,
  stepPatch,
  stepsFor,
} from "@/lib/organizations/listing-steps";

/** "Finish your listing": what's asked, in what order, and what an answer writes. */

const CANADIAN = { province: "Ontario", country: "Canada" };
const AMERICAN = { province: "Minnesota", country: "United States" };

describe("which steps a listing gets", () => {
  it("asks a Canadian company for WSIB and not a U.S. one", () => {
    expect(stepsFor(CANADIAN)).toContain("wsib");
    expect(stepsFor(AMERICAN)).not.toContain("wsib");
    expect(stepsFor({ province: "Minnesota", country: null })).not.toContain("wsib");
  });

  it("asks what a property manager looks at first", () => {
    expect(missingSteps(CANADIAN).slice(0, 3)).toEqual(["logo", "short", "insurance"]);
  });

  it("only lists what's still empty", () => {
    expect(missingSteps({ ...CANADIAN, logo_url: "x", insurance_status: "Fully insured" })).not.toContain("logo");
    expect(missingSteps({ ...CANADIAN, logo_url: "x", insurance_status: "Fully insured" })).not.toContain("insurance");
  });
});

describe("moving through the steps", () => {
  it("goes to the next thing missing and doesn't ask a skipped step again", () => {
    expect(nextStepAfter(CANADIAN)).toBe("logo");
    expect(nextStepAfter(CANADIAN, "logo")).toBe("short");
    expect(nextStepAfter({ ...CANADIAN, short_description: "x" }, "logo")).toBe("insurance");
  });

  it("ends after the last step even if earlier ones were skipped", () => {
    expect(nextStepAfter(CANADIAN, "full")).toBeNull();
    expect(missingSteps(CANADIAN).length).toBeGreaterThan(0);
  });

  it("opens the step a link asks for, unless it doesn't apply", () => {
    expect(pickStep(CANADIAN, "team", undefined)).toBe("team");
    expect(pickStep(AMERICAN, "wsib", undefined)).toBe("logo");
    expect(pickStep(CANADIAN, "nonsense", undefined)).toBe("logo");
    expect(pickStep(CANADIAN, undefined, "logo")).toBe("short");
    expect(finishHref("team")).toBe("/dashboard/company/finish?step=team");
  });
});

describe("what an answer writes", () => {
  it("writes only that step's column", () => {
    expect(stepPatch("insurance", " Fully insured ($5M) ")).toEqual({ patch: { insurance_status: "Fully insured ($5M)" } });
    expect(stepPatch("team", "11-50")).toEqual({ patch: { employee_count_range: "11-50" } });
    expect(stepPatch("city", "Toronto")).toEqual({ patch: { city: "Toronto" } });
  });

  it("writes nothing for an empty answer, so saving blank can't wipe a value", () => {
    for (const step of ["short", "full", "website", "phone", "city", "insurance", "wsib", "team"] as const) {
      expect(stepPatch(step, "   ")).toEqual({});
    }
  });

  it("knows when an answer is what's already saved", () => {
    expect(patchChanges({ city: "Toronto" }, { city: "Toronto" })).toBe(false);
    expect(patchChanges({ logo_url: null }, { logo_url: null })).toBe(false);
    expect(patchChanges({}, { logo_url: null })).toBe(false);
    expect(patchChanges({ city: "Toronto" }, { city: "Ottawa" })).toBe(true);
  });

  it("clears the logo when the uploader was emptied", () => {
    expect(stepPatch("logo", "")).toEqual({ patch: { logo_url: null } });
  });

  it("wants a real sentence for the description", () => {
    expect(stepPatch("short", "Jgvvjbd")).toEqual({ error: "short" });
    expect(stepPatch("short", "Commercial roofing repairs across the GTA.").patch).toBeTruthy();
    expect(stepPatch("short", "x".repeat(301))).toEqual({ error: "tooLong" });
  });

  it("rejects a phone number with too few digits and a team size off the list", () => {
    expect(stepPatch("phone", "call me")).toEqual({ error: "phone" });
    expect(stepPatch("phone", "416-555-0100").patch).toBeTruthy();
    expect(stepPatch("team", "9000")).toEqual({ error: "team" });
  });
});

describe("website addresses", () => {
  it("adds https:// so nobody has to type it", () => {
    expect(normalizeWebsite("northline.ca")).toBe("https://northline.ca");
    expect(normalizeWebsite(" https://northline.ca/ ")).toBe("https://northline.ca");
    expect(normalizeWebsite("http://northline.ca/about")).toBe("http://northline.ca/about");
  });

  it("refuses anything that isn't a web address", () => {
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsite("data:text/html,x")).toBeNull();
    expect(normalizeWebsite("not a website")).toBeNull();
    expect(normalizeWebsite("localhost")).toBeNull();
    expect(stepPatch("website", "javascript:alert(1)")).toEqual({ error: "website" });
  });
});
