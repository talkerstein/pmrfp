import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMUNITY_CAMPAIGNS, communityOfferNote, communitySignUpHref, parseCommunityCampaign } from "@/lib/campaigns/community";

describe("community campaign links", () => {
  it("only known codes count", () => {
    expect(parseCommunityCampaign("ejt")?.group).toBe("Everything Jewish Toronto");
    expect(parseCommunityCampaign("toString")).toBeNull();
    expect(parseCommunityCampaign("EJT")).toBeNull();
    expect(parseCommunityCampaign(undefined)).toBeNull();
  });

  it("sign-up links carry the campaign and the role", () => {
    expect(communitySignUpHref("ejt")).toBe("/sign-up?campaign=ejt");
    expect(communitySignUpHref("ejt", "landlord")).toBe("/sign-up?role=landlord&campaign=ejt");
  });

  it("the confirmation says free registration and no card, nothing more", () => {
    expect(communityOfferNote(COMMUNITY_CAMPAIGNS.ejt)).toBe("Everything Jewish Toronto link applied: free registration, no card needed.");
  });

  it("the landing page stays unlisted: noindex, nofollow, not in the sitemap", () => {
    const page = readFileSync("src/app/[lang]/(v3)/welcome/ejt/page.tsx", "utf8");
    expect(page).toMatch(/robots: \{ index: false, follow: false/);
    expect(readFileSync("src/app/sitemap.ts", "utf8")).not.toMatch(/welcome/);
  });

  it("a group link asks for the name (and company) on the sign-up form, under the fields the action reads", () => {
    const flow = readFileSync("src/components/home-v3/signup-flow.tsx", "utf8");
    expect(flow).toMatch(/const askName = !!p\.offer;/);
    expect(flow).toMatch(/name="fullName" type="text" required/);
    expect(flow).toMatch(/name="pref_company" type="text" required=\{isSeller\}/);
    const action = readFileSync("src/lib/auth/actions.ts", "utf8");
    expect(action).toMatch(/formData\.get\("fullName"\)/);
    expect(action).toMatch(/formData\.get\("pref_company"\)/);
  });
});

describe("popup area order", () => {
  it("leads with the visitor's own country so a U.S. visitor does not land on Ontario", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/home-v3/home-v3.tsx", "utf8");
    expect(src).toContain('const areaOpts = market === "US"');
    expect(src).not.toContain("data.areaOptions[Number(");
    expect(src).toContain("areaOpts.map((o, i)");
  });
});
