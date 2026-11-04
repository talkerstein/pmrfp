import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let LANG: "en" | "fr" | "es" = "en";
vi.mock("@/i18n/server", async () => {
  const { getDictionary } = await import("@/i18n/dictionaries");
  return {
    getLang: () => LANG,
    getT: (ns: string) => (getDictionary(LANG) as unknown as Record<string, unknown>)[ns],
  };
});
vi.mock("@/i18n/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { ListingStatusBanner } from "@/components/dashboard/listing-status-banner";
import { ProfileCompletionCard } from "@/components/dashboard/profile-completion-card";
import type { Organization, ProfileStatus } from "@/types/db";

const banner = (status: ProfileStatus, welcome = false) =>
  renderToStaticMarkup(<ListingStatusBanner status={status} name="Acme Roofing" slug="acme" welcome={welcome} />);

beforeEach(() => {
  LANG = "en";
});

describe("listing status banner", () => {
  it("confirms a live listing right after onboarding, with its public page", () => {
    const html = banner("approved", true);
    expect(html).toContain("is live in the directory");
    expect(html).toContain('href="/directory/acme"');
  });

  it("says nothing about a live listing on later visits", () => {
    expect(banner("approved")).toBe("");
    expect(banner("draft", true)).toBe("");
  });

  it("explains a review, and promises the email that's now sent", () => {
    const html = banner("pending_review", true);
    expect(html).toContain("You&#x27;re in");
    expect(html).toContain("isn&#x27;t public yet");
    expect(html).toContain("We&#x27;ll email you");
    expect(banner("pending_review")).not.toContain("You&#x27;re in");
  });

  it("gives a turned-down or suspended company an address to write to", () => {
    expect(banner("rejected")).toContain("info@pmrfp.com");
    expect(banner("suspended")).toContain("info@pmrfp.com");
  });

  it("never mentions spam checks", () => {
    for (const status of ["pending_review", "rejected", "suspended"] as const) {
      expect(banner(status, true).toLowerCase()).not.toContain("spam");
    }
  });

  it("speaks the page's language", () => {
    LANG = "fr";
    expect(banner("pending_review")).toContain("vérification");
    LANG = "es";
    expect(banner("pending_review")).toContain("revisión");
  });
});

describe("profile completion card", () => {
  const filled = {
    logo_url: "x",
    short_description: "x",
    full_description: "x",
    website: "x",
    phone: "x",
    city: "x",
    insurance_status: "x",
    wsib_status: null,
    employee_count_range: "x",
  };
  const card = (where: { province: string; country: string }) =>
    renderToStaticMarkup(<ProfileCompletionCard org={{ ...filled, ...where } as unknown as Organization} />);

  it("asks a Canadian company for WSIB", () => {
    expect(card({ province: "Ontario", country: "CA" })).toContain("WSIB");
  });

  it("doesn't ask a U.S. company for WSIB", () => {
    const html = card({ province: "Minnesota", country: "US" });
    expect(html).not.toContain("WSIB");
    expect(html).toContain("Your profile is complete");
  });

  it("doesn't count buying Trade Pro as a profile step", () => {
    expect(card({ province: "Ontario", country: "CA" })).not.toContain("Trade Pro");
  });
});
