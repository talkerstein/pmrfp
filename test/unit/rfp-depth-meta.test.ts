import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { buildRfpMeta, metaBuyer, metaKindOf, specificIssuer, type MetaKind } from "@/lib/rfp-detail/meta";
import { clip, cutAtWord } from "@/lib/seo/rfp-meta";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

/**
 * The page title and description by kind of listing, in all three languages.
 * The bug this guards (depth study, 22 Oct 2026): a public tender whose summary
 * does not start "Public tender from …" (every Toronto and CanadaBuys listing)
 * was described as "Property manager tender".
 */
const LANGS: Locale[] = ["en", "fr", "es"];
const PM_WORDS: Record<Locale, RegExp> = { en: /property manager/i, fr: /gestionnaire immobilier/i, es: /administrador de propiedades/i };

const toronto = {
  slug: "replace-roof-membrane-at-fire-hall-3-tor-5830241025",
  sourceType: "public_source",
  status: "open",
  summary: "Replace the roof membrane and flashing at Fire Hall 3, including removal of the existing system.",
};
const canadabuys = {
  slug: "snow-removal-services-cb-161-43955128",
  sourceType: "public_source",
  status: "open",
  summary: "Snow removal and sanding at the regional office for the 2026-2027 winter season.",
};
const award = {
  slug: "janitorial-services-tora-5830241025",
  sourceType: "public_source",
  status: "closed",
  summary: "Awarded May 12, 2026 to Clean Co (Toronto) — $97,625 CAD. Past public contract from the City of Toronto (Facilities).",
};
const seao = {
  slug: "entretien-menager-qc-ao-21243",
  sourceType: "public_source",
  status: "open",
  summary: "Public tender from Cégep régional de Lanaudière (Repentigny), posted on SEAO. Documents are in French.",
};
const pm = { slug: "lobby-repaint-abc123", sourceType: null, status: "open", summary: "Repaint the lobby and hallways of a 12-storey condo." };
const gc = { slug: "roofing-package-xyz", sourceType: "gc_package", status: "open", summary: null };
const town = { slug: "mowing-town-job-1", sourceType: "public_buyer_direct", status: "open", summary: null };

describe("metaKindOf", () => {
  it("tells the kinds of listing apart", () => {
    expect(metaKindOf(toronto)).toBe("public");
    expect(metaKindOf(canadabuys)).toBe("public");
    expect(metaKindOf(seao)).toBe("public");
    expect(metaKindOf(award)).toBe("award");
    expect(metaKindOf({ ...toronto, status: "closed" })).toBe("closedTender");
    expect(metaKindOf(pm)).toBe("pm");
    expect(metaKindOf(gc)).toBe("gc");
    expect(metaKindOf(town)).toBe("town");
  });
});

describe("the buyer a listing names", () => {
  it("reads it from the summary, else from a single-issuer feed, never from a portal-only feed", () => {
    expect(metaBuyer(seao, "a Quebec public body", "seao")).toBe("Cégep régional de Lanaudière");
    expect(metaBuyer(award, "the City of Toronto", "toronto-awards")).toBe("City of Toronto");
    expect(metaBuyer(toronto, "the City of Toronto", "toronto")).toBe("City of Toronto");
    expect(metaBuyer(toronto, "la Ville de Toronto", "toronto")).toBe("Ville de Toronto");
    // CanadaBuys carries other governments' notices: its "issuer" is the portal, not the buyer.
    expect(metaBuyer(canadabuys, "the Government of Canada", "canadabuys")).toBeNull();
    // "a Quebec public body" is not one buyer.
    expect(metaBuyer({ summary: null }, "a Quebec public body", "seao")).toBeNull();
  });

  it("strips a leading article only when there is one", () => {
    expect(specificIssuer("the City of Toronto")).toBe("City of Toronto");
    expect(specificIssuer("l'Ontario")).toBe("Ontario");
    expect(specificIssuer("Leamington")).toBeNull();
    expect(specificIssuer("a U.S. federal agency")).toBeNull();
    expect(specificIssuer(null)).toBeNull();
  });
});

describe.each(LANGS)("meta description, %s", (lang) => {
  const t = getDictionary(lang).rfpDepth.meta;
  const build = (kind: MetaKind, over: Partial<Parameters<typeof buildRfpMeta>[0]> = {}) =>
    buildRfpMeta({ t, kind, title: "Roof membrane replacement at Fire Hall 3", buyer: "City of Toronto", city: "Toronto", province: "Ontario", date: "Oct 30, 2026", ...over });

  it("a public tender names its buyer, place and closing date, and is never a property manager's", () => {
    const { description } = build("public");
    expect(description).not.toMatch(PM_WORDS[lang]);
    expect(description).toContain("City of Toronto");
    expect(description).toContain("Toronto, Ontario");
    expect(description).toContain("Oct 30, 2026");
    expect(description).toContain("Roof membrane replacement at Fire Hall 3.");
  });

  it("a public tender with no named buyer is still not a property manager's", () => {
    const { description } = build("public", { buyer: null });
    expect(description).not.toMatch(PM_WORDS[lang]);
    expect(description).toContain("Oct 30, 2026");
  });

  it("every public kind avoids the property-manager wording; only a PM listing uses it", () => {
    for (const kind of ["public", "closedTender", "award", "gc", "town"] as const) {
      expect(build(kind, { buyer: null }).description).not.toMatch(PM_WORDS[lang]);
      expect(build(kind).description).not.toMatch(PM_WORDS[lang]);
    }
    expect(build("pm", { buyer: null }).description).toMatch(PM_WORDS[lang]);
  });

  it("each kind says what it is", () => {
    const descriptions = (["public", "closedTender", "award", "gc", "town", "pm"] as const).map((k) => build(k, { buyer: null }).description);
    expect(new Set(descriptions).size).toBe(6);
  });

  it("stays within a snippet and does not end mid-word", () => {
    const long = "Supply and installation of replacement rooftop heating, ventilation and air conditioning units, controls and related electrical work at the municipal operations centre and four satellite buildings";
    const { title, description } = build("public", { title: long });
    expect(description.length).toBeLessThanOrEqual(300);
    expect(title.length).toBeLessThanOrEqual(88 + " — Toronto, Ontario".length);
    expect(long).toContain(title.replace(/ — .*$/, ""));
  });

  it("does not repeat the city when the tender's own name has it", () => {
    const { title } = build("public", { title: "Toronto Zoo parking lot resurfacing" });
    expect(title).toBe("Toronto Zoo parking lot resurfacing");
  });
});

describe("English wording, exactly", () => {
  const t = getDictionary("en").rfpDepth.meta;
  it("reads as plain English for the common cases", () => {
    expect(buildRfpMeta({ t, kind: "public", title: "Roof membrane replacement at Fire Hall 3", buyer: "City of Toronto", city: "Toronto", province: "Ontario", date: "Oct 30, 2026" }).description).toBe(
      "City of Toronto public tender in Toronto, Ontario. Closes Oct 30, 2026. Roof membrane replacement at Fire Hall 3. Free on PMRFP: key facts, buyer details and similar past awards.",
    );
    expect(buildRfpMeta({ t, kind: "award", title: "Janitorial services", buyer: null, city: null, province: "Ontario", date: "May 12, 2026" }).description).toBe(
      "Public contract award notice in Ontario. Awarded May 12, 2026. Janitorial services. Who won, for how much, and the official notice, on PMRFP.",
    );
  });
});

describe("titles cut at a whole word", () => {
  it("never ends mid-word or on a dangling connector", () => {
    const s = "Rehabilitation of the Pembroke Street culvert and the replacement of the associated retaining wall";
    for (const max of [20, 31, 40, 55, 60, 70]) {
      const c = cutAtWord(s, max);
      expect(c.length).toBeLessThanOrEqual(max);
      expect(s.startsWith(c)).toBe(true);
      expect(s[c.length] === " " || c === s).toBe(true);
      expect(c).not.toMatch(/\s(of|the|and|for|to|at|in)$/i);
    }
    expect(cutAtWord("Rehabilitation of the Pembroke Street culvert", 31)).toBe("Rehabilitation of the Pembroke");
  });

  it("clip adds the ellipsis after a whole word, within the limit", () => {
    const s = "Supply of snow removal services for the north yard and the depot";
    const c = clip(s, 30);
    expect(c.length).toBeLessThanOrEqual(30);
    expect(c.endsWith("…")).toBe(true);
    expect(c).not.toMatch(/\s…$/);
    expect(c.slice(0, -1)).toBe("Supply of snow removal");
    expect(clip("short", 30)).toBe("short");
  });

  it("only a single long token is ever cut hard", () => {
    expect(cutAtWord("Supercalifragilisticexpialidocious", 10)).toBe("Supercalif");
  });
});
