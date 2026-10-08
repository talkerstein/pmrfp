import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => false }));

import { MAX_PREF_SLUGS, parsePrefSlugs } from "./signup-prefs";

describe("sign-up trade/region picks", () => {
  it("keeps slug-shaped strings, lower-cased and de-duplicated", () => {
    expect(parsePrefSlugs(["hvac", "Roofing", "hvac", "greater-toronto-area"])).toEqual(["hvac", "roofing", "greater-toronto-area"]);
  });
  it("drops anything that is not a slug", () => {
    expect(parsePrefSlugs(["a b", "<script>", "", 5, null, "-x", "ok-1"])).toEqual(["ok-1"]);
    expect(parsePrefSlugs("hvac")).toEqual([]);
  });
  it("caps the list", () => {
    const many = Array.from({ length: 100 }, (_, i) => `t-${i}`);
    expect(parsePrefSlugs(many)).toHaveLength(MAX_PREF_SLUGS);
  });
});
