import { describe, expect, it, vi, beforeAll } from "vitest";
import type { MetadataRoute } from "next";

// unstable_cache needs Next's runtime; in tests it just calls through.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

// One substantial project and one thin one (the thin page is noindexed).
vi.mock("@/lib/major-projects/data", () => ({
  getMajorProjects: async () => [
    { slug: "big-hospital", lastSeen: "2026-10-01", thin: false },
    { slug: "tiny-shed", lastSeen: "2026-10-01", thin: true },
  ],
}));
vi.mock("@/lib/major-projects/filters", () => ({
  isThinProject: (p: { thin: boolean }) => p.thin,
}));

import sitemap from "@/app/sitemap";
import { alternatesFor } from "@/i18n/metadata";
import { isTranslatedPath, translationsOf } from "@/i18n/translated";

const BASE = "https://pmrfp.com";
let map: MetadataRoute.Sitemap;
const urls = () => map.map((e) => e.url.slice(BASE.length) || "/");
const entry = (path: string) => map.find((e) => e.url === `${BASE}${path === "/" ? "" : path}` || e.url === `${BASE}${path}`);

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SITE_URL = BASE;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  map = await sitemap();
});

describe("sitemap languages", () => {
  it.each(["/major-projects", "/major-projects/big-hospital", "/reputation", "/founding-500", "/advertise", "/gc-hub", "/reports/contract-winners", "/pricing", "/"])(
    "lists %s in English, French and Spanish with matching hreflang",
    (path) => {
      const want = alternatesFor("en", path).languages as Record<string, string>;
      const abs = Object.fromEntries(Object.entries(want).map(([k, v]) => [k, `${BASE}${v === "/" ? "" : v}`]));
      for (const lang of ["en", "fr", "es"] as const) {
        const e = entry(want[lang]);
        expect(e, `${lang} ${path}`).toBeTruthy();
        const got = Object.fromEntries(Object.entries(e!.alternates!.languages!).map(([k, v]) => [k, String(v).replace(/\/$/, "") || String(v)]));
        const exp = Object.fromEntries(Object.entries(abs).map(([k, v]) => [k, v.replace(/\/$/, "") || v]));
        expect(got).toEqual(exp);
      }
    },
  );

  it("pairs every translated entry with en, fr, es and x-default", () => {
    for (const e of map) {
      const path = e.url.slice(BASE.length) || "/";
      if (/^\/(fr|es)(\/|$)/.test(path)) {
        expect(e.alternates?.languages, path).toBeTruthy();
        continue;
      }
      if (translationsOf(path).length === 0) {
        expect(e.alternates, path).toBeUndefined();
        continue;
      }
      expect(Object.keys(e.alternates!.languages!).sort(), path).toEqual(["en", "es", "fr", "x-default"]);
      expect(e.alternates!.languages!["x-default"]).toBe(e.url);
    }
  });

  it("uses the switcher's list: an entry is paired exactly when its page is translated", () => {
    for (const e of map) {
      const path = e.url.slice(BASE.length) || "/";
      if (/^\/(fr|es)(\/|$)/.test(path)) continue;
      expect(Boolean(e.alternates), path).toBe(isTranslatedPath(path, "fr"));
    }
  });

  it("leaves out noindex pages: thin major projects, sign-in, sign-up", () => {
    const all = urls();
    expect(all).not.toContain("/major-projects/tiny-shed");
    expect(all).not.toContain("/fr/major-projects/tiny-shed");
    for (const p of ["/sign-in", "/sign-up", "/fr/sign-in", "/es/sign-up", "/forgot-password", "/onboarding"]) expect(all).not.toContain(p);
  });

  it("always lists the weekly-email page (its sign-up form is always shown and indexable)", () => {
    const all = urls();
    expect(all).toContain("/weekly-email");
    expect(all).toContain("/fr/weekly-email");
    expect(all).toContain("/es/weekly-email");
  });

  it("has no duplicate URLs and stays under one sitemap file's limit", () => {
    const all = urls();
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeLessThan(45_000);
  });
});
