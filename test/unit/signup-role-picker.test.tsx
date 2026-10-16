import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sign-up role picker fix (businesses signing up as "visitor" and never
 * getting listed): the two-step picker, the renamed visitor labels, the
 * visitor → business switch (only ever FROM visitor) and the Google default.
 */

const h = vi.hoisted(() => ({
  session: null as null | { userId: string; profile: { primary_role: string; onboarding_completed: boolean } },
  updates: [] as { values: Record<string, unknown>; filters: [string, unknown][] }[],
  profileRole: "visitor" as string | null,
  audit: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/audit", () => ({ logAudit: async (x: unknown) => void h.audit.push(x) }));
vi.mock("@/lib/access/access", () => ({
  getSession: async () => h.session,
  requireRole: async () => ({ userId: "staff-1", profile: { primary_role: "admin" } }),
  roleHome: (r: string) => (r === "trade" || r === "supplier" ? "/dashboard" : r === "property_manager" ? "/pm-dashboard" : "/directory"),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const filters: [string, unknown][] = [];
      let values: Record<string, unknown> | null = null;
      const q = {
        update(v: Record<string, unknown>) {
          values = v;
          return q;
        },
        select() {
          return q;
        },
        eq(k: string, v: unknown) {
          filters.push([k, v]);
          return q;
        },
        async maybeSingle() {
          return { data: h.profileRole ? { primary_role: h.profileRole } : null, error: null };
        },
        then(res: (x: unknown) => void) {
          // An update: matches only while the row is still a visitor (the SQL filter).
          h.updates.push({ values: values ?? {}, filters });
          const visitorFilter = filters.find(([k]) => k === "primary_role");
          const matches = !visitorFilter || visitorFilter[1] === h.profileRole;
          if (matches && values?.primary_role) h.profileRole = String(values.primary_role);
          res({ data: matches ? [{ id: "u1" }] : [], error: null });
        },
      };
      return q;
    },
    auth: { admin: { updateUserById: async () => ({ error: null }) } },
  }),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { SignupRolePicker, groupOf, roleForGroup } from "@/components/home-v3/signup-role-picker";
import { looksLikeBusiness, resolveVisitorUpgrade, tradeLeaningArrival } from "@/lib/auth/visitor-upgrade";
import { DEFAULT_SIGNUP_ROLE, ROLE_CHOICES, parseRoleChoice, resolveRolePick } from "@/lib/auth/oauth";
import { adminConvertVisitorAction, upgradeVisitorAction } from "@/lib/auth/visitor-upgrade-actions";

const LANGS: Locale[] = ["en", "fr", "es"];
const picker = (lang: Locale, role: Parameters<typeof SignupRolePicker>[0]["role"] = "") =>
  renderToStaticMarkup(<SignupRolePicker t={getDictionary(lang).v3Pages.signup} role={role} onRole={() => {}} onLooking={() => {}} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("sign-up role picker", () => {
  for (const lang of LANGS) {
    it(`${lang}: three primary cards and a separate "just looking" link, nothing preselected`, () => {
      const t = getDictionary(lang).v3Pages.signup;
      const html = picker(lang);
      expect(count(html, "data-group=")).toBe(3);
      for (const g of ["work", "hire", "talent"] as const) expect(html).toContain(t.groups[g].name.replace(/'/g, "&#x27;"));
      expect(count(html, 'aria-checked="true"')).toBe(0);
      // Visitor is not one of the cards: a plain button after them.
      expect(count(html, 'data-role="visitor"')).toBe(1);
      expect(html).toContain("v3-su-lookbtn");
      expect(html.indexOf("v3-su-lookbtn")).toBeGreaterThan(html.lastIndexOf("data-group="));
      expect(html).not.toContain('class="v3-su-opt"'); // no sub-choice until a card is picked
    });
  }

  it("shows the sub-choice for the picked card", () => {
    const work = picker("en", "trade");
    expect(count(work, 'class="v3-su-opt"')).toBe(2);
    expect(work).toContain('data-role="supplier"');
    const hire = picker("en", "landlord");
    expect(count(hire, 'class="v3-su-opt"')).toBe(4);
    expect(count(hire, 'aria-checked="true"')).toBe(2); // the "hire" card and "landlord"
    expect(count(picker("en", "talent"), 'class="v3-su-opt"')).toBe(0);
  });

  it("maps cards to roles without ever landing on visitor", () => {
    expect(groupOf("visitor")).toBeNull();
    expect(groupOf("general_contractor")).toBe("hire");
    expect(roleForGroup("work", "")).toBe("trade");
    expect(roleForGroup("work", "supplier")).toBe("supplier");
    expect(roleForGroup("hire", "trade")).toBe("");
    expect(roleForGroup("talent", "visitor")).toBe("talent");
  });

  it("every card says what you get", () => {
    for (const lang of LANGS) {
      const g = getDictionary(lang).v3Pages.signup.groups;
      expect(g.work.desc.length).toBeGreaterThan(40);
      expect(g.hire.desc.length).toBeGreaterThan(40);
      expect(g.talent.desc.length).toBeGreaterThan(30);
    }
    const en = getDictionary("en").v3Pages.signup.groups;
    expect(en.work.desc).toMatch(/free listing/i);
    expect(en.hire.desc).toMatch(/free/i);
    expect(en.hire.desc).toMatch(/private until you approve/i);
    expect(en.talent.desc).toMatch(/free profile/i);
  });
});

describe("visitor labels", () => {
  const want: Record<Locale, string> = {
    en: "Just looking (no business listing)",
    fr: "Je regarde seulement (pas d'entreprise à inscrire)",
    es: "Solo estoy mirando (sin negocio que publicar)",
  } as Record<Locale, string>;
  for (const lang of LANGS) {
    it(`${lang}: renamed everywhere`, () => {
      const d = getDictionary(lang);
      expect(d.v3Pages.signup.roles.visitor.name).toBe(want[lang]);
      expect(d.auth.forms.roles.visitor.label).toBe(want[lang]);
      expect(d.v3Pages.signup.roles.visitor.name).not.toMatch(/directory|répertoire|directorio/i);
      expect(d.v3Pages.signup.looking.length).toBeGreaterThan(10);
    });
  }
});

describe("resolveVisitorUpgrade", () => {
  it("switches only from visitor, only to a business role", () => {
    expect(resolveVisitorUpgrade("visitor", "trade")).toEqual({ ok: true, to: "trade", changed: true });
    expect(resolveVisitorUpgrade("visitor", "supplier")).toEqual({ ok: true, to: "supplier", changed: true });
    expect(resolveVisitorUpgrade("trade", "trade")).toEqual({ ok: true, to: "trade", changed: false });
    for (const r of ["property_manager", "admin", "super_admin", "talent", "real_estate_agent"] as const) {
      expect(resolveVisitorUpgrade(r, "trade")).toEqual({ ok: false, reason: "not_visitor" });
    }
    expect(resolveVisitorUpgrade("supplier", "trade")).toEqual({ ok: false, reason: "not_visitor" });
    for (const bad of ["admin", "property_manager", "visitor", "", null, 1]) {
      expect(resolveVisitorUpgrade("visitor", bad)).toEqual({ ok: false, reason: "invalid_role" });
    }
  });
});

describe("conversion actions", () => {
  beforeEach(() => {
    h.updates = [];
    h.audit = [];
  });
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };

  it("member: visitor → trade, reopens onboarding, logs it", async () => {
    h.session = { userId: "u1", profile: { primary_role: "visitor", onboarding_completed: true } };
    h.profileRole = "visitor";
    await expect(upgradeVisitorAction({}, fd({ role: "trade", lang: "en", company: "GTA Pest Control" }))).rejects.toThrow("REDIRECT:/onboarding");
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].values).toEqual({ primary_role: "trade", onboarding_completed: false });
    expect(h.updates[0].filters).toContainEqual(["primary_role", "visitor"]);
    expect(h.audit).toHaveLength(1);
  });

  it("member: not a visitor → nothing changes", async () => {
    h.session = { userId: "u1", profile: { primary_role: "property_manager", onboarding_completed: true } };
    h.profileRole = "property_manager";
    await expect(upgradeVisitorAction({}, fd({ role: "trade", lang: "en" }))).rejects.toThrow("REDIRECT:/pm-dashboard");
    expect(h.updates).toHaveLength(0);
  });

  it("member: a bad role is refused", async () => {
    h.session = { userId: "u1", profile: { primary_role: "visitor", onboarding_completed: false } };
    expect(await upgradeVisitorAction({}, fd({ role: "admin", lang: "fr" }))).toEqual({ error: getDictionary("fr").auth.visitorUpgrade.pickOne });
    expect(h.updates).toHaveLength(0);
  });

  it("staff: converts a visitor; idempotent; never touches other roles", async () => {
    h.profileRole = "visitor";
    await expect(adminConvertVisitorAction(fd({ userId: "u1", role: "trade" }))).rejects.toThrow("REDIRECT:/admin/users");
    expect(h.updates).toHaveLength(1);
    expect(h.profileRole).toBe("trade");
    // Second click: already a trade, nothing written.
    await expect(adminConvertVisitorAction(fd({ userId: "u1", role: "trade" }))).rejects.toThrow("REDIRECT:/admin/users");
    expect(h.updates).toHaveLength(1);
    h.profileRole = "property_manager";
    await expect(adminConvertVisitorAction(fd({ userId: "u2", role: "trade" }))).rejects.toThrow("REDIRECT:/admin/users");
    h.profileRole = "admin";
    await expect(adminConvertVisitorAction(fd({ userId: "u3", role: "supplier" }))).rejects.toThrow("REDIRECT:/admin/users");
    expect(h.updates).toHaveLength(1);
    expect(h.audit).toHaveLength(1);
  });
});

describe("Google sign-in default", () => {
  it("is never visitor, and visitor can't be picked there", () => {
    expect(DEFAULT_SIGNUP_ROLE).not.toBe("visitor");
    expect(ROLE_CHOICES as readonly string[]).not.toContain("visitor");
    expect(parseRoleChoice("visitor")).toBeNull();
    expect(resolveRolePick({ primaryRole: DEFAULT_SIGNUP_ROLE, onboardingCompleted: false, metadataRole: undefined }, "visitor")).toEqual({ ok: false, reason: "invalid_role" });
  });
});

describe("safety-net heuristics", () => {
  it("spots business names and company email domains", () => {
    expect(looksLikeBusiness({ name: "GTA Pest Control" })).toBe(true);
    expect(looksLikeBusiness({ name: "Fresh One Cleaning Inc." })).toBe(true);
    expect(looksLikeBusiness({ name: "2456789 Ontario Inc" })).toBe(true);
    expect(looksLikeBusiness({ name: "Entretien Ménager Apna" })).toBe(true);
    expect(looksLikeBusiness({ name: "Jane Doe", email: "jane@apnaservices.ca" })).toBe(true);
    expect(looksLikeBusiness({ name: "Jane Doe", email: "jane@gmail.com" })).toBe(false);
    expect(looksLikeBusiness({ name: "John Snow", email: "john@hotmail.ca" })).toBe(false);
    expect(looksLikeBusiness({ name: "Pat Lee", email: "pat.lee@ontario.ca" })).toBe(false);
    expect(looksLikeBusiness({})).toBe(false);
  });

  it("starts on 'I do the work' for trade pages and trade campaigns, not buyer ones", () => {
    const ft = (path: string, utm: Record<string, string> = {}) => ({ path, ref: "", utm, first: "2026-10-16", lang: "en", country: "CA" });
    expect(tradeLeaningArrival({ referrerPath: "/rfps/some-tender" })).toBe(true);
    expect(tradeLeaningArrival({ referrerPath: "/fr/for-trades" })).toBe(true);
    expect(tradeLeaningArrival({ firstTouch: ft("/", { source: "lifecycle", campaign: "day3" }) })).toBe(true);
    expect(tradeLeaningArrival({ firstTouch: ft("/rfps", { campaign: "pm-invite-oct1" }) })).toBe(false);
    expect(tradeLeaningArrival({ referrerPath: "/for-property-managers" })).toBe(false);
    expect(tradeLeaningArrival({ referrerPath: "/" })).toBe(false);
    expect(tradeLeaningArrival({})).toBe(false);
  });
});
