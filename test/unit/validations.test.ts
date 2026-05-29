import { describe, expect, it } from "vitest";
import {
  companyProfileSchema,
  contactRequestSchema,
  interestSchema,
  rfpPostSchema,
  signUpSchema,
} from "@/lib/validations";

const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

const baseRfp = {
  title: "Test RFP",
  summary: "summary",
  scope: "scope",
  categories: ["electrical"],
  regionSlug: "toronto",
  contactVisibility: "pmrfp_mediated" as const,
  acceptTerms: true as const,
};

describe("rfpPostSchema", () => {
  it("accepts a future deadline", () => {
    expect(rfpPostSchema.safeParse({ ...baseRfp, deadline: future }).success).toBe(true);
  });
  it("rejects a past deadline", () => {
    const r = rfpPostSchema.safeParse({ ...baseRfp, deadline: past });
    expect(r.success).toBe(false);
  });
  it("requires at least one category", () => {
    expect(rfpPostSchema.safeParse({ ...baseRfp, categories: [], deadline: future }).success).toBe(false);
  });
  it("requires accepting terms", () => {
    expect(rfpPostSchema.safeParse({ ...baseRfp, acceptTerms: false, deadline: future }).success).toBe(false);
  });
});

describe("interestSchema", () => {
  it("requires a message and the disclaimer checkbox", () => {
    expect(interestSchema.safeParse({ rfpId: "x", message: "", acceptDisclaimer: true }).success).toBe(false);
    expect(interestSchema.safeParse({ rfpId: "x", message: "hi", acceptDisclaimer: false }).success).toBe(false);
    expect(interestSchema.safeParse({ rfpId: "x", message: "hi", acceptDisclaimer: true }).success).toBe(true);
  });
  it("caps message length at 2000", () => {
    expect(interestSchema.safeParse({ rfpId: "x", message: "a".repeat(2001), acceptDisclaimer: true }).success).toBe(false);
  });
});

describe("companyProfileSchema", () => {
  const base = { name: "Co", email: "a@b.com", publicContactVisibility: "request_intro" as const };
  it("requires >=1 category and >=1 region", () => {
    expect(companyProfileSchema.safeParse({ ...base, categories: [], regions: ["toronto"] }).success).toBe(false);
    expect(companyProfileSchema.safeParse({ ...base, categories: ["electrical"], regions: [] }).success).toBe(false);
    expect(companyProfileSchema.safeParse({ ...base, categories: ["electrical"], regions: ["toronto"] }).success).toBe(true);
  });
});

describe("contactRequestSchema", () => {
  it("requires name, email, message", () => {
    expect(contactRequestSchema.safeParse({ name: "", email: "a@b.com", message: "hi" }).success).toBe(false);
    expect(contactRequestSchema.safeParse({ name: "A", email: "bad", message: "hi" }).success).toBe(false);
    expect(contactRequestSchema.safeParse({ name: "A", email: "a@b.com", message: "hi" }).success).toBe(true);
  });
});

describe("signUpSchema", () => {
  it("enforces role enum and 8-char password", () => {
    expect(signUpSchema.safeParse({ fullName: "A", email: "a@b.com", password: "short", role: "trade" }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "A", email: "a@b.com", password: "longenough", role: "nope" }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "A", email: "a@b.com", password: "longenough", role: "trade" }).success).toBe(true);
  });
});
