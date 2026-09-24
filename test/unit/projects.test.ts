import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { canAddProject, FREE_PHOTO_LIMIT, PAID_PHOTO_LIMIT, photoLimit, publishLimitError } from "@/lib/projects/limits";
import { projectSlug, randomSuffix, slugify } from "@/lib/projects/slug";
import { generateReviewToken, hashReviewToken, isWellFormedToken } from "@/lib/projects/tokens";
import { groupPhotos, isOwnPhotoUrl, photoUrlPrefix, pickHero, sanitizePhotos, type ProjectPhoto } from "@/lib/projects/photos";
import { draftOutputSchema, parseDraft } from "@/lib/projects/draft";
import { draftProject, draftPrompt, type Generate } from "@/lib/projects/ai";
import { isOwnEmail, looksLikeSelfReview, reviewStats } from "@/lib/projects/reviews";
import { processPhoto, UnreadableImageError } from "@/lib/projects/image";

const SB = "https://abc.supabase.co";
const ORG = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const uuid = (n: number) => `aaaaaaaa-bbbb-4ccc-8ddd-${String(n).padStart(12, "0")}`;
const photo = (n: number, kind: ProjectPhoto["kind"], org = ORG): ProjectPhoto => ({
  url: `${photoUrlPrefix(SB)}${org}/${uuid(n)}.jpg`,
  path: `${org}/${uuid(n)}.jpg`,
  kind,
  width: 1920,
  height: 1440,
});

describe("plan limits", () => {
  it("free: one project, three photos; paid: many", () => {
    expect(photoLimit(false)).toBe(FREE_PHOTO_LIMIT);
    expect(photoLimit(true)).toBe(PAID_PHOTO_LIMIT);
    expect(canAddProject(false, 0)).toBe(true);
    expect(canAddProject(false, 1)).toBe(false);
    expect(canAddProject(true, 40)).toBe(true);
  });

  it("explains what blocks a publish", () => {
    expect(publishLimitError({ paid: false, existingProjects: 0, photoCount: 3 })).toBeNull();
    expect(publishLimitError({ paid: false, existingProjects: 0, photoCount: 4 })).toMatch(/free plan allows 3/);
    expect(publishLimitError({ paid: false, existingProjects: 1, photoCount: 1 })).toMatch(/one project/);
    expect(publishLimitError({ paid: true, existingProjects: 9, photoCount: 24 })).toBeNull();
    expect(publishLimitError({ paid: true, existingProjects: 9, photoCount: 25 })).toMatch(/Up to 24/);
  });
});

describe("slugs", () => {
  it("makes readable, bounded slugs", () => {
    expect(slugify("Flat roof replacement, 24,000 sq ft warehouse — Mississauga")).toBe(
      "flat-roof-replacement-24-000-sq-ft-warehouse-mississauga",
    );
    expect(slugify("Rénovation du hall, Montréal")).toBe("renovation-du-hall-montreal");
    expect(slugify("!!!")).toBe("project");
    const long = slugify("a ".repeat(100));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });

  it("adds a random suffix", () => {
    expect(projectSlug("Boiler swap", "x2y3z")).toBe("boiler-swap-x2y3z");
    const s = randomSuffix();
    expect(s).toMatch(/^[a-z2-9]{5}$/);
    expect(new Set(Array.from({ length: 50 }, () => randomSuffix())).size).toBeGreaterThan(45);
  });
});

describe("review tokens", () => {
  it("are random, URL-safe and stored only as a hash", () => {
    const a = generateReviewToken();
    const b = generateReviewToken();
    expect(a).not.toBe(b);
    expect(isWellFormedToken(a)).toBe(true);
    expect(hashReviewToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashReviewToken(a)).toBe(hashReviewToken(a));
    expect(hashReviewToken(a)).not.toBe(hashReviewToken(b));
  });

  it("rejects junk before any database call", () => {
    expect(isWellFormedToken("bad-token")).toBe(false);
    expect(isWellFormedToken("a".repeat(31))).toBe(false);
    expect(isWellFormedToken(`${"a".repeat(31)}/`)).toBe(false);
  });
});

describe("photo URLs", () => {
  it("accepts only our processed uploads", () => {
    expect(isOwnPhotoUrl(photo(1, "after").url, SB)).toBe(true);
    expect(isOwnPhotoUrl(photo(1, "after").url, `${SB}/`)).toBe(true);
    expect(isOwnPhotoUrl(photo(1, "after").url, SB, ORG)).toBe(true);
    expect(isOwnPhotoUrl(photo(1, "after", OTHER).url, SB, ORG)).toBe(false);
    expect(isOwnPhotoUrl(`https://evil.example/storage/v1/object/public/project-photos/${ORG}/${uuid(1)}.jpg`, SB)).toBe(false);
    expect(isOwnPhotoUrl(`${SB}/storage/v1/object/public/logos/${ORG}/${uuid(1)}.jpg`, SB)).toBe(false);
    expect(isOwnPhotoUrl(`${photoUrlPrefix(SB)}${ORG}/../x/${uuid(1)}.jpg`, SB)).toBe(false);
    expect(isOwnPhotoUrl(`${photo(1, "after").url}?x=1`, SB)).toBe(false);
    expect(isOwnPhotoUrl(photo(1, "after").url, "")).toBe(false);
  });

  it("sanitizes stored jsonb", () => {
    const good = photo(1, "before");
    const raw = [
      good,
      { ...photo(2, "after"), url: "https://evil.example/a.jpg" },
      { ...photo(3, "after"), kind: "sideways" },
      { ...photo(4, "after"), path: `${ORG}/${uuid(9)}.jpg` }, // url/path mismatch
      "nope",
    ];
    expect(sanitizePhotos(raw, SB)).toEqual([good]);
    expect(sanitizePhotos({ not: "an array" }, SB)).toEqual([]);
    expect(sanitizePhotos(null, SB)).toEqual([]);
  });

  it("uses the first After photo as the hero and groups the rest", () => {
    const list = [photo(1, "before"), photo(2, "during"), photo(3, "after"), photo(4, "after")];
    expect(pickHero(list)?.url).toBe(list[2].url);
    expect(pickHero([photo(5, "before")])?.url).toBe(photo(5, "before").url);
    expect(pickHero([])).toBeNull();

    const { hero, groups } = groupPhotos(list, null);
    expect(hero?.url).toBe(list[2].url);
    expect(groups.map((g) => [g.kind, g.photos.length])).toEqual([
      ["before", 1],
      ["during", 1],
      ["after", 1],
    ]);
    expect(groupPhotos(list, list[0].url).hero?.url).toBe(list[0].url);
  });
});

const CATS = ["roofing", "hvac"];
const PTS = ["industrial", "office"];
const validDraft = {
  title: "Flat roof replacement, 24,000 sq ft warehouse, Mississauga",
  summary: "Replaced a leaking flat roof on an occupied warehouse.",
  challenge: "The roof leaked at two drains and the deck was soft.",
  approach: "Tore off both layers, replaced the rotten deck and installed 2-ply SBS.",
  outcome: "Finished in 9 days with tenants open. No leaks since.",
  categorySlug: "roofing",
  propertyTypeSlug: "industrial",
  privacy: { people: false, licencePlates: true, addressVisible: false, clientNameVisible: false },
};

describe("AI draft parsing", () => {
  it("accepts a valid draft", () => {
    const d = parseDraft(JSON.stringify(validDraft), { categorySlugs: CATS, propertyTypeSlugs: PTS });
    expect(d).toMatchObject({ categorySlug: "roofing", propertyTypeSlug: "industrial" });
    expect(d?.privacy.licencePlates).toBe(true);
  });

  it("drops slugs we didn't offer instead of trusting them", () => {
    const d = parseDraft(JSON.stringify({ ...validDraft, categorySlug: "plumbing", propertyTypeSlug: "" }), {
      categorySlugs: CATS,
      propertyTypeSlugs: PTS,
    });
    expect(d?.categorySlug).toBeNull();
    expect(d?.propertyTypeSlug).toBeNull();
  });

  it("warns when the model skipped a privacy flag", () => {
    const d = parseDraft(JSON.stringify({ ...validDraft, privacy: { people: false } }), {
      categorySlugs: CATS,
      propertyTypeSlugs: PTS,
    });
    expect(d?.privacy).toEqual({ people: false, licencePlates: true, addressVisible: true, clientNameVisible: true });
  });

  it("rejects unusable output and caps long fields", () => {
    const opts = { categorySlugs: CATS, propertyTypeSlugs: PTS };
    expect(parseDraft("not json", opts)).toBeNull();
    expect(parseDraft(undefined, opts)).toBeNull();
    expect(parseDraft(JSON.stringify({ ...validDraft, challenge: "   " }), opts)).toBeNull();
    expect(parseDraft(JSON.stringify({ title: 5 }), opts)).toBeNull();
    const long = parseDraft(JSON.stringify({ ...validDraft, title: `"${"Big job. ".repeat(40)}"` }), opts);
    expect(long!.title.length).toBeLessThanOrEqual(120);
    expect(long!.title.startsWith('"')).toBe(false);
  });

  it("constrains slugs in the schema sent to the model", () => {
    const schema = JSON.stringify(draftOutputSchema(CATS, PTS).toJSONSchema());
    expect(schema).toContain('"roofing"');
    expect(schema).toContain('"industrial"');
  });
});

describe("draftProject (fake model)", () => {
  const input = {
    notes: "Replaced the flat roof on a warehouse in Mississauga.",
    photos: [
      { url: photo(1, "after").url, kind: "after" as const },
      { url: photo(2, "before").url, kind: "before" as const },
    ],
    categories: [{ slug: "roofing", name: "Roofing" }, { slug: "hvac", name: "HVAC" }],
    propertyTypes: [{ slug: "industrial", name: "Industrial" }, { slug: "office", name: "Office" }],
  };
  const fetchImage = async () => ({ data: "AAAA", mimeType: "image/jpeg" });

  it("falls through to the next model on bad output and sends labelled photos", async () => {
    const calls: { model: string; parts: unknown[] }[] = [];
    const generate: Generate = async ({ model, parts }) => {
      calls.push({ model, parts });
      return calls.length === 1 ? "{oops" : JSON.stringify(validDraft);
    };
    const r = await draftProject(input, { generate, fetchImage });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].parts).toHaveLength(3); // prompt + 2 images
    expect(JSON.stringify(calls[0].parts[0])).toContain("1 = after, 2 = before");
  });

  it("reports quota and missing-key failures so the form can say 'write it yourself'", async () => {
    const quota: Generate = async () => {
      throw new Error("429 RESOURCE_EXHAUSTED");
    };
    expect(await draftProject(input, { generate: quota, fetchImage })).toMatchObject({ ok: false, reason: "quota" });
    expect(await draftProject(input, { generate: null, fetchImage })).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("skips photos it couldn't fetch, and needs something to write from", async () => {
    let parts = 0;
    const generate: Generate = async (a) => {
      parts = a.parts.length;
      return JSON.stringify(validDraft);
    };
    await draftProject(input, { generate, fetchImage: async () => null });
    expect(parts).toBe(1);
    const empty = await draftProject({ ...input, notes: " " }, { generate, fetchImage: async () => null });
    expect(empty).toMatchObject({ ok: false, reason: "failed" });
  });

  it("lists the allowed slugs in the prompt", () => {
    const p = draftPrompt(input, ["after"]);
    expect(p).toContain("roofing: Roofing");
    expect(p).toContain("industrial: Industrial");
  });
});

describe("reviews", () => {
  it("averages to one decimal and ignores bad ratings", () => {
    expect(reviewStats([])).toEqual({ count: 0, average: 0 });
    expect(reviewStats([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ count: 3, average: 4.3 });
    expect(reviewStats([{ rating: 5 }, { rating: 9 }])).toEqual({ count: 1, average: 5 });
  });

  it("flags a trade reviewing itself", () => {
    const org = { email: "info@acme-roofing.ca", website: "https://www.acme-roofing.ca" };
    expect(isOwnEmail("INFO@acme-roofing.ca ", [org.email])).toBe(true);
    expect(looksLikeSelfReview("bob@acme-roofing.ca", org)).toBe(true);
    expect(looksLikeSelfReview("pm@bigreit.com", org)).toBe(false);
    expect(looksLikeSelfReview("someone@gmail.com", { email: "acme@gmail.com" })).toBe(false);
    expect(looksLikeSelfReview("acme@gmail.com", { email: "acme@gmail.com" })).toBe(true);
    expect(looksLikeSelfReview(null, org)).toBe(false);
  });
});

describe("processPhoto", () => {
  it("turns the photo upright, shrinks it and strips all metadata (GPS included)", async () => {
    // 3000×2000 landscape stored with EXIF orientation 6 (= shot in portrait).
    const input = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#6a8" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({
        IFD0: { Copyright: "Acme" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "43/1 35/1 0/1" },
      })
      .toBuffer();
    const inMeta = await sharp(input).metadata();
    expect(inMeta.orientation).toBe(6);
    expect(inMeta.exif?.toString("latin1")).toContain("Acme");

    const out = await processPhoto(input);
    expect([out.width, out.height]).toEqual([1280, 1920]);
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });

  it("never enlarges small photos", async () => {
    const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#000" } }).png().toBuffer();
    const out = await processPhoto(small);
    expect([out.width, out.height]).toEqual([800, 600]);
  });

  it("throws a typed error for files that aren't images", async () => {
    await expect(processPhoto(Buffer.from("definitely not a jpeg"))).rejects.toBeInstanceOf(UnreadableImageError);
  });
});
