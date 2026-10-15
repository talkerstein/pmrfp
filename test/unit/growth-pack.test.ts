import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RfpListItem } from "@/lib/data/types";
import type { MajorProject } from "@/lib/major-projects/data";
import { badgeHtml, badgeImageUrl, badgeMarkdown, badgeTextLink, type BadgeSnippetInput } from "@/lib/badge/snippet";
import { renderKarmaBadge, renderListedBadge, renderWinnerBadge, winnerFactsLine } from "@/lib/badge/svg";
import { referrerDomain } from "@/lib/badge/referrer";
import { factsOf } from "@/lib/badge/winner-facts";
import { canClaim, claimMethod, domainMatchesName, emailMatchesWebsite, registrableDomain } from "@/lib/claims/domain";
import {
  bucketForMinute,
  confirmTokenValid,
  hashToken,
  isSendable,
  newConfirmToken,
  parseDigestSignup,
  weeklyDigestEnabled,
  DIGEST_ADDRESS,
  DIGEST_SENDER,
} from "@/lib/digest/config";
import { buildWeeklyDigest, renderConfirmEmail, renderWeeklyDigest, type DigestData, type DigestSubscriber } from "@/lib/digest/build";
import { suppressionFromEvent, verifySvixSignature } from "@/lib/digest/webhook";
import { digestUnsubscribeUrl, unsubscribeUrl, verifyDigestUnsubscribe, verifyUnsubscribe } from "@/lib/email/unsubscribe";
import { gateBenchmarkView, majorProjectView } from "@/lib/growth/gate";
import type { BenchmarkView } from "@/lib/data/price-benchmarks";

/* ================================================================== badges */

describe("badge snippets: honest links only", () => {
  const base: BadgeSnippetInput = {
    kind: "winner",
    base: "https://pmrfp.com",
    slug: "acme-paving-ltd",
    pageUrl: "https://pmrfp.com/contract-winners/acme-paving-ltd",
    name: "Acme Paving Ltd.",
  };

  for (const kind of ["listed", "winner", "karma"] as const) {
    it(`${kind}: one visible link to the company's own PMRFP page, branded anchor, nothing hidden`, () => {
      const pageUrl = kind === "winner" ? base.pageUrl : "https://pmrfp.com/directory/acme-paving";
      const html = badgeHtml({ ...base, kind, slug: kind === "winner" ? base.slug : "acme-paving", pageUrl });
      const links = html.match(/<a\s[^>]*>/g) ?? [];
      expect(links).toHaveLength(1);
      expect(links[0]).toContain(`href="${pageUrl}"`);
      // Followable: no nofollow/sponsored/ugc, and no extra rel requirement.
      expect(links[0]).toContain('rel="noopener"');
      expect(links[0]).not.toMatch(/nofollow|sponsored|ugc/);
      // Branded anchor: the image alt is the company name, nothing else.
      expect(html).toContain('alt="Acme Paving Ltd."');
      // No hidden text, no tracking pixels, no scripts.
      expect(html).not.toMatch(/display:\s*none|visibility:\s*hidden|font-size:\s*0|width="1"|height="1"|<script|<iframe/i);
      expect((html.match(/<img\s/g) ?? []).length).toBe(1);
    });
  }

  it("image URLs per kind (theme and language only as query params)", () => {
    expect(badgeImageUrl({ ...base, kind: "listed", slug: "acme" })).toBe("https://pmrfp.com/api/badge/acme");
    expect(badgeImageUrl({ ...base, kind: "winner" })).toBe("https://pmrfp.com/api/badge/winner/acme-paving-ltd");
    expect(badgeImageUrl({ ...base, kind: "karma", slug: "acme", theme: "dark", lang: "fr" })).toBe("https://pmrfp.com/api/badge/karma/acme?theme=dark&lang=fr");
  });

  it("text link and markdown use the company name as the anchor", () => {
    expect(badgeTextLink(base)).toBe('<a href="https://pmrfp.com/contract-winners/acme-paving-ltd" target="_blank" rel="noopener">Acme Paving Ltd.</a>');
    expect(badgeMarkdown(base)).toBe("[![Acme Paving Ltd.](https://pmrfp.com/api/badge/winner/acme-paving-ltd)](https://pmrfp.com/contract-winners/acme-paving-ltd)");
  });

  it("escapes names so a snippet can't break out of its attribute", () => {
    const html = badgeHtml({ ...base, name: 'Bad "Co" <b>' });
    expect(html).toContain('alt="Bad &quot;Co&quot; &lt;b&gt;"');
    expect(badgeTextLink({ ...base, name: "A & B <i>" })).toContain(">A &amp; B &lt;i&gt;</a>");
  });
});

describe("badge images", () => {
  it("winner badge shows the real award count and years, nothing else", () => {
    const svg = renderWinnerBadge({ found: true, awards: 12, from: 2021, to: 2026 }, "light");
    expect(svg).toContain("12 public awards · 2021–2026");
    expect(svg).toContain("PUBLIC CONTRACT WINNER");
    expect(winnerFactsLine(1, { from: 2025, to: 2025 })).toBe("1 public award · 2025");
    expect(winnerFactsLine(3, { from: 2024, to: 2026 }, "fr")).toBe("3 contrats publics · 2024–2026");
  });

  it("an unknown winner gets the plain seal, never a made-up count", () => {
    const svg = renderWinnerBadge({ found: false, awards: 0, from: null, to: null }, "light");
    expect(svg).not.toMatch(/award|winner/i);
    expect(svg).toContain("FIND US ON");
  });

  it("reputation badge only from level 2", () => {
    expect(renderKarmaBadge({ found: true, level: 1, levelName: "Member" }, "light")).not.toMatch(/level/i);
    const svg = renderKarmaBadge({ found: true, level: 3, levelName: "Established" }, "dark", "en");
    expect(svg).toContain("REPUTATION · LEVEL 3");
    expect(svg).toContain("Established");
  });

  it("listed badge keeps its sizes", () => {
    expect(renderListedBadge({ label: "Verified Vendor", verified: true, insured: false }, true, "light", "standard")).toContain('width="214" height="54"');
    expect(renderListedBadge({ label: "Listed Vendor", verified: false, insured: false }, true, "light", "compact")).toContain('width="188" height="32"');
  });

  it("winner facts come from the award notices' dates", () => {
    const f = factsOf({ slug: "x", name: "X Paving", awards: [{ date: "2023-05-01" }, { date: "2026-01-02" }, { date: null }] as never });
    expect(f).toEqual({ slug: "x", name: "X Paving", awards: 3, from: 2023, to: 2026 });
  });
});

describe("badge install tracking: domain only", () => {
  it("keeps the embedding site's bare domain", () => {
    expect(referrerDomain("https://www.AcmePaving.ca/about-us?ref=1")).toBe("acmepaving.ca");
    expect(referrerDomain("http://shop.acme.com/")).toBe("shop.acme.com");
  });
  it("no referrer = empty; our own pages and previews are not installs", () => {
    expect(referrerDomain(null)).toBe("");
    expect(referrerDomain("not a url")).toBe("");
    expect(referrerDomain("https://pmrfp.com/badges/winner/x")).toBeNull();
    expect(referrerDomain("https://www.pmrfp.com/")).toBeNull();
    expect(referrerDomain("https://pmrfp-git-x.vercel.app/")).toBeNull();
    expect(referrerDomain("http://localhost:3000/")).toBeNull();
  });
});

/* ================================================================== claims */

describe("claim verification by email domain", () => {
  it("email domain must equal the website's registrable domain", () => {
    expect(emailMatchesWebsite("bob@acmepaving.ca", "https://www.acmepaving.ca/")).toBe(true);
    expect(emailMatchesWebsite("bob@mail.acmepaving.ca", "acmepaving.ca")).toBe(true);
    expect(emailMatchesWebsite("bob@acme.on.ca", "www.acme.on.ca")).toBe(true);
    expect(emailMatchesWebsite("bob@other.ca", "acmepaving.ca")).toBe(false);
    expect(registrableDomain("shop.acme.on.ca")).toBe("acme.on.ca");
  });

  it("free mailboxes never prove anything", () => {
    expect(emailMatchesWebsite("acme@gmail.com", "gmail.com")).toBe(false);
    expect(emailMatchesWebsite("acme@hotmail.ca", "https://hotmail.ca")).toBe(false);
  });

  it("the website must look like the winner's name", () => {
    expect(domainMatchesName("acmepaving.ca", "Acme Paving Ltd.")).toBe(true);
    expect(domainMatchesName("dexter.ca", "DEXTER CONSTRUCTION CO. LTD.")).toBe(true);
    expect(domainMatchesName("rjsmithpaving.com", "R J Smith Paving Inc")).toBe(true);
    // A trade word alone isn't the company.
    expect(domainMatchesName("bestroofing.ca", "Metro Roofing Ltd.")).toBe(false);
    expect(domainMatchesName("othercompany.ca", "Acme Paving Ltd.")).toBe(false);
  });

  it("auto-approves only when both checks pass; everything else goes to admins", () => {
    expect(claimMethod({ email: "ops@acmepaving.ca", website: "acmepaving.ca", winnerName: "Acme Paving Ltd." })).toBe("email_domain");
    // Own domain, someone else's page.
    expect(claimMethod({ email: "ops@otherco.ca", website: "otherco.ca", winnerName: "Acme Paving Ltd." })).toBe("admin_review");
    // Right website, wrong mailbox.
    expect(claimMethod({ email: "acmepaving@gmail.com", website: "acmepaving.ca", winnerName: "Acme Paving Ltd." })).toBe("admin_review");
    expect(claimMethod({ email: "ops@acmepaving.ca", website: null, winnerName: "Acme Paving Ltd." })).toBe("admin_review");
  });

  it("only contractor, supplier and builder companies can claim", () => {
    expect(canClaim("trade_company")).toBe(true);
    expect(canClaim("builder")).toBe(true);
    expect(canClaim("property_manager")).toBe(false);
    expect(canClaim(null)).toBe(false);
  });
});

/* ================================================================== weekly digest */

const TRADES = new Set(["electrical", "roofing", "hvac", "paving", "general-contracting", "snow-removal"]);

describe("weekly email sign-up (double opt-in)", () => {
  it("is off unless WEEKLY_DIGEST_ENABLED is set", () => {
    expect(weeklyDigestEnabled(undefined)).toBe(false);
    expect(weeklyDigestEnabled("")).toBe(false);
    expect(weeklyDigestEnabled("0")).toBe(false);
    expect(weeklyDigestEnabled("1")).toBe(true);
    expect(weeklyDigestEnabled("true")).toBe(true);
  });

  it("needs a valid email, explicit consent, and a province/state in the chosen country", () => {
    const ok = parseDigestSignup({ email: "a@b.ca", country: "CA", province: "Ontario", trades: ["roofing", "nope"], consent: "yes", lang: "fr", source: "home" }, TRADES);
    expect(ok).toEqual({ ok: true, value: { email: "a@b.ca", country: "CA", province: "Ontario", trades: ["roofing"], lang: "fr", consent: true, source: "home" } });
    expect(parseDigestSignup({ email: "nope", country: "CA", province: "Ontario", consent: "yes" }, TRADES)).toEqual({ ok: false, error: "email" });
    // Country-first: a U.S. sign-up can't pick a Canadian province, and vice versa.
    expect(parseDigestSignup({ email: "a@b.com", country: "US", province: "Ontario", consent: "yes" }, TRADES)).toEqual({ ok: false, error: "province" });
    expect(parseDigestSignup({ email: "a@b.ca", country: "CA", province: "Texas", consent: "yes" }, TRADES)).toEqual({ ok: false, error: "province" });
    expect(parseDigestSignup({ email: "a@b.ca", country: "CA", province: "Ontario" }, TRADES)).toEqual({ ok: false, error: "consent" });
    expect(
      parseDigestSignup({ email: "a@b.ca", country: "CA", province: "Ontario", consent: "yes", trades: ["electrical", "roofing", "hvac", "paving", "general-contracting", "snow-removal"] }, TRADES),
    ).toEqual({ ok: false, error: "trades" });
  });

  it("the confirmation token works once it matches, and only for 7 days", () => {
    const { token, hash } = newConfirmToken();
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(hash).toBe(hashToken(token));
    expect(confirmTokenValid(token, hash, "2026-10-12T12:00:00Z", now)).toBe(true);
    expect(confirmTokenValid("forged", hash, "2026-10-12T12:00:00Z", now)).toBe(false);
    expect(confirmTokenValid(token, hash, "2026-10-01T12:00:00Z", now)).toBe(false);
    expect(confirmTokenValid(token, null, "2026-10-12T12:00:00Z", now)).toBe(false);
  });

  it("only confirmed, unsuppressed subscribers get the weekly email, never twice in 6 days", () => {
    const now = Date.parse("2026-10-13T14:05:00Z");
    const sup = new Set(["bounced@x.ca"]);
    expect(isSendable({ status: "pending", emailKey: "a@x.ca", lastSentAt: null }, sup, now)).toBe(false);
    expect(isSendable({ status: "unsubscribed", emailKey: "a@x.ca", lastSentAt: null }, sup, now)).toBe(false);
    expect(isSendable({ status: "active", emailKey: "bounced@x.ca", lastSentAt: null }, sup, now)).toBe(false);
    expect(isSendable({ status: "active", emailKey: "a@x.ca", lastSentAt: "2026-10-10T14:05:00Z" }, sup, now)).toBe(false);
    expect(isSendable({ status: "active", emailKey: "a@x.ca", lastSentAt: "2026-10-06T14:05:00Z" }, sup, now)).toBe(true);
    expect(isSendable({ status: "active", emailKey: "a@x.ca", lastSentAt: null }, sup, now)).toBe(true);
  });

  it("staggers the weekly send over four quarter-hour runs", () => {
    expect([5, 20, 35, 50].map(bucketForMinute)).toEqual([0, 1, 2, 3]);
  });

  it("the confirmation email names the sender and its mailing address", () => {
    const e = renderConfirmEmail("en", { confirmUrl: "https://pmrfp.com/api/digest/confirm?s=1&t=2", placeName: "Ontario", contactEmail: "info@pmrfp.com" });
    expect(e.bodyHtml).toContain("https://pmrfp.com/api/digest/confirm?s=1&amp;t=2");
    expect(e.footnoteHtml).toContain(DIGEST_ADDRESS);
  });
});

const rfp = (over: Partial<RfpListItem>): RfpListItem => ({
  slug: "x",
  title: "X",
  summary: null,
  categories: ["Roofing"],
  regionName: null,
  propertyTypeName: null,
  city: null,
  province: "Ontario",
  deadline: "2026-10-30",
  isDemo: false,
  photoUrls: [],
  status: "open",
  sourceType: "public_source",
  ...over,
});

const project = (over: Partial<MajorProject>): MajorProject => ({
  id: "p1",
  slug: "big-hospital",
  source: "ontario-builds",
  name: "Big Hospital",
  description: "A new hospital.",
  category: "healthcare" as MajorProject["category"],
  owner: "Infrastructure Ontario",
  city: "Toronto",
  province: "Ontario",
  regionId: null,
  estValueCad: 900_000_000,
  size: "40,000 m²",
  status: "under_construction",
  statusRaw: "Construction",
  statusDate: "2026-09-01",
  timeline: "2026–2030",
  tradesNeeded: ["roofing", "electrical"],
  sources: [],
  license: "OGL-Ontario",
  evidence: "F",
  caveats: "Value is an estimate.",
  firstSeen: "2026-10-10T00:00:00Z",
  lastSeen: "2026-10-12T00:00:00Z",
  stale: false,
  staleSince: null,
  statusChangedAt: null,
  updatedAt: "2026-10-12T00:00:00Z",
  hasGc: true,
  hasBidRoute: false,
  sourceUpdated: null,
  linkGroup: null,
  ...over,
});

const data: DigestData = {
  today: "2026-10-13",
  tradeSlugByName: new Map([["Roofing", "roofing"], ["Electrical", "electrical"], ["HVAC", "hvac"]]),
  rfps: [
    rfp({ slug: "on-roof-tor-1", title: "Ontario roof", province: "Ontario", deadline: "2026-10-20" }),
    rfp({ slug: "on-hvac-tor-2", title: "Ontario HVAC", province: "Ontario", categories: ["HVAC"] }),
    rfp({ slug: "tx-roof-us-0123456789abcdef0123456789abcdef", title: "Texas roof", province: "Texas", deadline: "2026-10-25" }),
    rfp({ slug: "bc-roof-cbc-3", title: "BC roof", province: "British Columbia" }),
    rfp({ slug: "old-roof-tor-4", title: "Closed already", province: "Ontario", deadline: "2026-10-01" }),
    rfp({ slug: "demo-roof", title: "Demo", province: "Ontario", isDemo: true, sourceType: null }),
    rfp({
      slug: "school-roof-cba-ws1",
      title: "School roof awarded",
      province: "Ontario",
      status: "awarded",
      deadline: "2026-10-08",
      summary: "Awarded October 8, 2026 to Metro Roofing Ltd. (Toronto) — $1,200,000 CAD. Past public contract issued by the Government of Canada.",
    }),
    rfp({
      slug: "old-roof-cba-ws2",
      title: "Old award",
      province: "Ontario",
      status: "awarded",
      deadline: "2026-08-01",
      summary: "Awarded August 1, 2026 to Dexter Construction (Toronto) — $10,000 CAD. Past public contract issued by the Government of Canada.",
    }),
  ],
  projects: [
    project({}),
    project({ id: "p2", slug: "old-project", name: "Old project", firstSeen: "2026-01-01T00:00:00Z" }),
    project({ id: "p3", slug: "bc-project", name: "BC project", province: "British Columbia" }),
  ],
};

const sub = (over: Partial<DigestSubscriber> = {}): DigestSubscriber => ({
  id: "s1",
  country: "CA",
  province: "Ontario",
  trades: ["roofing"],
  lang: "en",
  consentAt: "2026-10-01T12:00:00Z",
  ...over,
});

describe("weekly email content is country-scoped", () => {
  it("an Ontario roofer gets Ontario roofing work only", () => {
    const d = buildWeeklyDigest(sub(), data);
    expect(d.open.map((r) => r.title)).toEqual(["Ontario roof"]);
    expect(d.awards.map((a) => a.winner)).toEqual(["Metro Roofing Ltd."]);
    expect(d.projects.map((p) => p.name)).toEqual(["Big Hospital"]);
    expect(d.empty).toBe(false);
  });

  it("never mixes the countries: a Texas subscriber gets Texas only and no (Canadian) major projects", () => {
    const d = buildWeeklyDigest(sub({ country: "US", province: "Texas" }), data);
    expect(d.open.map((r) => r.title)).toEqual(["Texas roof"]);
    expect(d.awards).toEqual([]);
    expect(d.projects).toEqual([]);
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/Ontario|BC roof|Hospital|Metro Roofing/);
  });

  it("no trades picked = every trade; nothing for the week = no email", () => {
    expect(buildWeeklyDigest(sub({ trades: [] }), data).open.map((r) => r.title).sort()).toEqual(["Ontario HVAC", "Ontario roof"]);
    expect(buildWeeklyDigest(sub({ province: "Manitoba" }), data).empty).toBe(true);
  });

  it("the email carries the sender, the mailing address, the reason and a one-click unsubscribe", () => {
    const d = buildWeeklyDigest(sub(), data);
    const e = renderWeeklyDigest(sub(), d, {
      base: "https://pmrfp.com",
      unsubscribeUrl: "https://pmrfp.com/api/digest/unsubscribe?s=s1&t=abc",
      placeName: "Ontario",
      tradeNames: ["Roofing"],
      contactEmail: "info@pmrfp.com",
    });
    expect(e.footnoteHtml).toContain(DIGEST_SENDER);
    expect(e.footnoteHtml).toContain("5050 Dufferin St., Toronto, ON M3H 5T5");
    expect(e.footnoteHtml).toContain('href="https://pmrfp.com/api/digest/unsubscribe?s=s1&amp;t=abc"');
    expect(e.footnoteHtml).toMatch(/signed up/);
    expect(e.subject).toBe("Ontario this week: 1 open bids, 1 recent awards");
    expect(e.bodyHtml).toContain("https://pmrfp.com/rfps/on-roof-tor-1");
    expect(e.bodyHtml).toContain("https://pmrfp.com/major-projects/big-hospital");
    // French subscribers get French copy and French links.
    const fr = renderWeeklyDigest(sub({ lang: "fr" }), d, { base: "https://pmrfp.com", unsubscribeUrl: "u", placeName: "Ontario", tradeNames: [], contactEmail: "info@pmrfp.com" });
    expect(fr.bodyHtml).toContain("https://pmrfp.com/fr/rfps/on-roof-tor-1");
    expect(fr.footnoteHtml).toContain("Désabonnez-vous");
  });
});

describe("weekly email unsubscribe links", () => {
  const prev = process.env.UNSUBSCRIBE_SECRET;
  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret";
  });
  afterEach(() => {
    process.env.UNSUBSCRIBE_SECRET = prev;
  });

  it("are signed per subscriber and can't be forged or swapped", () => {
    const url = new URL(digestUnsubscribeUrl("https://pmrfp.com", "sub-1")!);
    expect(url.pathname).toBe("/api/digest/unsubscribe");
    const t = url.searchParams.get("t");
    expect(verifyDigestUnsubscribe("sub-1", t)).toBe(true);
    expect(verifyDigestUnsubscribe("sub-2", t)).toBe(false);
    expect(verifyDigestUnsubscribe("sub-1", "forged")).toBe(false);
    // A digest link can't unsubscribe an account, nor the other way round.
    expect(verifyUnsubscribe("sub-1", t)).toBe(false);
    const acct = new URL(unsubscribeUrl("https://pmrfp.com", "sub-1")!).searchParams.get("t");
    expect(verifyDigestUnsubscribe("sub-1", acct)).toBe(false);
  });
});

describe("bounces and complaints (Resend webhook)", () => {
  const secretBytes = Buffer.from("super-secret-key-material");
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const sign = (id: string, ts: string, body: string) => `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;

  it("verifies the Svix signature and rejects tampering and replays", () => {
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.ca"] } });
    const now = 1_760_000_000;
    const h = { id: "msg_1", timestamp: String(now), signature: `v1,bad ${sign("msg_1", String(now), body)}` };
    expect(verifySvixSignature(secret, h, body, now)).toBe(true);
    expect(verifySvixSignature(secret, h, body.replace("a@b", "x@y"), now)).toBe(false);
    expect(verifySvixSignature(secret, h, body, now + 3600)).toBe(false);
    expect(verifySvixSignature(secret, { ...h, signature: null }, body, now)).toBe(false);
  });

  it("hard bounces and complaints are suppressed; soft bounces and other events are not", () => {
    expect(suppressionFromEvent({ type: "email.bounced", data: { to: ["A@B.ca"], bounce: { type: "Permanent", message: "no such user" } } })).toEqual({
      reason: "bounce",
      emails: ["a@b.ca"],
      detail: "no such user",
    });
    expect(suppressionFromEvent({ type: "email.complained", data: { to: "c@d.com" } })).toEqual({ reason: "complaint", emails: ["c@d.com"], detail: null });
    expect(suppressionFromEvent({ type: "email.bounced", data: { to: ["a@b.ca"], bounce: { type: "Transient" } } })).toBeNull();
    expect(suppressionFromEvent({ type: "email.delivered", data: { to: ["a@b.ca"] } })).toBeNull();
  });
});

/* ================================================================== free-account gate */

describe("free-account gate: no gated data for signed-out visitors", () => {
  const p = project({});
  const extras = {
    trades: ["Roofing", "Electrical"],
    open: [{ slug: "secret-open-rfp", title: "Related open bid", deadline: "2026-11-01" }],
    awards: [{ slug: "secret-award", title: "Related award", deadline: "2026-09-01" }],
  };

  it("major project: the summary is the same for everyone; details only with an account", () => {
    const out = majorProjectView(p, extras, false);
    expect(out.member).toBeNull();
    const json = JSON.stringify(out);
    for (const gated of ["40,000 m²", "2026–2030", "Value is an estimate.", "Construction", "Related open bid", "secret-open-rfp", "Related award", "secret-award"]) {
      expect(json).not.toContain(gated);
    }
    // The indexable summary is there.
    expect(out.summary).toMatchObject({ name: "Big Hospital", description: "A new hospital.", province: "Ontario", status: "under_construction", estValueCad: 900_000_000 });
    // Signed in: same summary plus the details.
    const member = majorProjectView(p, extras, true);
    expect(member.summary).toEqual(out.summary);
    expect(member.member).toMatchObject({ size: "40,000 m²", timeline: "2026–2030", trades: ["Roofing", "Electrical"], open: extras.open, awards: extras.awards });
  });

  it("benchmarks: signed out keeps the headline numbers, loses examples, counts by buyer/city; Pro unchanged", () => {
    const teaser = {
      pro: false,
      data: {
        trade: "Roofing", province: "Ontario", city: null, country: "CA", currency: "CAD", from: "2024-01-01", to: "2026-10-01",
        total: 40, valued: 30, undisclosed: 10, enough: true,
        examples: [{ slug: "secret-example", title: "Example award", winner: "Metro Roofing" }],
        topBuyers: [{ name: "City of Toronto", awards: 7 }],
        cities: [{ city: "Toronto", total: 10, valued: 8, enough: true }],
        sourceKeys: ["awards"], attributions: ["Contains information licensed under the Open Government Licence – Canada."],
      },
    } as unknown as BenchmarkView;
    const out = gateBenchmarkView(teaser, false);
    expect(out.gated).toBe(true);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/secret-example|Example award|City of Toronto|"Toronto"/);
    expect(out.data).toMatchObject({ total: 40, valued: 30, enough: true, attributions: teaser.data.attributions });
    expect(gateBenchmarkView(teaser, true)).toEqual({ ...teaser, gated: false });
    const pro = { pro: true, data: { ...teaser.data, stats: {} } } as unknown as BenchmarkView;
    expect(gateBenchmarkView(pro, false)).toEqual({ ...pro, gated: false });
  });
});
