import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INSURED, insuranceText, nextInsuranceStatus } from "@/lib/organizations/insurance";
import { companyProfileSchema } from "@/lib/validations";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("nextInsuranceStatus", () => {
  const base = { policyNumber: "", hadPolicy: false, removeLine: false, current: null as string | null };

  it("says Insured once a policy number is given, replacing older wording", () => {
    expect(nextInsuranceStatus({ ...base, policyNumber: "ABC123" })).toBe(INSURED);
    expect(nextInsuranceStatus({ ...base, policyNumber: "ABC123", current: "$5M" })).toBe(INSURED);
  });

  it("clears the line when the number is removed", () => {
    expect(nextInsuranceStatus({ ...base, hadPolicy: true, current: INSURED })).toBeNull();
  });

  it("keeps a company's older wording until they change it", () => {
    expect(nextInsuranceStatus({ ...base, current: "Fully insured" })).toBe("Fully insured");
    expect(nextInsuranceStatus({ ...base, current: "Fully insured", removeLine: true })).toBeNull();
  });

  it("stays empty when nothing was ever given", () => {
    expect(nextInsuranceStatus(base)).toBeNull();
  });
});

describe("insuranceText", () => {
  it("translates only the word we wrote", () => {
    expect(insuranceText(INSURED, "fr")).toBe("Assuré");
    expect(insuranceText(INSURED, "es")).toBe("Asegurado");
    expect(insuranceText("$5M", "fr")).toBe("$5M");
    expect(insuranceText(null, "en")).toBeNull();
  });
});

describe("the policy number stays hidden", () => {
  const base = { name: "A", email: "a@example.com", publicContactVisibility: "request_intro", categories: ["x"], regions: ["y"] };

  it("trims the number and caps its length", () => {
    const ok = companyProfileSchema.safeParse({ ...base, insurancePolicyNumber: "  ABC 123 " });
    expect(ok.success && ok.data.insurancePolicyNumber).toBe("ABC 123");
    expect(companyProfileSchema.safeParse({ ...base, insurancePolicyNumber: "x".repeat(81) }).success).toBe(false);
  });

  it("has no column on the publicly readable organizations table", () => {
    const sql = read("supabase", "migrations", "20261105000100_insurance_policy_numbers.sql");
    expect(sql).not.toMatch(/alter\s+table\s+public\.organizations\b/i);
    expect(sql).not.toMatch(/\bto\s+anon\b/i);
    expect(sql).toMatch(/revoke all on public\.organization_insurance_policies from anon/i);
  });

  it("is read only by the company's own form", () => {
    for (const file of [
      ["src", "lib", "data", "directory.ts"],
      ["src", "app", "[lang]", "(v3)", "directory", "[slug]", "page.tsx"],
      ["src", "app", "[lang]", "pm-dashboard", "rfps", "[id]", "interests", "page.tsx"],
      ["src", "lib", "bid-compare", "server.ts"],
    ]) {
      expect(read(...file)).not.toMatch(/organization_insurance_policies|policy_number/);
    }
  });
});
