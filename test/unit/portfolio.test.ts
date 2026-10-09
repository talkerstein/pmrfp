import { describe, expect, it } from "vitest";
import {
  canCreateShareLink,
  canUseVisibility,
  isIndexable,
  isListed,
  normalizeVisibility,
  opensBySlug,
} from "@/lib/projects/visibility";
import {
  caseStudyInputSchema,
  caseStudyProgress,
  contentChanged,
  dateToMonth,
  futureMonthError,
  monthToDate,
  nextStatus,
  sanitizeResults,
  stepDone,
  valueBandKey,
  clientTypeKey,
  type ContentSnapshot,
  type ProgressInput,
} from "@/lib/projects/case-study";
import { factProblem, guardFields, inventedNumbers, newProperNouns, numberTokens, polishCaseStudy } from "@/lib/projects/polish";
import type { Generate } from "@/lib/projects/ai";
import {
  GALLERY_MIN_INDEXED,
  cleanFilters,
  filterGallery,
  galleryFacets,
  galleryIndexable,
  paginateGallery,
  type GalleryItem,
} from "@/lib/projects/gallery";
import { isSchemaMissing } from "@/lib/projects/compat";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";

describe("visibility rules", () => {
  it("unknown or missing (pre-migration) means public", () => {
    expect(normalizeVisibility(undefined)).toBe("public");
    expect(normalizeVisibility(null)).toBe("public");
    expect(normalizeVisibility("secret")).toBe("public");
    expect(normalizeVisibility("unlisted")).toBe("unlisted");
    expect(normalizeVisibility("private")).toBe("private");
  });

  it("private is Trade Pro; public and unlisted are for everyone", () => {
    expect(canUseVisibility(false, "public")).toBe(true);
    expect(canUseVisibility(false, "unlisted")).toBe(true);
    expect(canUseVisibility(false, "private")).toBe(false);
    expect(canUseVisibility(true, "private")).toBe(true);
  });

  it("only public is listed and indexed; private never opens by slug", () => {
    expect([isListed("public"), isListed("unlisted"), isListed("private")]).toEqual([true, false, false]);
    expect([isIndexable("public"), isIndexable("unlisted"), isIndexable("private")]).toEqual([true, false, false]);
    expect([opensBySlug("public"), opensBySlug("unlisted"), opensBySlug("private")]).toEqual([true, true, false]);
  });

  it("share links need Trade Pro and a published project", () => {
    expect(canCreateShareLink(true, "published")).toBe(true);
    expect(canCreateShareLink(true, "pending_review")).toBe(false);
    expect(canCreateShareLink(false, "published")).toBe(false);
  });
});

const longText = "The roof was failing at two drains and leaking into a tenant unit below.";
const baseInput = {
  id: ID,
  title: "Flat roof replacement, warehouse",
  challenge: longText,
  approach: longText,
  outcome: longText,
};

describe("case-study builder schema", () => {
  it("accepts a minimal save and fills defaults", () => {
    const r = caseStudyInputSchema.safeParse(baseInput);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({ visibility: "public", results: [], clientType: "", valueBand: "", aiUsed: false });
    }
  });

  it("rejects a client name as client type, a bad band and too many figures", () => {
    expect(caseStudyInputSchema.safeParse({ ...baseInput, clientType: "Maple REIT" }).success).toBe(false);
    expect(caseStudyInputSchema.safeParse({ ...baseInput, valueBand: "$5" }).success).toBe(false);
    const five = Array.from({ length: 5 }, (_, i) => ({ value: String(i + 1), label: "units" }));
    expect(caseStudyInputSchema.safeParse({ ...baseInput, results: five }).success).toBe(false);
  });

  it("checks figures, months and the order of start and finish", () => {
    expect(caseStudyInputSchema.safeParse({ ...baseInput, results: [{ value: "", label: "units" }] }).success).toBe(false);
    expect(caseStudyInputSchema.safeParse({ ...baseInput, startedOn: "2026-13" }).success).toBe(false);
    const r = caseStudyInputSchema.safeParse({ ...baseInput, startedOn: "2026-06", completedOn: "2026-05" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/before the start/);
  });

  it("won't save AI wording the trade hasn't confirmed", () => {
    const r = caseStudyInputSchema.safeParse({ ...baseInput, aiUsed: true, aiChecked: false });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/AI wording/);
    expect(caseStudyInputSchema.safeParse({ ...baseInput, aiUsed: true, aiChecked: true }).success).toBe(true);
  });

  it("finish months can't be in the future", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(futureMonthError({ startedOn: "2026-09", completedOn: "2026-10" }, now)).toBeNull();
    expect(futureMonthError({ startedOn: "", completedOn: "2026-11" }, now)).toMatch(/future/);
    expect(futureMonthError({ startedOn: "2027-01", completedOn: "" }, now)).toMatch(/future/);
  });

  it("months round-trip through the date column", () => {
    expect(monthToDate("2026-05")).toBe("2026-05-01");
    expect(monthToDate("")).toBeNull();
    expect(monthToDate("May 2026")).toBeNull();
    expect(dateToMonth("2026-05-01")).toBe("2026-05");
    expect(dateToMonth(null)).toBe("");
  });

  it("keys and stored figures are sanitized", () => {
    expect(valueBandKey("100k_250k")).toBe("100k_250k");
    expect(valueBandKey("$100k–$250k")).toBeNull();
    expect(clientTypeKey("condo_board")).toBe("condo_board");
    expect(clientTypeKey("Acme")).toBeNull();
    expect(sanitizeResults("nope")).toEqual([]);
    expect(
      sanitizeResults([{ value: "9 days", label: "start to finish" }, { value: "", label: "x" }, { bad: true }]),
    ).toEqual([{ value: "9 days", label: "start to finish" }]);
  });
});

const progressBase: ProgressInput = {
  clientType: null,
  categorySlug: null,
  city: null,
  regionSlug: null,
  completedOn: null,
  scope: null,
  challenge: longText,
  approach: longText,
  outcome: longText,
  results: [],
  photos: [],
  reviewCount: 0,
};

describe("case-study progress", () => {
  it("a captured project starts with only the story done", () => {
    const p = caseStudyProgress(progressBase);
    expect(p).toMatchObject({ done: 1, total: 5, complete: false });
    expect(p.missing).toEqual(["job", "scope", "results", "photos"]);
  });

  it("is complete with the job, scope, a figure and before + after photos", () => {
    const full: ProgressInput = {
      ...progressBase,
      clientType: "property_manager",
      categorySlug: "roofing",
      city: "Mississauga",
      completedOn: "2026-06-01",
      scope: "Tear-off and replacement of the whole flat roof.",
      results: [{ value: "24,000 sq ft", label: "roof replaced" }],
      photos: [{ kind: "before" }, { kind: "after" }],
    };
    expect(caseStudyProgress(full)).toMatchObject({ done: 5, complete: true, missing: [] });
    // Only an after photo isn't enough for the photos step.
    expect(stepDone("photos", { ...full, photos: [{ kind: "after" }] })).toBe(false);
    // A client name typed into client type doesn't count.
    expect(stepDone("job", { ...full, clientType: "Maple REIT" })).toBe(false);
    // Reviews are a bonus, not required.
    expect(stepDone("proof", full)).toBe(false);
    expect(stepDone("proof", { ...full, reviewCount: 1 })).toBe(true);
  });
});

const snap: ContentSnapshot = {
  title: "Roof",
  summary: null,
  scope: null,
  challenge: "c",
  approach: "a",
  outcome: "o",
  results: [],
  photoUrls: ["u1", "u2"],
};

describe("saving: what changed and what status follows", () => {
  it("words, figures and photos count as content; whitespace and photo order don't", () => {
    expect(contentChanged(snap, { ...snap, summary: "  " })).toBe(false);
    expect(contentChanged(snap, { ...snap, photoUrls: ["u2", "u1"] })).toBe(false);
    expect(contentChanged(snap, { ...snap, outcome: "o, done in 9 days" })).toBe(true);
    expect(contentChanged(snap, { ...snap, results: [{ value: "9", label: "days" }] })).toBe(true);
    expect(contentChanged(snap, { ...snap, photoUrls: ["u1"] })).toBe(true);
  });

  it("live projects stay live on settings-only changes; new content goes back for a check", () => {
    expect(nextStatus({ prevStatus: "published", autoPublish: false, changed: false })).toBe("published");
    expect(nextStatus({ prevStatus: "published", autoPublish: false, changed: true })).toBe("pending_review");
    expect(nextStatus({ prevStatus: "pending_review", autoPublish: false, changed: false })).toBe("pending_review");
    expect(nextStatus({ prevStatus: "published", autoPublish: true, changed: true })).toBe("published");
    expect(nextStatus({ prevStatus: "pending_review", autoPublish: true, changed: true })).toBe("published");
  });

  it("an admin rejection always goes back to the queue", () => {
    expect(nextStatus({ prevStatus: "rejected", autoPublish: true, changed: true })).toBe("pending_review");
  });
});

describe("AI wording guard", () => {
  it("normalizes numbers the way people write them", () => {
    expect([...numberTokens("24,000 sq ft in 9 days, 1.5 storeys")]).toEqual(["24000", "9", "1.5"]);
    expect([...numberTokens("24 000 pi² en 9 jours, 1,5 étage")]).toEqual(["24000", "9", "1.5"]);
    expect([...numberTokens("2, 3 and 4 units")]).toEqual(["2", "3", "4"]);
  });

  it("flags numbers the trade never wrote", () => {
    expect(inventedNumbers("Replaced 24,000 sq ft in 9 days.", "We replaced 24000 sq ft in 9 days.")).toEqual([]);
    expect(inventedNumbers("Replaced the roof in 9 days.", "Replaced a 30,000 sq ft roof in 9 days.")).toEqual(["30000"]);
    expect(inventedNumbers("Saved money.", "Saved $12k.")).toEqual(["12"]);
  });

  it("flags names and places the trade never wrote, but not sentence starts", () => {
    expect(newProperNouns("we fixed the roof. tenants stayed open.", "We fixed the roof. Tenants stayed open.")).toEqual([]);
    expect(newProperNouns("fixed the roof in mississauga", "We fixed the roof in Mississauga.")).toEqual([]);
    expect(newProperNouns("fixed the roof", "We fixed the roof for Maple REIT using Firestone membrane.")).toEqual(["Maple", "Firestone"]);
    expect(factProblem("fixed the roof", "Fixed the roof in Toronto.")).toMatch(/Toronto/);
    expect(factProblem("fixed the roof in 9 days", "Fixed the roof in 9 days.")).toBeNull();
  });

  it("keeps only AI fields that re-word the trade's own text", () => {
    const source = {
      summary: "",
      scope: "roof tear off and new drains",
      challenge: "roof leaking at 2 drains, tenants open",
      approach: "we replaced deck at drains and installed membrane",
      outcome: "no leaks since, done in 9 days",
    };
    const output = {
      summary: "A great roof job.",
      scope: "Roof tear-off and new drains.",
      challenge: "The roof leaked at 2 drains while tenants stayed open.",
      approach: "We replaced the deck at the drains and installed a new Firestone membrane.",
      outcome: "No leaks since. Done in 7 days.",
    };
    const g = guardFields(source, output);
    expect(g.fields).toEqual({
      scope: "Roof tear-off and new drains.",
      challenge: "The roof leaked at 2 drains while tenants stayed open.",
    });
    expect(g.kept.sort()).toEqual(["approach", "outcome"]);
  });

  it("polishCaseStudy runs on the trade's text only and reports kept fields", async () => {
    let seen = "";
    const generate: Generate = async ({ parts }) => {
      seen = JSON.stringify(parts);
      return JSON.stringify({
        summary: "",
        scope: "",
        challenge: "The roof leaked at 2 drains.",
        approach: "We replaced the deck at both drains.",
        outcome: "No leaks since, and the job took 12 days.",
      });
    };
    const r = await polishCaseStudy(
      {
        summary: "",
        scope: "",
        challenge: "roof leaked at 2 drains",
        approach: "replaced deck at both drains",
        outcome: "no leaks since",
      },
      { generate },
    );
    expect(seen).toContain("roof leaked at 2 drains");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.fields).sort()).toEqual(["approach", "challenge"]);
      expect(r.kept).toEqual(["outcome"]);
    }
  });

  it("fails soft without a model, with nothing typed, or on junk output", async () => {
    const empty = { summary: "", scope: "", challenge: "", approach: "", outcome: "" };
    expect(await polishCaseStudy({ ...empty, challenge: "x" }, { generate: null })).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await polishCaseStudy(empty, { generate: async () => "{}" })).toMatchObject({ ok: false, reason: "empty" });
    expect(await polishCaseStudy({ ...empty, challenge: "x" }, { generate: async () => "not json" })).toMatchObject({
      ok: false,
      reason: "failed",
    });
  });
});

const item = (over: Partial<GalleryItem>): GalleryItem => ({
  slug: "s",
  title: "t",
  summary: null,
  city: null,
  province: null,
  heroUrl: null,
  publishedAt: null,
  orgName: "Acme",
  orgSlug: "acme",
  orgVerified: false,
  categoryName: "Roofing",
  categorySlug: "roofing",
  regionName: "Toronto",
  regionSlug: "toronto",
  clientType: null,
  isCaseStudy: false,
  ...over,
});

describe("projects gallery", () => {
  const items = [
    item({ slug: "a" }),
    item({ slug: "b", categoryName: "HVAC", categorySlug: "hvac" }),
    item({ slug: "c", regionName: "Ottawa", regionSlug: "ottawa", orgSlug: "beta" }),
    item({ slug: "d", categoryName: null, categorySlug: null }),
  ];

  it("filters by trade, region and company", () => {
    expect(filterGallery(items, { trade: "roofing" }).map((i) => i.slug)).toEqual(["a", "c"]);
    expect(filterGallery(items, { trade: "roofing", region: "toronto" }).map((i) => i.slug)).toEqual(["a"]);
    expect(filterGallery(items, { company: "beta" }).map((i) => i.slug)).toEqual(["c"]);
    expect(filterGallery(items, {}).length).toBe(4);
  });

  it("menus list only trades and regions that have projects, busiest first", () => {
    const f = galleryFacets(items);
    expect(f.trades).toEqual([
      { slug: "roofing", name: "Roofing", count: 2 },
      { slug: "hvac", name: "HVAC", count: 1 },
    ]);
    expect(f.regions[0]).toEqual({ slug: "toronto", name: "Toronto", count: 3 });
  });

  it("drops unknown filter values but keeps a real trade with no projects", () => {
    const valid = { trades: new Set(["roofing", "painting"]), regions: new Set(["toronto"]), companies: new Set(["acme"]) };
    expect(cleanFilters({ trade: "painting", region: "nowhere", company: "ghost" }, valid)).toEqual({
      trade: "painting",
      region: undefined,
      company: undefined,
    });
  });

  it("pages clamp to the range", () => {
    const many = Array.from({ length: 50 }, (_, i) => i);
    expect(paginateGallery(many, "2", 24)).toMatchObject({ page: 2, pages: 3 });
    expect(paginateGallery(many, "99", 24).page).toBe(3);
    expect(paginateGallery(many, "x", 24).page).toBe(1);
    expect(paginateGallery([], undefined, 24)).toMatchObject({ page: 1, pages: 1, slice: [] });
  });

  it("thin, paged and company views are noindexed", () => {
    expect(galleryIndexable({ count: 0, filters: {}, page: 1 })).toBe(false);
    expect(galleryIndexable({ count: 1, filters: {}, page: 1 })).toBe(true);
    expect(galleryIndexable({ count: GALLERY_MIN_INDEXED - 1, filters: { trade: "roofing" }, page: 1 })).toBe(false);
    expect(galleryIndexable({ count: GALLERY_MIN_INDEXED, filters: { trade: "roofing" }, page: 1 })).toBe(true);
    expect(galleryIndexable({ count: 50, filters: {}, page: 2 })).toBe(false);
    expect(galleryIndexable({ count: 50, filters: { company: "acme" }, page: 1 })).toBe(false);
  });
});

describe("pre-migration detection", () => {
  it("only schema errors trigger the old-query fallback", () => {
    expect(isSchemaMissing({ code: "42703", message: "column case_studies.visibility does not exist" })).toBe(true);
    expect(isSchemaMissing({ code: "PGRST204", message: "Could not find the 'visibility' column" })).toBe(true);
    expect(isSchemaMissing({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(isSchemaMissing(null)).toBe(false);
  });
});
