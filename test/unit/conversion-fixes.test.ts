import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bidAlertPlace, decideSubscribe, parseDigestSignup, CONFIRM_RESEND_MS, MAX_STORED_TRADES } from "@/lib/digest/config";
import { areaOf, mostCommonArea, relatedOpenListings, type RelatedRow } from "@/lib/data/related-listings";
import { canOpenOfficialNotice, canSaveRfps, viewerOf } from "@/lib/access/free-actions";
import { callbackFailurePath, magicLinkRedirect, parseSignupMethod } from "@/lib/auth/magic-link";
import { signUpSchema } from "@/lib/validations";
import growth from "@/i18n/messages/growth";
import growthClient from "@/i18n/messages/growthClient";
import v3Pages from "@/i18n/messages/v3Pages";
import auth from "@/i18n/messages/auth";

const LANGS = ["en", "fr", "es"] as const;
const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/* ================================================================== 1. weekly email capture */

describe("weekly email: capture is decoupled from sending", () => {
  it("the sign-up block and the /weekly-email form no longer wait for WEEKLY_DIGEST_ENABLED", () => {
    expect(src("src/components/growth/digest-signup-block.tsx")).not.toMatch(/weeklyDigestEnabled/);
    expect(src("src/lib/digest/actions.ts")).not.toMatch(/weeklyDigestEnabled/);
    const page = src("src/app/[lang]/(v3)/weekly-email/page.tsx");
    expect(page).toMatch(/<DigestSignupBlock source="weekly-email" \/>/);
    expect(page).not.toMatch(/enabled \? <DigestSignupBlock/);
    // Sending itself stays behind the flag.
    expect(src("src/app/api/cron/weekly-digest/route.ts")).toMatch(/weeklyDigestEnabled\(\)/);
  });

  it("no language still says sign-ups open soon", () => {
    for (const l of LANGS) {
      expect(growth[l].digest.soon.toLowerCase()).not.toMatch(/sign-ups open soon|inscriptions ouvrent|suscripciones abren/);
      expect(growthClient[l].digest.heldBody).toContain("{email}");
    }
  });

  it("decideSubscribe: new address writes and sends the confirmation when email can send", () => {
    expect(decideSubscribe(null, false, ["roofing"], true)).toEqual({ kind: "write", trades: ["roofing"], sendConfirm: true });
  });

  it("decideSubscribe: email not configured → stored pending, no confirmation", () => {
    expect(decideSubscribe(null, false, ["roofing"], false)).toEqual({ kind: "write", trades: ["roofing"], sendConfirm: false });
  });

  it("decideSubscribe: never touches active, bounced or suppressed addresses", () => {
    expect(decideSubscribe({ status: "active", confirm_sent_at: null }, false, [], true)).toEqual({ kind: "skip" });
    expect(decideSubscribe({ status: "bounced", confirm_sent_at: null }, false, [], true)).toEqual({ kind: "skip" });
    expect(decideSubscribe(null, true, [], true)).toEqual({ kind: "skip" });
  });

  it("decideSubscribe: at most one confirmation per 10 minutes; a held one (never sent) can send", () => {
    const now = Date.parse("2026-10-18T12:00:00Z");
    const recent = new Date(now - CONFIRM_RESEND_MS + 1000).toISOString();
    expect(decideSubscribe({ status: "pending", confirm_sent_at: recent }, false, [], true, now)).toEqual({ kind: "skip" });
    expect(decideSubscribe({ status: "pending", confirm_sent_at: null, trades: ["hvac"] }, false, ["roofing"], true, now)).toEqual({
      kind: "write",
      trades: ["hvac", "roofing"],
      sendConfirm: true,
    });
  });

  it("decideSubscribe: a pending sign-up gains trades (capped), an unsubscribed one starts over", () => {
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`);
    const d = decideSubscribe({ status: "pending", confirm_sent_at: null, trades: many }, false, ["x"], true);
    expect(d.kind === "write" && d.trades.length).toBe(MAX_STORED_TRADES);
    expect(decideSubscribe({ status: "unsubscribed", confirm_sent_at: null, trades: ["hvac"] }, false, ["roofing"], true)).toEqual({
      kind: "write",
      trades: ["roofing"],
      sendConfirm: true,
    });
  });
});

describe('"Email me bids like this" box', () => {
  it("bidAlertPlace: province names, Canadian codes and accents → the stored name and country", () => {
    expect(bidAlertPlace("Ontario")).toEqual({ country: "CA", province: "Ontario" });
    expect(bidAlertPlace("Québec")).toEqual({ country: "CA", province: "Quebec" });
    expect(bidAlertPlace("QC")).toEqual({ country: "CA", province: "Quebec" });
    expect(bidAlertPlace("texas")).toEqual({ country: "US", province: "Texas" });
    expect(bidAlertPlace("Canada")).toBeNull();
    expect(bidAlertPlace(null)).toBeNull();
  });

  it("its sources are accepted by the sign-up parser (CASL source recorded)", () => {
    const trades = new Set(["snow-removal"]);
    for (const source of ["bid-alert-rfp", "bid-alert-winner", "bid-alert-insights", "bid-alert-benchmark"]) {
      const r = parseDigestSignup({ email: "a@b.ca", country: "CA", province: "Ontario", trades: ["snow-removal"], consent: "yes", source }, trades);
      expect(r.ok && r.value.source).toBe(source);
    }
    // The page's province must belong to the page's country: never mixed.
    expect(parseDigestSignup({ email: "a@b.ca", country: "US", province: "Ontario", consent: "yes", source: "bid-alert-rfp" }, trades)).toEqual({ ok: false, error: "province" });
  });

  it("is on RFP, contract-winner, insights and benchmark pages, and asks for consent", () => {
    expect(src("src/app/[lang]/(v3)/rfps/[slug]/page.tsx")).toMatch(/<BidAlertBox\s+source="rfp"/);
    expect(src("src/app/[lang]/(v3)/contract-winners/[slug]/page.tsx")).toMatch(/<BidAlertBox source="winner"/);
    expect(src("src/app/[lang]/(v3)/insights/[trade]/[province]/page.tsx")).toMatch(/<BidAlertBox source="insights"/);
    expect(src("src/app/[lang]/(v3)/benchmarks/[trade]/[province]/page.tsx")).toMatch(/<BidAlertBox source="benchmark"/);
    const form = src("src/components/growth/bid-alert-form.tsx");
    expect(form).toMatch(/name="consent"[^>]*required/);
    expect(form.match(/type="email"/g)?.length).toBe(1);
    for (const l of LANGS) {
      expect(growth[l].bidAlert.lead).toContain("{trade}");
      expect(growth[l].bidAlert.leadPlace).toContain("{place}");
    }
  });
});

/* ================================================================== 2. free actions on RFP pages */

describe("RFP pages: free actions with an account", () => {
  it("save: trade and supplier accounts, free; anyone with trade access; never signed out", () => {
    expect(canSaveRfps(viewerOf({ profile: { primary_role: "trade" }, hasTradeAccess: false }))).toBe(true);
    expect(canSaveRfps(viewerOf({ profile: { primary_role: "supplier" }, hasTradeAccess: false }))).toBe(true);
    expect(canSaveRfps(viewerOf({ profile: { primary_role: "property_manager" }, hasTradeAccess: false }))).toBe(false);
    expect(canSaveRfps(viewerOf({ profile: { primary_role: "admin" }, hasTradeAccess: true }))).toBe(true);
    expect(canSaveRfps(null)).toBe(false);
  });

  it("official notice: any signed-in account, public tenders only", () => {
    const v = viewerOf({ profile: { primary_role: "visitor" }, hasTradeAccess: false });
    expect(canOpenOfficialNotice(v, "public_source")).toBe(true);
    expect(canOpenOfficialNotice(v, "pm_posted")).toBe(false);
    expect(canOpenOfficialNotice(null, "public_source")).toBe(false);
  });

  it("the save API no longer requires Trade Pro, and the migration opens insert to own rows", () => {
    const api = src("src/app/api/save-rfp/route.ts");
    expect(api).not.toMatch(/Trade Pro membership required/);
    expect(api).toMatch(/canSaveRfps/);
    const sql = src("supabase/migrations/20261018000010_free_saved_rfps.sql");
    expect(sql).toMatch(/drop policy if exists "saved insert paid"/);
    expect(sql).toMatch(/with check \(user_id = auth\.uid\(\)\)/);
  });

  it("signed-out primary CTA is the free account, in every language", () => {
    expect(src("src/app/[lang]/(v3)/rfps/[slug]/page.tsx")).toMatch(/data-cta="free-account"/);
    expect(v3Pages.en.detail.freeCta).toBe("Create a free account to save this bid and get alerts");
    for (const l of LANGS) {
      expect(v3Pages[l].detail.freeCta.length).toBeGreaterThan(10);
      expect(v3Pages[l].detail.saveNote).not.toMatch(/Trade Pro/);
    }
  });
});

/* ================================================================== 4. sign-up */

describe("sign-up: email + trade + region, passwordless option", () => {
  it("parseSignupMethod: only 'link' is passwordless; older forms keep the password flow", () => {
    expect(parseSignupMethod("link")).toBe("link");
    expect(parseSignupMethod("password")).toBe("password");
    expect(parseSignupMethod(null)).toBe("password");
  });

  it("magicLinkRedirect: our callback, then onboarding (or next), marked as a link", () => {
    expect(magicLinkRedirect("https://pmrfp.com/", null)).toBe("https://pmrfp.com/auth/callback?next=%2Fonboarding&m=link");
    expect(magicLinkRedirect("https://pmrfp.com", "/rfps/x")).toBe("https://pmrfp.com/auth/callback?next=%2Frfps%2Fx&m=link");
    // Off-site next is dropped (open redirect guard).
    expect(magicLinkRedirect("https://pmrfp.com", "https://evil.example")).toBe("https://pmrfp.com/auth/callback?next=%2Fonboarding&m=link");
    expect(callbackFailurePath("link")).toBe("/sign-in?error=link");
    expect(callbackFailurePath(null)).toBe("/sign-in?error=google");
  });

  it("schema: name and password optional (password still 8+ when given)", () => {
    expect(signUpSchema.safeParse({ email: "a@b.com", role: "trade" }).success).toBe(true);
    expect(signUpSchema.safeParse({ email: "a@b.com", password: "short", role: "trade" }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "A", email: "a@b.com", password: "longenough", role: "trade" }).success).toBe(true);
  });

  it("the form: no name or company field, plain 'Email' label, method toggle, role picker kept", () => {
    const flow = src("src/components/home-v3/signup-flow.tsx");
    expect(flow).not.toMatch(/name="fullName"/);
    expect(flow).not.toMatch(/name="pref_company"/);
    expect(flow).toMatch(/name="method"/);
    expect(flow).toMatch(/<SignupRolePicker/);
    expect(flow.indexOf("<ContinueWithGoogle")).toBeLessThan(flow.indexOf('name="email"'));
    for (const l of LANGS) {
      expect(v3Pages[l].signup.workEmail).not.toMatch(/work|professionnel|trabajo/i);
      expect(auth[l].actions.linkSent.length).toBeGreaterThan(10);
      expect(auth[l].signIn.linkError.length).toBeGreaterThan(10);
    }
  });

  it("onboarding-rescue step names are unchanged", async () => {
    const { TRACKED_STEPS } = await import("@/lib/onboarding/steps");
    expect([...TRACKED_STEPS]).toEqual(["role_pick_viewed", "role_picked", "form_viewed", "form_error", "org_failed"]);
  });
});

/* ================================================================== 5a. related listings scoped by province */

describe("related listings: same province first, labelled honestly", () => {
  const regions = new Map<string, string | null>([
    ["Ontario", "Ontario"],
    ["Toronto", "Ontario"],
    ["Quebec", "Quebec"],
    ["Laval", "Quebec"],
    ["Canada", null],
    ["Texas", "Texas"],
  ]);
  const row = (slug: string, o: Partial<RelatedRow> = {}): RelatedRow => ({
    slug,
    status: "open",
    categories: ["Snow Removal"],
    regionName: "Ontario",
    province: null,
    deadline: "2026-10-30",
    ...o,
  });

  it("an Ontario listing never lists Québec tenders under an Ontario count", () => {
    const listing = row("on-1", { province: "Ontario" });
    const board = [
      listing,
      row("qc-1", { regionName: "Laval", province: "Québec" }),
      row("qc-2", { regionName: "Quebec", province: "QC" }),
      row("on-2", { regionName: "Toronto", categories: ["Paving"], deadline: "2026-11-02" }),
      row("on-3", { regionName: "Toronto" }),
    ];
    const r = relatedOpenListings(board, listing, regions);
    expect(r.scope).toBe("area");
    expect(r.area).toBe("Ontario");
    expect(r.items.map((x) => x.slug)).toEqual(["on-3", "on-2"]); // same trade first
    expect(r.areaCount).toBe(3); // on-1 (this one) + on-2 + on-3
  });

  it("no other open listing in the province: same trade, same country, labelled by trade", () => {
    const listing = row("on-1", { province: "Ontario" });
    const board = [listing, row("qc-1", { regionName: "Laval" }), row("tx-1", { regionName: "Texas", province: "Texas" })];
    const r = relatedOpenListings(board, listing, regions);
    expect(r.scope).toBe("country");
    expect(r.items.map((x) => x.slug)).toEqual(["qc-1"]); // never the U.S. one
    expect(r.tradeCount).toBe(2);
  });

  it("closed listings and other countries are never counted", () => {
    const listing = row("tx-1", { regionName: "Texas", province: "Texas" });
    const board = [listing, row("on-1"), row("tx-2", { regionName: "Texas", province: "TX", status: "closed" })];
    const r = relatedOpenListings(board, listing, regions);
    expect(r.scope).toBe("none");
    expect(r.items).toEqual([]);
  });

  it("areaOf: national regions have no province; mostCommonArea picks the main one", () => {
    expect(areaOf({ province: null, regionName: "Canada" }, regions)).toBeNull();
    expect(areaOf({ province: null, regionName: "Toronto" }, regions)).toBe("Ontario");
    expect(mostCommonArea([{ regionName: "Laval" }, { regionName: "Toronto" }, { regionName: "Quebec" }], regions)).toBe("Quebec");
  });
});
