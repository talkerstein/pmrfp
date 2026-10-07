import { describe, expect, it } from "vitest";
import { onboardingPath, parseRoleChoice, resolveRolePick, ROLE_CHOICES } from "@/lib/auth/oauth";
import {
  buyerTags,
  isBuyerOrgType,
  isCheckViolation,
  isLandlordOrg,
  parseBuyerKind,
  signupRoleLabel,
} from "@/lib/auth/org-kind";

const fresh = { primaryRole: "trade" as const, onboardingCompleted: false, metadataRole: undefined };

describe("landlord role mapping", () => {
  it("is a pickable choice", () => {
    expect(ROLE_CHOICES).toContain("landlord");
  });

  it("parses ?role=landlord and ?role=property_manager&kind=landlord", () => {
    expect(parseRoleChoice("landlord")).toBe("landlord");
    expect(parseRoleChoice("property_manager", "landlord")).toBe("landlord");
    expect(parseRoleChoice("property_manager")).toBe("property_manager");
    expect(parseRoleChoice("property_manager", "gc")).toBe("general_contractor");
    expect(parseRoleChoice("admin")).toBeNull();
  });

  it("role pick saves a landlord as a property_manager with a landlord org kind", () => {
    expect(resolveRolePick(fresh, "landlord")).toEqual({
      ok: true,
      role: "property_manager",
      builder: false,
      orgKind: "landlord",
    });
    expect(resolveRolePick(fresh, "general_contractor")).toEqual({
      ok: true,
      role: "property_manager",
      builder: true,
      orgKind: "builder",
    });
    expect(resolveRolePick(fresh, "trade")).toMatchObject({ ok: true, role: "trade", orgKind: null });
  });

  it("role pick still refuses once a role is set, and admin roles", () => {
    expect(resolveRolePick({ ...fresh, metadataRole: "property_manager" }, "landlord")).toEqual({ ok: false, reason: "already_set" });
    expect(resolveRolePick(fresh, "super_admin")).toEqual({ ok: false, reason: "invalid_role" });
  });

  it("carries the landlord choice to onboarding", () => {
    expect(onboardingPath({ role: "landlord" })).toBe("/onboarding?role=landlord");
    expect(onboardingPath({ role: "landlord", award: "x" })).toBe("/onboarding?role=landlord");
  });
});

describe("buyer org helpers", () => {
  it("treats landlords as buyers (PM capabilities), never as listings", () => {
    for (const t of ["property_manager", "owner", "builder", "landlord"]) expect(isBuyerOrgType(t)).toBe(true);
    for (const t of ["trade_company", "supplier", "admin", null]) expect(isBuyerOrgType(t)).toBe(false);
  });

  it("parses the orgKind form value", () => {
    expect(parseBuyerKind("landlord")).toBe("landlord");
    expect(parseBuyerKind("builder")).toBe("builder");
    expect(parseBuyerKind("property_manager")).toBeNull();
    expect(parseBuyerKind(null)).toBeNull();
  });

  it("recognizes landlord orgs, including the pre-migration fallback", () => {
    expect(isLandlordOrg("landlord")).toBe(true);
    expect(isLandlordOrg("property_manager", "landlord")).toBe(true);
    expect(isLandlordOrg("property_manager")).toBe(false);
    expect(isLandlordOrg("trade_company", "landlord")).toBe(false);
  });

  it("detects the CHECK violation that triggers the fallback", () => {
    expect(isCheckViolation({ code: "23514" })).toBe(true);
    expect(isCheckViolation({ message: 'violates check constraint "organizations_organization_type_check"' })).toBe(true);
    expect(isCheckViolation({ code: "23505" })).toBe(false);
    expect(isCheckViolation(null)).toBe(false);
  });

  it("tags and labels landlord sign-ups", () => {
    expect(buyerTags("pmrfp-signup", "landlord")).toEqual(["pmrfp-signup", "pmrfp-landlord", "landlord"]);
    expect(buyerTags("pmrfp-signup", "builder")).toEqual(["pmrfp-signup", "pmrfp-gc"]);
    expect(buyerTags("pmrfp-signup", null)).toEqual(["pmrfp-signup"]);
    expect(signupRoleLabel("property_manager", "landlord")).toBe("Landlord");
  });
});
