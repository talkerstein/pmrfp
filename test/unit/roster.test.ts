import { describe, expect, it } from "vitest";
import {
  INVITE_DAILY_LIMIT,
  MAX_ACTIVE_LINKS,
  STANDARD_CATEGORIES,
  buildVcards,
  buildingGaps,
  canAddLink,
  cleanEntryInput,
  cleanPhone,
  cleanRosterInput,
  defaultNotNeeded,
  entryGaps,
  insuranceFor,
  inviteRefusal,
  isShareToken,
  lastUpdated,
  linkIsLive,
  onCallRfpDraft,
  rankMatches,
  rosterContacts,
  rosterRows,
  rosterSummary,
  sameCompanyName,
  sharePath,
  telHref,
  vcardEscape,
  vcardFileName,
  type CertLite,
  type DirectoryCandidate,
  type EntryRow,
  type VendorSlot,
} from "@/lib/roster/rules";
import { rosterInviteEmail } from "@/lib/roster/email-copy";
import { generateReviewToken } from "@/lib/projects/tokens";
import roster from "@/i18n/messages/roster";

const vendor = (name: string | null, phone: string | null = null, email: string | null = null, orgId: string | null = null): VendorSlot => ({ name, phone, email, orgId });

function entry(over: Partial<EntryRow>): EntryRow {
  return {
    id: "e1",
    roster_id: "r1",
    category: "plumbing",
    custom_label: null,
    trade_slug: null,
    not_needed: false,
    primary_name: null,
    primary_phone: null,
    primary_email: null,
    primary_org_id: null,
    backup_name: null,
    backup_phone: null,
    backup_email: null,
    backup_org_id: null,
    available_24_7: false,
    notes: null,
    sort_order: 0,
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

describe("gap chips", () => {
  it("a row with nobody on it is one chip: no vendor", () => {
    expect(entryGaps({ notNeeded: false, primary: null, backup: null, available247: false })).toEqual(["no_vendor"]);
    // A backup alone doesn't count as the primary.
    expect(entryGaps({ notNeeded: false, primary: null, backup: vendor("B", "555-0101"), available247: true })).toEqual(["no_vendor"]);
    // An email alone is not someone you can call.
    expect(entryGaps({ notNeeded: false, primary: vendor(null, null, "a@b.ca"), backup: null, available247: true })).toEqual(["no_vendor"]);
  });

  it("flags no phone, no backup and not 24/7 once a primary is on file", () => {
    expect(entryGaps({ notNeeded: false, primary: vendor("Acme Plumbing"), backup: null, available247: false })).toEqual(["no_phone", "no_backup", "not_24_7"]);
    expect(entryGaps({ notNeeded: false, primary: vendor("Acme", "416-555-0100"), backup: vendor("Beta"), available247: false })).toEqual(["not_24_7"]);
  });

  it("a fully covered row has no chips", () => {
    expect(entryGaps({ notNeeded: false, primary: vendor("Acme", "416-555-0100"), backup: vendor("Beta", "905-555-0100"), available247: true })).toEqual([]);
  });

  it("a row the building doesn't need never shows a gap", () => {
    expect(entryGaps({ notNeeded: true, primary: null, backup: null, available247: false })).toEqual([]);
  });

  it("building gaps: no on-call phone, no water shut-off", () => {
    expect(buildingGaps({ on_call_name: "Sam", on_call_phone: null, shutoff_water: null })).toEqual(["no_on_call", "no_water_shutoff"]);
    expect(buildingGaps({ on_call_name: null, on_call_phone: "416-555-0199", shutoff_water: "Basement, north wall" })).toEqual([]);
  });
});

describe("rows and readiness", () => {
  it("lists every standard trade in order, then custom rows by sort order", () => {
    const rows = rosterRows(
      [
        entry({ id: "c2", category: "custom", custom_label: "Sewer backup", sort_order: 2 }),
        entry({ id: "c1", category: "custom", custom_label: "Generator", trade_slug: "electrical", sort_order: 1 }),
        entry({ id: "p", category: "plumbing", primary_name: "Acme", primary_phone: "416-555-0100" }),
      ],
      { country: "CA", province: "Ontario" },
    );
    expect(rows.slice(0, STANDARD_CATEGORIES.length).map((r) => r.category)).toEqual([...STANDARD_CATEGORIES]);
    expect(rows.slice(STANDARD_CATEGORIES.length).map((r) => r.customLabel)).toEqual(["Generator", "Sewer backup"]);
    const plumbing = rows[0];
    expect(plumbing.entryId).toBe("p");
    expect(plumbing.tradeSlug).toBe("plumbing");
    expect(plumbing.gaps).toEqual(["no_backup", "not_24_7"]);
    // Virtual standard rows have no entry yet.
    expect(rows[1]).toMatchObject({ entryId: null, category: "electrical", gaps: ["no_vendor"] });
    // Towing has no directory trade; a custom row keeps its own.
    expect(rows.find((r) => r.category === "towing")?.tradeSlug).toBeNull();
    expect(rows.find((r) => r.key === "c1")?.tradeSlug).toBe("electrical");
  });

  it("counts needed and ready rows, skipping what the building doesn't need", () => {
    const rows = rosterRows(
      [
        entry({ id: "p", category: "plumbing", primary_name: "Acme", primary_phone: "416-555-0100", backup_name: "B", available_24_7: true }),
        entry({ id: "el", category: "elevator", not_needed: true }),
      ],
      { country: "CA", province: "Ontario" },
    );
    const s = rosterSummary(rows);
    expect(s.needed).toBe(STANDARD_CATEGORIES.length - 1);
    expect(s.ready).toBe(1);
    expect(s.gaps.no_vendor).toBe(STANDARD_CATEGORIES.length - 2);
    expect(s.gaps.no_backup).toBe(0);
  });

  it("snow and ice: always needed in Canada, off by default in warm U.S. states", () => {
    expect(defaultNotNeeded("snow", "CA", "British Columbia")).toBe(false);
    expect(defaultNotNeeded("snow", "US", "Florida")).toBe(true);
    expect(defaultNotNeeded("snow", "US", "TX")).toBe(true);
    expect(defaultNotNeeded("snow", "US", "Minnesota")).toBe(false);
    expect(defaultNotNeeded("snow", "US", "NY")).toBe(false);
    expect(defaultNotNeeded("snow", "US", null)).toBe(false);
    expect(defaultNotNeeded("plumbing", "US", "Florida")).toBe(false);
    const rows = rosterRows([], { country: "US", province: "Arizona" });
    expect(rows.find((r) => r.category === "snow")).toMatchObject({ notNeeded: true, gaps: [] });
  });

  it("last updated is the newest of the building and its rows", () => {
    expect(lastUpdated({ updated_at: "2026-10-01T00:00:00Z" }, [{ created_at: "2026-09-01T00:00:00Z", updated_at: "2026-10-05T00:00:00Z" }])).toBe("2026-10-05T00:00:00Z");
    expect(lastUpdated({ updated_at: "2026-10-09T00:00:00Z" }, [{ created_at: "2026-09-01T00:00:00Z" }])).toBe("2026-10-09T00:00:00Z");
  });
});

describe("phone numbers", () => {
  it("accepts what PMs type, refuses what can't be dialled", () => {
    expect(cleanPhone("  416-555-0100 ext. 22 ")).toBe("416-555-0100 ext. 22");
    expect(cleanPhone("911")).toBe("911");
    expect(cleanPhone("1-800-FLOWERS")).toBe("1-800-FLOWERS");
    expect(cleanPhone("")).toBeNull();
    expect(cleanPhone(null)).toBeNull();
    expect(cleanPhone("call Bob")).toBe(false);
    expect(cleanPhone("<script>")).toBe(false);
    expect(cleanPhone("1".repeat(41))).toBe(false);
  });

  it("builds tap-to-call links with extensions and vanity letters", () => {
    expect(telHref("(416) 555-0100")).toBe("tel:4165550100");
    expect(telHref("+1 416 555 0100 ext. 22")).toBe("tel:+14165550100,22");
    expect(telHref("514-555-0100 poste 7")).toBe("tel:5145550100,7");
    expect(telHref("1-800-FLOWERS")).toBe("tel:18003569377");
    expect(telHref("911")).toBe("tel:911");
    expect(telHref("12")).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});

describe("forms", () => {
  it("keeps the province to the PM company's own country", () => {
    expect(cleanRosterInput({ building_name: "Maple Court", province: "ontario" }, "CA")).toMatchObject({ ok: true, value: { province: "Ontario", emergency_line: "911" } });
    expect(cleanRosterInput({ building_name: "Maple Court", province: "Texas" }, "CA")).toEqual({ ok: false, field: "province" });
    expect(cleanRosterInput({ building_name: "Oak Tower", province: "Ontario" }, "US")).toEqual({ ok: false, field: "province" });
    expect(cleanRosterInput({ building_name: "  " }, "CA")).toEqual({ ok: false, field: "building" });
    expect(cleanRosterInput({ building_name: "A", on_call_phone: "nope" }, "CA")).toEqual({ ok: false, field: "phone" });
  });

  it("cleans a row and never takes a PMRFP company link from the form", () => {
    const res = cleanEntryInput({ primary_name: " Acme ", primary_phone: "416-555-0100", primary_email: "OPS@ACME.CA", primary_org_id: "x", available_24_7: "on" }, { custom: false });
    expect(res).toMatchObject({ ok: true, value: { primary_name: "Acme", primary_email: "ops@acme.ca", available_24_7: true, custom_label: null } });
    expect(res.ok && "primary_org_id" in res.value).toBe(false);
    expect(cleanEntryInput({ primary_email: "not-an-email" }, { custom: false })).toEqual({ ok: false, field: "email" });
    expect(cleanEntryInput({}, { custom: true })).toEqual({ ok: false, field: "label" });
    expect(cleanEntryInput({ custom_label: "Generator", trade_slug: "Bad Slug!" }, { custom: true })).toEqual({ ok: false, field: "trade" });
  });

  it("matches company names loosely", () => {
    expect(sameCompanyName("Acme Plumbing Inc.", "acme plumbing")).toBe(true);
    expect(sameCompanyName("Électricité Côté Ltée", "Electricite Cote")).toBe(true);
    expect(sameCompanyName("Acme", "Beta")).toBe(false);
    expect(sameCompanyName(null, "Acme")).toBe(false);
  });
});

describe("share links", () => {
  it("takes only server-made 32-character tokens", () => {
    const token = generateReviewToken();
    expect(isShareToken(token)).toBe(true);
    expect(isShareToken("short")).toBe(false);
    expect(isShareToken(`${token}x`)).toBe(false);
    expect(isShareToken("a".repeat(31) + "/")).toBe(false);
    expect(isShareToken(null)).toBe(false);
    expect(sharePath(token)).toBe(`/on-call/${token}`);
  });

  it("a turned-off link is dead; a building has at most 10 live links", () => {
    expect(linkIsLive({ revoked_at: null })).toBe(true);
    expect(linkIsLive({ revoked_at: "2026-11-01T00:00:00Z" })).toBe(false);
    expect(linkIsLive(null)).toBe(false);
    expect(MAX_ACTIVE_LINKS).toBe(10);
    expect(canAddLink(9)).toBe(true);
    expect(canAddLink(10)).toBe(false);
  });
});

describe("contacts download", () => {
  it("escapes vCard text and writes one card per contact", () => {
    expect(vcardEscape("A, B; C\\D\nE")).toBe("A\\, B\\; C\\\\D\\nE");
    const vcf = buildVcards([
      { fn: "Maple Court · Plumbing · Acme", org: "Acme", tel: "416-555-0100" },
      { fn: "Nobody" },
    ]);
    expect(vcf.match(/BEGIN:VCARD/g)).toHaveLength(1);
    expect(vcf).toContain("TEL;TYPE=WORK,VOICE:416-555-0100\r\n");
    expect(vcf.endsWith("END:VCARD\r\n")).toBe(true);
  });

  it("collects the on-call person and each needed row's vendors", () => {
    const rows = rosterRows([entry({ category: "plumbing", primary_name: "Acme", primary_phone: "416-555-0100", available_24_7: true }), entry({ id: "x", category: "elevator", not_needed: true, primary_name: "Lift Co", primary_phone: "1-800-555-0100" })], {
      country: "CA",
      province: "Ontario",
    });
    const contacts = rosterContacts({ building_name: "Maple Court", on_call_name: "Sam", on_call_phone: "416-555-0199" }, rows, {
      category: (r) => r.category,
      primary: "Primary",
      backup: "Backup",
      onCall: "On call",
      available247: "24/7",
    });
    expect(contacts.map((c) => c.fn)).toEqual(["Maple Court · On call", "Maple Court · plumbing · Acme"]);
    expect(contacts[1].note).toBe("Primary · 24/7");
    expect(vcardFileName("Maple Court — Tower B")).toBe("maple-court-tower-b-emergency-contacts.vcf");
    expect(vcardFileName("***")).toBe("building-emergency-contacts.vcf");
  });
});

describe("on-call contract RFP draft", () => {
  it("fills the trade, building and place in the PM's country copy", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const ca = onCallRfpDraft(
      { ...roster.en.rfp.CA },
      { trade: roster.en.rfpTrade.plumbing, tradeSlug: "plumbing", building: "Maple Court", city: "Hamilton", province: "Ontario", now },
    );
    expect(ca.rfp.title).toBe("24/7 on-call plumbing service: Maple Court");
    expect(ca.rfp.requirements).toContain("WSIB");
    expect(ca.rfp.requirements).toContain("Hamilton, Ontario");
    expect(ca.rfp.submissionInstructions.length).toBeGreaterThan(0);
    expect(ca).toMatchObject({ tradeSlug: "plumbing", city: "Hamilton", province: "Ontario", deadline: "2026-11-22" });
    const us = onCallRfpDraft({ ...roster.en.rfp.US }, { trade: "electrical", tradeSlug: "electrical", building: "Oak Tower", city: null, province: "Texas", now });
    expect(us.rfp.requirements).not.toContain("WSIB");
    expect(us.rfp.requirements).toContain("Texas");
    expect(us.city).toBeUndefined();
  });
});

describe("insurance chip from the PM's own tracker", () => {
  const certs: CertLite[] = [
    { vendor_name: "Acme Plumbing Inc.", contact_email: null, vendor_organization_id: null, status: "valid" },
    { vendor_name: "Something else", contact_email: "ops@acme.ca", vendor_organization_id: null, status: "expiring" },
    { vendor_name: "Linked Co", contact_email: null, vendor_organization_id: "org-1", status: "expired" },
  ];
  it("matches by company, then email, then name; the worst status wins", () => {
    expect(insuranceFor(vendor("Linked", null, null, "org-1"), certs)).toBe("expired");
    expect(insuranceFor(vendor("Acme Plumbing", null, "OPS@acme.ca"), certs)).toBe("expiring");
    expect(insuranceFor(vendor("acme plumbing"), certs)).toBe("valid");
    expect(insuranceFor(vendor("Unknown"), certs)).toBeNull();
    expect(insuranceFor(null, certs)).toBeNull();
    expect(insuranceFor(vendor("Acme Plumbing"), [])).toBeNull();
  });
});

describe("invite rules (CASL referral: one email)", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const base = { email: "ops@acme.ca", onPmrfp: false, suppressed: false, alreadyByOrg: false, lastInvitedAt: null, sentToday: 0, now };
  it("sends when nothing stands in the way", () => {
    expect(inviteRefusal(base)).toBeNull();
  });
  it("refuses in order: no email, on PMRFP, unsubscribed, already, recent, limit", () => {
    expect(inviteRefusal({ ...base, email: "nope" })).toBe("no_email");
    expect(inviteRefusal({ ...base, onPmrfp: true, suppressed: true })).toBe("on_pmrfp");
    expect(inviteRefusal({ ...base, suppressed: true })).toBe("unsubscribed");
    expect(inviteRefusal({ ...base, alreadyByOrg: true })).toBe("already");
    expect(inviteRefusal({ ...base, lastInvitedAt: "2026-10-20T00:00:00Z" })).toBe("recent");
    expect(inviteRefusal({ ...base, lastInvitedAt: "2026-09-01T00:00:00Z" })).toBeNull();
    expect(inviteRefusal({ ...base, sentToday: INVITE_DAILY_LIMIT })).toBe("limit");
  });

  it("the email names the referrer, carries the address and the opt-out", () => {
    const e = rosterInviteEmail("en", { base: "https://pmrfp.com", inviter: "Dana <Lee>", company: "Maple PM", vendor: "Acme", unsubscribeUrl: "https://pmrfp.com/u", mailingAddress: "1 Main St, Toronto ON" });
    expect(e.subject).toBe("Dana <Lee> at Maple PM added you to their after-hours vendor list");
    expect(e.bodyHtml).toContain("Dana &lt;Lee&gt;");
    expect(e.bodyHtml).toContain("/sign-up?role=trade");
    expect(e.footnote).toContain("referred you to PMRFP");
    expect(e.footnote).toContain("https://pmrfp.com/u");
    expect(e.footnote).toContain("1 Main St, Toronto ON");
    expect(rosterInviteEmail("fr", { base: "https://pmrfp.com", inviter: "Dana", company: "Maple", vendor: null, unsubscribeUrl: "u", mailingAddress: "a" }).bodyHtml).toContain("/fr/sign-up?role=trade");
  });
});

describe("directory matches", () => {
  const c = (over: Partial<DirectoryCandidate>): DirectoryCandidate => ({ orgId: "o", slug: "s", name: "N", city: null, province: null, regions: [], emergency: false, verified: false, ...over });
  it("keeps the building's province, puts emergency service and the same city first", () => {
    const list = [
      c({ orgId: "far", province: "Quebec" }),
      c({ orgId: "plain", province: "Ontario", city: "Toronto" }),
      c({ orgId: "city", province: "Ontario", city: "Hamilton" }),
      c({ orgId: "sos", province: "Ontario", city: "Ottawa", emergency: true }),
      c({ orgId: "region", province: "Manitoba", regions: ["Ontario"] }),
    ];
    expect(rankMatches(list, { province: "Ontario", city: "Hamilton" }).map((x) => x.orgId)).toEqual(["sos", "city", "plain", "region"]);
    expect(rankMatches(list, { province: "Ontario", city: null }, 2).map((x) => x.orgId)).toEqual(["sos", "plain"]);
    expect(rankMatches(list, { province: null, city: null })).toHaveLength(5);
  });
});

describe("copy", () => {
  it("every language has every category for both countries, spelled for the country", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      for (const country of ["CA", "US"] as const) {
        for (const cat of STANDARD_CATEGORIES) expect(roster[lang].categories[country][cat]).toBeTruthy();
      }
    }
    expect(roster.en.categories.CA.restoration).toContain("mould");
    expect(roster.en.categories.US.restoration).toContain("mold");
  });
});
