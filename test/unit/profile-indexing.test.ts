import { describe, expect, it } from "vitest";
import { descriptionLength, profileIndexable } from "@/lib/links/indexing";

const good = { approved: true, riskFlagged: false, descriptionLength: 120, hasLogo: true, projectCount: 2, emailDomainVerified: true };

describe("which profiles search engines may index", () => {
  it("a quality profile is indexable", () => {
    expect(profileIndexable(good)).toBe(true);
  });

  it("not approved is noindex", () => {
    expect(profileIndexable({ ...good, approved: false })).toBe(false);
  });

  it("flagged by the spam check is noindex, even with content", () => {
    expect(profileIndexable({ ...good, riskFlagged: true })).toBe(false);
  });

  it("thin = no 80-char description AND no logo AND no project AND no verified email domain", () => {
    const thin = { approved: true, descriptionLength: 20, hasLogo: false, projectCount: 0, emailDomainVerified: false };
    expect(profileIndexable(thin)).toBe(false);
    // any one of the four is enough to stay indexable
    expect(profileIndexable({ ...thin, descriptionLength: 80 })).toBe(true);
    expect(profileIndexable({ ...thin, hasLogo: true })).toBe(true);
    expect(profileIndexable({ ...thin, projectCount: 1 })).toBe(true);
    expect(profileIndexable({ ...thin, emailDomainVerified: true })).toBe(true);
    expect(profileIndexable({ ...thin, descriptionLength: 79 })).toBe(false);
  });

  it("measures the longer description", () => {
    expect(descriptionLength("short", "x".repeat(90))).toBe(90);
    expect(descriptionLength(null, undefined)).toBe(0);
    expect(descriptionLength("  padded  ")).toBe(6);
  });
});
