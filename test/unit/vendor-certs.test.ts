import { describe, expect, it } from "vitest";
import {
  CERT_TYPES_BY_COUNTRY,
  certStatus,
  certTypeFor,
  cleanVendorInput,
  daysUntil,
  importVendors,
  needsReminder,
  parseAmount,
  parseCertType,
  parseCsv,
  parseDate,
  reminderStage,
  sniffCertMime,
  vendorReminderStage,
} from "@/lib/vendor-certs/rules";
import { certDigestEmail, certRequestEmail } from "@/lib/vendor-certs/email-copy";

const TODAY = "2026-11-01";

describe("certificate status chip", () => {
  it("is missing without an expiry date", () => {
    expect(certStatus(null, TODAY)).toBe("missing");
    expect(certStatus("not a date", TODAY)).toBe("missing");
  });
  it("is valid beyond 30 days, expiring within 30 (inclusive), expired the day after", () => {
    expect(certStatus("2026-12-02", TODAY)).toBe("valid");
    expect(certStatus("2026-12-01", TODAY)).toBe("expiring");
    expect(certStatus("2026-11-01", TODAY)).toBe("expiring");
    expect(certStatus("2026-10-31", TODAY)).toBe("expired");
  });
  it("counts whole days across month ends", () => {
    expect(daysUntil("2026-12-01", TODAY)).toBe(30);
    expect(daysUntil("2026-10-02", TODAY)).toBe(-30);
  });
});

describe("country-first certificate types", () => {
  it("never offers WSIB to a U.S. company or workers' comp to a Canadian one", () => {
    expect(CERT_TYPES_BY_COUNTRY.CA).toContain("wsib_clearance");
    expect(CERT_TYPES_BY_COUNTRY.CA).not.toContain("workers_comp");
    expect(CERT_TYPES_BY_COUNTRY.US).toContain("workers_comp");
    expect(CERT_TYPES_BY_COUNTRY.US).not.toContain("wsib_clearance");
    expect(certTypeFor("wsib_clearance", "US")).toBe("workers_comp");
    expect(certTypeFor("workers_comp", "CA")).toBe("wsib_clearance");
  });
  it("reads free-text types from a spreadsheet", () => {
    expect(parseCertType("WSIB clearance", "CA")).toBe("wsib_clearance");
    expect(parseCertType("WSIB clearance", "US")).toBe("workers_comp");
    expect(parseCertType("Workers comp", "US")).toBe("workers_comp");
    expect(parseCertType("COI", "US")).toBe("general_liability");
    expect(parseCertType("CGL", "CA")).toBe("general_liability");
    expect(parseCertType("Fleet auto", "CA")).toBe("auto");
    expect(parseCertType("Bonding", "CA")).toBe("other");
  });
});

describe("reminder stages", () => {
  const row = (expires_on: string | null, reminder_stage: string | null = null, reminder_for: string | null = null) => ({ expires_on, reminder_stage, reminder_for });

  it("maps days to 30 / 14 / 0", () => {
    expect(reminderStage("2026-12-15", TODAY)).toBeNull();
    expect(reminderStage("2026-12-01", TODAY)).toBe("30");
    expect(reminderStage("2026-11-15", TODAY)).toBe("14");
    expect(reminderStage("2026-11-01", TODAY)).toBe("0");
    expect(reminderStage("2026-10-20", TODAY)).toBe("0");
  });
  it("sends each stage once per expiry date", () => {
    expect(needsReminder(row("2026-11-20"), TODAY)).toBe("30");
    expect(needsReminder(row("2026-11-20", "30", "2026-11-20"), TODAY)).toBeNull();
    expect(needsReminder(row("2026-11-10", "30", "2026-11-10"), TODAY)).toBe("14");
    expect(needsReminder(row("2026-11-10", "14", "2026-11-10"), TODAY)).toBeNull();
    expect(needsReminder(row("2026-11-01", "14", "2026-11-01"), TODAY)).toBe("0");
    expect(needsReminder(row("2026-11-01", "0", "2026-11-01"), TODAY)).toBeNull();
  });
  it("starts over when the certificate is renewed (new expiry)", () => {
    expect(needsReminder(row("2026-11-25", "0", "2025-11-25"), TODAY)).toBe("30");
  });
  it("doesn't email about certificates that lapsed over a month ago", () => {
    expect(needsReminder(row("2026-09-01"), TODAY)).toBeNull();
  });
  it("reminds the vendor at 14 and 0 days only when the PM switched it on", () => {
    const base = { expires_on: "2026-11-10", remind_vendor: true, contact_email: "a@b.ca", vendor_reminded_stage: null, reminder_for: null };
    expect(vendorReminderStage(base, TODAY)).toBe("14");
    expect(vendorReminderStage({ ...base, remind_vendor: false }, TODAY)).toBeNull();
    expect(vendorReminderStage({ ...base, contact_email: null }, TODAY)).toBeNull();
    expect(vendorReminderStage({ ...base, vendor_reminded_stage: "14", reminder_for: "2026-11-10" }, TODAY)).toBeNull();
    expect(vendorReminderStage({ ...base, expires_on: "2026-11-25" }, TODAY)).toBeNull();
    expect(vendorReminderStage({ ...base, expires_on: "2026-11-01", vendor_reminded_stage: "14", reminder_for: "2026-11-01" }, TODAY)).toBe("0");
  });
});

describe("field cleaning", () => {
  it("parses amounts", () => {
    expect(parseAmount("$2,000,000")).toBe(2_000_000);
    expect(parseAmount("2 000 000 $")).toBe(2_000_000);
    expect(parseAmount("5M")).toBe(5_000_000);
    expect(parseAmount("abc")).toBeNull();
  });
  it("parses unambiguous dates only", () => {
    expect(parseDate("2027-03-31")).toBe("2027-03-31");
    expect(parseDate("2027/3/1")).toBe("2027-03-01");
    expect(parseDate("Mar 31, 2027")).toBe("2027-03-31");
    expect(parseDate("31 March 2027")).toBe("2027-03-31");
    expect(parseDate("03/04/2027")).toBeNull();
    expect(parseDate("2027-02-30")).toBeNull();
  });
  it("validates a typed row", () => {
    expect(cleanVendorInput({ vendor_name: "  " }, "CA")).toEqual({ ok: false, field: "name" });
    expect(cleanVendorInput({ vendor_name: "Acme", contact_email: "nope" }, "CA")).toEqual({ ok: false, field: "email" });
    expect(cleanVendorInput({ vendor_name: "Acme", expires_on: "soon" }, "CA")).toEqual({ ok: false, field: "date" });
    const ok = cleanVendorInput({ vendor_name: "Acme HVAC", contact_email: "Office@AcmeHVAC.ca", cert_type: "workers_comp", coverage_amount: "2000000", expires_on: "2027-03-31", remind_vendor: "on" }, "CA");
    expect(ok).toMatchObject({ ok: true, value: { contact_email: "office@acmehvac.ca", cert_type: "wsib_clearance", coverage_amount: 2_000_000, remind_vendor: true } });
  });
});

describe("CSV import", () => {
  it("handles quotes, commas inside fields and CRLF", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });
  it("maps a header row and skips bad lines", () => {
    const csv = "Vendor,Email,Trade,Type,Insurer,Policy,Coverage,Expiry\nAcme HVAC,office@acme.ca,HVAC,CGL,Intact,P-1,2000000,2027-03-31\n,nobody@x.ca,,,,,,\nSnowCo,bad-email,,,,,,";
    const res = importVendors(csv, "CA");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ vendor_name: "Acme HVAC", contact_email: "office@acme.ca", trade: "HVAC", insurer: "Intact", expires_on: "2027-03-31" });
    expect(res.skipped).toEqual([3, 4]);
  });
  it("reads rows without a header in the default column order", () => {
    const res = importVendors("Acme;a@acme.com;Roofing;Workers comp", "US");
    expect(res.rows[0]).toMatchObject({ vendor_name: "Acme", contact_email: "a@acme.com", trade: "Roofing", cert_type: "workers_comp" });
  });
});

describe("file sniffing", () => {
  it("accepts PDF and images by content", () => {
    expect(sniffCertMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(sniffCertMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffCertMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffCertMime(new TextEncoder().encode("<html>"))).toBeNull();
  });
});

describe("emails keep the countries apart", () => {
  const bits = { base: "https://pmrfp.com", company: "Maple PM", vendor: "Acme", uploadUrl: "https://pmrfp.com/vendor-certificate/x", unsubscribeUrl: "https://pmrfp.com/u", onPmrfp: false, ttlDays: 30 };
  it("says WSIB to a Canadian vendor and workers' comp to a U.S. one", () => {
    const ca = certRequestEmail("en", { ...bits, type: "wsib_clearance", country: "CA", mailingAddress: null });
    expect(ca.subject).toContain("WSIB");
    const us = certRequestEmail("en", { ...bits, type: "workers_comp", country: "US", mailingAddress: null });
    expect(us.subject).toContain("Workers' comp");
    expect(us.subject).not.toContain("WSIB");
  });
  it("only adds the PMRFP sign-up prompt with a mailing address (CASL)", () => {
    expect(certRequestEmail("en", { ...bits, type: "general_liability", country: "CA", mailingAddress: null }).bodyHtml).not.toContain("sign-up");
    const withAddr = certRequestEmail("en", { ...bits, type: "general_liability", country: "CA", mailingAddress: "123 Example St, Toronto" });
    expect(withAddr.bodyHtml).toContain("/sign-up?role=trade");
    expect(withAddr.footnote).toContain("123 Example St");
  });
  it("lists the digest items, soonest first as given, and escapes names", () => {
    const e = certDigestEmail("en", {
      base: "https://pmrfp.com",
      company: "Maple PM",
      country: "US",
      unsubscribeUrl: null,
      items: [{ vendor: "<b>Acme</b>", type: "general_liability", expiresOn: "2026-10-30", status: "expired", days: -2 }],
    });
    expect(e.subject).toBe("1 vendor certificate needs attention");
    expect(e.bodyHtml).toContain("&lt;b&gt;Acme&lt;/b&gt;");
    expect(e.bodyHtml).toContain("COI");
  });
});
