import { beforeEach, describe, expect, it, vi } from "vitest";

/** The smaller pieces of "earn the link": emails, robots, the proxy matcher, admin gating, the click-out lookup, the agencies page copy. */
const h = vi.hoisted(() => ({
  isAdmin: false,
  serviceCalls: 0,
  rows: [] as Record<string, unknown>[],
  readQueries: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/access/access", () => ({
  requireRole: async () => {
    if (!h.isAdmin) throw new Error("forbidden");
    return { userId: "admin-1" };
  },
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    h.serviceCalls++;
    throw new Error("service client must not be reached without the admin check");
  },
}));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/karma/sync", () => ({ karmaSyncAfter: async () => undefined }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => undefined }));
vi.mock("@/lib/supabase/read", () => ({
  createReadClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          h.readQueries++;
          return { data: h.rows[0] ?? null, error: null };
        },
      };
      return q;
    },
  }),
}));

import robots from "@/app/robots";
import { config as proxyConfig } from "@/proxy";
import { trackablePath } from "@/lib/tracking/privacy";
import { getOutTarget } from "@/lib/links/data";
import { renderStep, sampleCopyData } from "@/lib/lifecycle/copy";
import { BADGE_STRINGS } from "@/lib/lifecycle/badge-copy";
import agencies from "@/i18n/messages/agencies";
import dash from "@/i18n/messages/dash";
import {
  addBlockedDomainAction,
  removeBlockedDomainAction,
  resolveHeldOrganizationAction,
  setLinkTrustedAction,
} from "@/lib/admin/org-actions";

const CTX = { base: "https://pmrfp.com", unsubscribeUrl: "https://pmrfp.com/api/email/lifecycle-unsubscribe?u=u1&t=abc" };

describe("badge emails carry the one honest line about the followed link", () => {
  const LINE: Record<"en" | "fr" | "es", RegExp> = {
    en: /Once the badge is on your site and your profile has been live 14 days, your PMRFP link to your website becomes a followed link\./,
    fr: /Badge sur votre site et profil en ligne depuis 14 jours : le lien de PMRFP vers votre site devient un lien suivi\./,
    es: /Con la insignia en su sitio y el perfil publicado 14 días, el enlace de PMRFP a su sitio pasa a ser un enlace seguido\./,
  };
  for (const lang of ["en", "fr", "es"] as const) {
    for (const step of ["badge", "welcome_back"] as const) {
      for (const country of ["CA", "US"] as const) {
        it(`${step}/${lang}/${country}: the line is there, under 150 words, no ranking promise`, () => {
          const e = renderStep(step, sampleCopyData(step, lang, country, "specialty", { reward: true, website: true }), CTX);
          expect(e.text).toMatch(LINE[lang]);
          expect(e.words).toBeLessThan(150);
          expect(e.html).toContain("14");
          expect(e.text).not.toMatch(/guarante[ée]|garantiz|top of google|first page|more traffic/i);
        });
      }
    }
  }

  it("the strings exist in all three languages", () => {
    for (const lang of ["en", "fr", "es"] as const) expect(BADGE_STRINGS[lang].badge.why).toContain("14");
  });
});

describe("agencies page and dashboard copy (en / fr / es)", () => {
  it("no language still promises a followed link to free sign-ups", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      const a = agencies[lang];
      const all = JSON.stringify(a);
      expect(all, lang).not.toMatch(/we do not add nofollow|no nofollow attribute|sans attribut nofollow|nous n'y ajoutons pas de nofollow|no le añadimos nofollow|sin atributo nofollow/i);
      expect(a.forAgencies.faq[0].a, lang).toMatch(/14/);
      expect(a.supplierLink.body, lang).toMatch(/14/);
      expect(a.forAgencies.meta.title, lang).not.toMatch(/backlinks?/i);
    }
  });

  it("the dashboard 'Your website link' card has every string in all three languages", () => {
    const keys = Object.keys(dash.en.linkCard).sort();
    for (const lang of ["fr", "es"] as const) expect(Object.keys(dash[lang].linkCard).sort()).toEqual(keys);
    for (const lang of ["en", "fr", "es"] as const) {
      const c = dash[lang].linkCard;
      expect(c.nofollowBody).toMatch(/14/);
      expect(c.clicks).toContain("{n}");
      expect(c.followedBody).toContain("{domain}");
    }
  });
});

describe("robots, proxy and analytics", () => {
  it("robots.txt disallows /out/", () => {
    const rules = robots().rules;
    const first = Array.isArray(rules) ? rules[0] : rules;
    expect(first.disallow).toEqual(expect.arrayContaining(["/out/", "/go/"]));
  });

  it("the proxy matcher skips /out/ (no session refresh, no rate-limit call there)", () => {
    const re = new RegExp(`^${proxyConfig.matcher[0]}$`);
    expect(re.test("/out/acme-paving")).toBe(false);
    expect(re.test("/directory/acme-paving")).toBe(true);
    expect(re.test("/outdoor-tools")).toBe(true);
  });

  it("page-view tracking ignores /out", () => {
    expect(trackablePath("/out/acme-paving")).toBe(false);
    expect(trackablePath("/directory/acme-paving")).toBe(true);
  });
});

describe("getOutTarget: one lookup, only live companies, valid slugs", () => {
  beforeEach(() => {
    h.rows = [];
    h.readQueries = 0;
  });

  it("a live company resolves to its normalized website", async () => {
    h.rows = [{ website: "acmepaving.ca", profile_status: "approved", status: "active", is_demo: false }];
    expect(await getOutTarget("acme-paving")).toBe("https://acmepaving.ca/");
    expect(h.readQueries).toBe(1);
  });

  it("held, rejected, suspended and demo companies resolve to nothing", async () => {
    for (const row of [
      { website: "https://x.ca", profile_status: "pending_review", status: "active", is_demo: false },
      { website: "https://x.ca", profile_status: "rejected", status: "active", is_demo: false },
      { website: "https://x.ca", profile_status: "suspended", status: "active", is_demo: false },
      { website: "https://x.ca", profile_status: "approved", status: "suspended", is_demo: false },
      { website: "https://x.ca", profile_status: "approved", status: "active", is_demo: true },
    ]) {
      h.rows = [row];
      expect(await getOutTarget("some-slug")).toBeNull();
    }
  });

  it("a stored value that isn't an http(s) website never becomes a redirect", async () => {
    for (const website of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://x.ca", "", null]) {
      h.rows = [{ website, profile_status: "approved", status: "active", is_demo: false }];
      expect(await getOutTarget("acme"), String(website)).toBeNull();
    }
  });

  it("slugs that aren't slugs never reach the database", async () => {
    for (const slug of ["", "../x", "a b", "https://evil.example", "x".repeat(200), "a/b"]) {
      expect(await getOutTarget(slug), slug).toBeNull();
    }
    expect(h.readQueries).toBe(0);
  });
});

describe("admin gating: the spam-check and link actions need an admin", () => {
  beforeEach(() => {
    h.isAdmin = false;
    h.serviceCalls = 0;
  });

  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };

  it("a non-admin is stopped before any database client is created", async () => {
    await expect(resolveHeldOrganizationAction(fd({ id: "o1", decision: "approved" }))).rejects.toThrow("forbidden");
    await expect(setLinkTrustedAction(fd({ id: "o1", trusted: "1" }))).rejects.toThrow("forbidden");
    await expect(addBlockedDomainAction(fd({ domain: "bad-seo.com" }))).rejects.toThrow("forbidden");
    await expect(removeBlockedDomainAction(fd({ domain: "bad-seo.com" }))).rejects.toThrow("forbidden");
    expect(h.serviceCalls).toBe(0);
  });

  it("an admin with a bad decision or domain is sent back without touching the database", async () => {
    h.isAdmin = true;
    await expect(resolveHeldOrganizationAction(fd({ id: "o1", decision: "pending_review" }))).rejects.toThrow("redirect:/admin/organizations?view=held");
    await expect(addBlockedDomainAction(fd({ domain: "not a domain" }))).rejects.toThrow("redirect:/admin/blocked-domains?error=domain");
    expect(h.serviceCalls).toBe(0);
  });
});
