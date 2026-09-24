import { describe, expect, it } from "vitest";
import {
  GC_BADGE,
  gcFormPath,
  gcPackageTitle,
  gcPostPath,
  isGcPackage,
  isGcSchemaMissingError,
  isLinkableAward,
  parseAwardRef,
  sourceTypeLabel,
} from "@/lib/gc/packages";
import { isIndexableRfp } from "@/lib/seo/rfp-indexing";

describe("GC sub-trade packages", () => {
  it("labels where a listing came from", () => {
    expect(sourceTypeLabel("gc_package", "roofing-package-x1")).toBe(GC_BADGE);
    expect(sourceTypeLabel("public_source", "arena-roof-tor-12345")).toBe("Public tender · City of Toronto");
    expect(sourceTypeLabel("property_manager_direct", "anything")).toBeNull();
    expect(sourceTypeLabel("admin_seeded", "anything")).toBeNull();
    expect(sourceTypeLabel(null, "anything")).toBeNull();
    expect(isGcPackage({ sourceType: "gc_package" })).toBe(true);
    expect(isGcPackage({ sourceType: "public_source" })).toBe(false);
  });

  it("titles a package from the trade and the project", () => {
    expect(gcPackageTitle("Roofing", "  Etobicoke   school renovation ")).toBe("Roofing package — Etobicoke school renovation");
    expect(gcPackageTitle("HVAC", "x".repeat(300))).toHaveLength(178);
  });

  it("reads the award from a slug, a path or a full link — and nothing else", () => {
    expect(parseAwardRef("roof-work-cba-ws123")).toBe("roof-work-cba-ws123");
    expect(parseAwardRef("/rfps/roof-work-cba-ws123")).toBe("roof-work-cba-ws123");
    expect(parseAwardRef("https://pmrfp.com/rfps/roof-work-cba-ws123?utm=x")).toBe("roof-work-cba-ws123");
    expect(parseAwardRef("https://pmrfp.com/rfps/roof-work-cba-ws123/")).toBe("roof-work-cba-ws123");
    expect(parseAwardRef("")).toBeNull();
    expect(parseAwardRef(null)).toBeNull();
    expect(parseAwardRef("not a slug!")).toBeNull();
    expect(parseAwardRef("https://evil.example/<script>")).toBeNull();
  });

  it("only links real past public contracts", () => {
    expect(isLinkableAward({ slug: "roof-work-cba-ws123", sourceType: "public_source" })).toBe(true);
    // An open public tender isn't an award.
    expect(isLinkableAward({ slug: "arena-roof-tor-12345", sourceType: "public_source" })).toBe(false);
    expect(isLinkableAward({ slug: "roof-work-cba-ws123", sourceType: "gc_package" })).toBe(false);
  });

  it("recognises the errors a pre-migration database returns", () => {
    expect(isGcSchemaMissingError({ code: "23514", message: 'violates check constraint "rfp_posts_source_type_check"' })).toBe(true);
    expect(isGcSchemaMissingError({ code: "PGRST204", message: "Could not find the 'gc_project_name' column" })).toBe(true);
    expect(isGcSchemaMissingError({ code: "42703", message: "column does not exist" })).toBe(true);
    expect(isGcSchemaMissingError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isGcSchemaMissingError(null)).toBe(false);
  });

  it("builds the start and form links with the award", () => {
    expect(gcPostPath("a-cba-1")).toBe("/gc-packages/new?award=a-cba-1");
    expect(gcPostPath(null)).toBe("/gc-packages/new");
    expect(gcFormPath("a-cba-1")).toBe("/pm-dashboard/rfps/new?kind=gc&award=a-cba-1");
    expect(gcFormPath()).toBe("/pm-dashboard/rfps/new?kind=gc");
  });

  it("indexes open packages like any open RFP", () => {
    const pkg = { slug: "roofing-package-school-ab12", sourceType: "gc_package", status: "open" as const, isDemo: false };
    expect(isIndexableRfp(pkg)).toBe(true);
    expect(isIndexableRfp({ ...pkg, status: "closed" })).toBe(false);
  });
});
