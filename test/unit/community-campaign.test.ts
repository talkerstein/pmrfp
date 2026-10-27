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
});
