import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPETITOR_DOMAINS,
  checkSponsorCopy,
  dominantPlace,
  findConflicts,
  matchPaidSponsor,
  normalizeRegion,
  slotKeys,
  slotState,
  sponsorAllowedOn,
  sponsorSlug,
  type PaidSponsor,
} from "@/lib/sponsors/model";
import { currencyFor, lowestSponsorPrice, parseTierParam, sponsorPrice, sponsorStripePrice, SPONSOR_PRICES } from "@/lib/sponsors/pricing";
import { pickSponsorUnit } from "@/lib/sponsors/pick";
import { sponsorEmailBlock } from "@/lib/sponsors/email";
import { buildAudience } from "@/lib/sponsors/audience";
import { buildReport, monthRange, reportCsv } from "@/lib/sponsors/report";
import common from "@/i18n/messages/common";
import v3Pages from "@/i18n/messages/v3Pages";

const TODAY = "2026-10-12";

function sponsor(p: Partial<PaidSponsor> & Pick<PaidSponsor, "slug">): PaidSponsor {
  return {
    id: p.slug,
    name: p.slug.toUpperCase(),
    logoUrl: null,
    url: `https://${p.slug}.example.com`,
    headline: "Bid bonds in 48 hours",
    message: "Surety bonds for growing contractors, from a broker who answers the phone.",
    cta: "Get a bond quote",
    headlineFr: null,
    messageFr: null,
    ctaFr: null,
    tier: "province",
    country: "CA",
    trades: ["electrical"],
    regions: ["Ontario"],
    startDate: "2026-10-01",
    endDate: null,
    status: "approved",
    ...p,
  };
}

describe("slot matching: trade × province/state × country", () => {
  const onElectrical = sponsor({ slug: "on-elec" });
  const qcElectrical = sponsor({ slug: "qc-elec", regions: ["Quebec"], headlineFr: "Cautions en 48 heures", messageFr: "Cautionnement pour entrepreneurs en croissance.", ctaFr: "Demander une soumission" });
  const national = sponsor({ slug: "ca-elec-national", tier: "national", regions: [] });
  const texas = sponsor({ slug: "tx-hvac", country: "US", trades: ["hvac"], regions: ["Texas"] });
  const all = [onElectrical, qcElectrical, national, texas];
  const ctx = { placement: "rfp_detail" as const, country: "CA" as const, today: TODAY };

  it("shows the province sponsor on its own trade in its own province", () => {
    expect(matchPaidSponsor({ ...ctx, trades: ["Electrical"], province: "ON" }, all)?.slug).toBe("on-elec");
    expect(matchPaidSponsor({ ...ctx, trades: ["electrical"], province: "Québec" }, all)?.slug).toBe("qc-elec");
  });

  it("falls back to the national sponsor where no province sponsor holds the slot", () => {
    expect(matchPaidSponsor({ ...ctx, trades: ["electrical"], province: "Alberta" }, all)?.slug).toBe("ca-elec-national");
    expect(matchPaidSponsor({ ...ctx, trades: ["electrical"], province: null }, all)?.slug).toBe("ca-elec-national");
  });

  it("never shows a sponsor for another trade", () => {
    expect(matchPaidSponsor({ ...ctx, trades: ["roofing"], province: "Ontario" }, all)).toBeNull();
    expect(matchPaidSponsor({ ...ctx, trades: [], province: "Ontario" }, all)).toBeNull();
  });

  it("never mixes Canada and the U.S.", () => {
    expect(matchPaidSponsor({ ...ctx, country: "US", trades: ["electrical"], province: "Texas" }, all)).toBeNull();
    expect(matchPaidSponsor({ ...ctx, country: "US", trades: ["hvac"], province: "TX" }, all)?.slug).toBe("tx-hvac");
    expect(matchPaidSponsor({ ...ctx, country: "CA", trades: ["hvac"], province: "Texas" }, all)).toBeNull();
    // A U.S. state on a Canadian page is a mismatch, not a reason to show the national sponsor.
    expect(matchPaidSponsor({ ...ctx, country: "CA", trades: ["electrical"], province: "Texas" }, all)).toBeNull();
  });

  it("only shows live sponsors (approved and inside their dates)", () => {
    const later = sponsor({ slug: "later", startDate: "2026-11-01" });
    const over = sponsor({ slug: "over", endDate: "2026-10-11" });
    const pending = sponsor({ slug: "pending", status: "pending" });
    const paused = sponsor({ slug: "paused", status: "paused" });
    for (const s of [later, over, pending, paused]) {
      expect(matchPaidSponsor({ ...ctx, trades: ["electrical"], province: "Ontario" }, [s])).toBeNull();
    }
  });

  it("keeps digest-only sponsors in emails", () => {
    const digest = sponsor({ slug: "digest", tier: "digest" });
    expect(matchPaidSponsor({ ...ctx, trades: ["electrical"], province: "Ontario" }, [digest])).toBeNull();
    expect(matchPaidSponsor({ ...ctx, placement: "digest_email", trades: ["electrical"], province: "Ontario" }, [digest])?.slug).toBe("digest");
  });

  it("lets a province page with no trade show any trade's sponsor there, rotating stably", () => {
    const hvac = sponsor({ slug: "on-hvac", trades: ["hvac"] });
    const picks = new Set(
      Array.from({ length: 30 }, (_, i) => matchPaidSponsor({ ...ctx, placement: "major_projects", anyTrade: true, province: "Ontario", seed: `s${i}` }, [onElectrical, hvac])?.slug),
    );
    expect(picks).toEqual(new Set(["on-elec", "on-hvac"]));
    const once = matchPaidSponsor({ ...ctx, placement: "major_projects", anyTrade: true, province: "Ontario", seed: "same" }, [onElectrical, hvac]);
    expect(matchPaidSponsor({ ...ctx, placement: "major_projects", anyTrade: true, province: "Ontario", seed: "same" }, [onElectrical, hvac])).toBe(once);
  });

  it("paid sponsors win over house sponsors, and house sponsors still fill empty slots", () => {
    const paid = pickSponsorUnit({ placement: "rfp_detail", categories: ["Electrical"], province: "Ontario", seed: "x" }, all);
    expect(paid?.paid).toBe(true);
    expect(paid?.id).toBe("on-elec");
    expect(paid?.href).toBe("/go/on-elec?p=rfp_detail&t=electrical&r=ontario");
    const house = pickSponsorUnit({ placement: "rfp_detail", categories: ["Electrical"], province: "Ontario", seed: "x" }, []);
    expect(house?.paid).toBe(false);
    expect(house?.id).toBe("maple");
  });

  it("uses the French copy on French pages when the sponsor supplied it", () => {
    expect(pickSponsorUnit({ placement: "rfp_detail", categories: ["electrical"], province: "Quebec", seed: "q" }, all, "fr")?.headline).toBe("Cautions en 48 heures");
    expect(pickSponsorUnit({ placement: "rfp_detail", categories: ["electrical"], province: "Quebec", seed: "q" }, all, "en")?.headline).toBe("Bid bonds in 48 hours");
  });
});

describe("exclusivity: one sponsor per slot", () => {
  const holder = sponsor({ slug: "holder", startDate: "2026-10-01", endDate: "2027-03-31" });

  it("lists the slots a sponsor holds", () => {
    expect(slotKeys(holder).map((k) => `${k.trade}|${k.region}|${k.channel}`)).toEqual(["electrical|Ontario|web", "electrical|Ontario|email"]);
    expect(slotKeys(sponsor({ slug: "n", tier: "national", regions: [] })).map((k) => k.region)).toEqual(["*", "*"]);
    expect(slotKeys(sponsor({ slug: "d", tier: "digest" })).map((k) => k.channel)).toEqual(["email"]);
  });

  it("refuses a second sponsor for the same trade × province and overlapping dates", () => {
    const rival = { id: "rival", tier: "province" as const, country: "CA" as const, trades: ["electrical"], regions: ["Ontario"], startDate: "2027-01-01", endDate: null };
    expect(findConflicts(rival, [holder])).toHaveLength(2);
    // Digest-only still clashes on the email slot.
    expect(findConflicts({ ...rival, tier: "digest" }, [holder])).toHaveLength(1);
  });

  it("allows the same slot after the holder ends, other provinces, other trades, the other country and national", () => {
    const base = { id: "x", tier: "province" as const, country: "CA" as const, trades: ["electrical"], regions: ["Ontario"], startDate: "2027-04-01", endDate: null };
    expect(findConflicts(base, [holder])).toEqual([]);
    expect(findConflicts({ ...base, startDate: "2026-10-01", regions: ["Alberta"] }, [holder])).toEqual([]);
    expect(findConflicts({ ...base, startDate: "2026-10-01", trades: ["hvac"] }, [holder])).toEqual([]);
    expect(findConflicts({ ...base, startDate: "2026-10-01", country: "US", regions: ["Ontario"] }, [holder])).toEqual([]);
    expect(findConflicts({ ...base, startDate: "2026-10-01", tier: "national", regions: [] }, [holder])).toEqual([]);
  });

  it("ignores drafts, ended and rejected rows; pending and paused hold their slot", () => {
    const rival = { id: "rival", tier: "province" as const, country: "CA" as const, trades: ["electrical"], regions: ["Ontario"], startDate: TODAY, endDate: null };
    for (const status of ["draft", "ended", "rejected"] as const) expect(findConflicts(rival, [{ ...holder, status }])).toEqual([]);
    for (const status of ["pending", "paused", "approved"] as const) expect(findConflicts(rival, [{ ...holder, status }]).length).toBeGreaterThan(0);
  });

  it("says whether a slot is open on /advertise, and until when it's taken", () => {
    expect(slotState({ country: "CA", trade: "electrical", region: "Ontario", tier: "province" }, [holder], TODAY)).toEqual({ taken: true, until: "2027-03-31", by: "province" });
    expect(slotState({ country: "CA", trade: "electrical", region: "Alberta", tier: "province" }, [holder], TODAY)).toEqual({ taken: false });
    expect(slotState({ country: "CA", trade: "electrical", region: "*", tier: "national" }, [holder], TODAY)).toEqual({ taken: false });
    expect(slotState({ country: "CA", trade: "electrical", region: "Ontario", tier: "province" }, [{ ...holder, endDate: "2026-10-01" }], TODAY)).toEqual({ taken: false });
  });
});

describe("currency per country", () => {
  it("prices Canada in CAD and the U.S. in USD, never converted", () => {
    expect(currencyFor("CA")).toBe("CAD");
    expect(currencyFor("US")).toBe("USD");
    expect(sponsorPrice("province", "CA")).toEqual({ amount: SPONSOR_PRICES.province.CAD, currency: "CAD" });
    expect(sponsorPrice("national", "US")).toEqual({ amount: SPONSOR_PRICES.national.USD, currency: "USD" });
    expect(sponsorPrice("province", "CA").amount).toBe(199);
    expect(sponsorPrice("national", "CA").amount).toBe(499);
    expect(sponsorPrice("digest", "CA").amount).toBe(149);
    expect(lowestSponsorPrice("US")).toBe(SPONSOR_PRICES.digest.USD);
  });

  it("uses only the env-configured Stripe Price for the visitor's currency", () => {
    const env = { STRIPE_PRICE_SPONSOR_PROVINCE_CAD: "price_cad123", STRIPE_PRICE_SPONSOR_PROVINCE_USD: "not-a-price" };
    expect(sponsorStripePrice("province", "CA", env)).toBe("price_cad123");
    expect(sponsorStripePrice("province", "US", env)).toBeNull();
    expect(sponsorStripePrice("national", "CA", env)).toBeNull();
  });

  it("maps old package links to today's tiers", () => {
    expect(parseTierParam("trade")).toBe("province");
    expect(parseTierParam("founding")).toBe("national");
    expect(parseTierParam("digest")).toBe("digest");
    expect(parseTierParam("nope")).toBe("unsure");
  });
});

describe("label and rel attributes", () => {
  it("has a Sponsored label in every language", () => {
    expect(common.en.sponsor.Sponsored).toBe("Sponsored");
    expect(common.fr.sponsor.Sponsored).toBe("Commandité");
    expect(common.es.sponsor.Sponsored).toBe("Patrocinado");
  });

  it("labels the email row and marks every link sponsored", () => {
    const shown: string[] = [];
    const html = sponsorEmailBlock(
      { placement: "alerts_email", categories: ["Electrical"], market: "CA", province: "Ontario", seed: "u1" },
      "https://pmrfp.com",
      [sponsor({ slug: "on-elec" })],
      (u) => shown.push(u.id),
    );
    expect(shown).toEqual(["on-elec"]);
    expect(html).toContain(">Sponsored<");
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a).toContain('rel="sponsored noopener"');
      expect(a).toContain("https://pmrfp.com/go/on-elec?");
    }
  });

  it("escapes sponsor copy in emails", () => {
    const html = sponsorEmailBlock({ placement: "digest_email", categories: ["electrical"], province: "ON", seed: "u" }, "", [sponsor({ slug: "x", headline: "<b>Hi</b>" })]);
    expect(html).not.toContain("<b>Hi</b>");
    expect(html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
  });
});

describe("guardrails on sponsor copy", () => {
  const ok = { name: "Acme Surety", url: "https://acmesurety.ca", headline: "Bid bonds in 48 hours", message: "Surety and performance bonds for growing contractors.", cta: "Get a quote" };

  it("passes honest copy (a bid bond is not a bid)", () => {
    expect(checkSponsorCopy(ok)).toEqual([]);
  });

  it("rejects copy that reads like a listing", () => {
    expect(checkSponsorCopy({ ...ok, headline: "New RFP: parking garage repairs" })).toContain("looks_like_bid");
    expect(checkSponsorCopy({ ...ok, message: "Closing date October 30. Request for proposals." })).toContain("looks_like_bid");
    expect(checkSponsorCopy({ ...ok, message: "Appel d'offres ouvert" })).toContain("looks_like_bid");
  });

  it("rejects endorsement claims and guarantees", () => {
    expect(checkSponsorCopy({ ...ok, message: "The bonding broker recommended by PMRFP." })).toContain("endorsement");
    expect(checkSponsorCopy({ ...ok, message: "Official partner for contractors." })).toContain("endorsement");
    expect(checkSponsorCopy({ ...ok, message: "Guaranteed to win contracts." })).toContain("endorsement");
  });

  it("rejects competitors and competing pitches", () => {
    expect(COMPETITOR_DOMAINS).toContain("merx.com");
    expect(checkSponsorCopy({ ...ok, url: "https://www.merx.com/" })).toContain("competitor");
    expect(checkSponsorCopy({ ...ok, url: "https://app.bidsandtenders.ca/x" })).toContain("competitor");
    expect(checkSponsorCopy({ ...ok, message: "Tender alerts for every province." })).toContain("competing_pitch");
  });

  it("enforces lengths, https and French copy for Québec", () => {
    expect(checkSponsorCopy({ ...ok, url: "http://acme.ca" })).toContain("url");
    expect(checkSponsorCopy({ ...ok, headline: "x".repeat(71) })).toContain("headline_length");
    expect(checkSponsorCopy({ ...ok, regions: ["Quebec"] })).toContain("french_required");
    expect(checkSponsorCopy({ ...ok, regions: ["QC"], headlineFr: "Cautions en 48 heures", messageFr: "Cautionnement pour entrepreneurs." })).toEqual([]);
  });

  it("never gives a paid sponsor a house sponsor's link name", () => {
    expect(sponsorSlug("Maple")).toBe("maple-sponsor");
    expect(sponsorSlug("Acme Bonding Inc.")).toBe("acme-bonding-inc");
  });
});

describe("no sponsor on excluded routes", () => {
  it("rejects dashboards, admin, auth, pricing, billing and checkout paths", () => {
    for (const p of ["/dashboard", "/fr/dashboard/rfps", "/pm-dashboard", "/admin/sponsors", "/sign-in", "/es/sign-up", "/pricing", "/checkout", "/onboarding", "/founding-500", "/dashboard/billing?plan=pro"]) {
      expect(sponsorAllowedOn(p), p).toBe(false);
    }
    for (const p of ["/rfps/abc", "/fr/major-projects", "/forum/electrical", "/trades/hvac/toronto", "/benchmarks/hvac/ontario"]) {
      expect(sponsorAllowedOn(p), p).toBe(true);
    }
  });

  it("no excluded route renders the live sponsor slot", () => {
    const app = join(process.cwd(), "src", "app", "[lang]");
    const dirs = [
      "dashboard", "pm-dashboard", "admin", "onboarding", "use-template", "suspended",
      "(auth)", join("(v3)", "sign-up"), join("(v3)", "pricing"), join("(v3)", "check-email"), join("(v3)", "advertise"),
      join("(marketing)", "founding-500"),
    ];
    const files: string[] = [];
    const walk = (d: string) => {
      let entries: string[] = [];
      try {
        entries = readdirSync(d);
      } catch {
        return;
      }
      for (const e of entries) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(e)) files.push(p);
      }
    };
    for (const d of dirs) walk(join(app, d));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(/<SponsorSlot\b|sponsorEmailBlock\(|from "@\/components\/sponsors\/sponsor-slot"/.test(src), f).toBe(false);
    }
  });
});

describe("audience numbers", () => {
  const categories = [{ slug: "electrical", name: "Electrical" }, { slug: "hvac", name: "HVAC" }];
  const board = [
    { slug: "a", categories: ["Electrical"], province: "Ontario", status: "open", award: false },
    { slug: "b", categories: ["Electrical"], province: "ON", status: "open", award: false },
    { slug: "c", categories: ["HVAC"], province: "Quebec", status: "closed", award: true },
    { slug: "d", categories: ["HVAC"], province: "Texas", status: "open", award: false },
  ];

  it("counts one country only, by trade × province", () => {
    const ca = buildAudience({ country: "CA", board, categories, projects: [{ province: "Ontario", tradesNeeded: ["electrical"], stale: false }, { province: "Ontario", tradesNeeded: ["electrical"], stale: true }] });
    expect(ca.open).toBe(2);
    expect(ca.awards).toBe(1);
    expect(ca.projects).toBe(1);
    expect(ca.slots[0]).toMatchObject({ trade: "electrical", province: "Ontario", open: 2, projects: 1 });
    const us = buildAudience({ country: "US", board, categories, projects: null });
    expect(us.open).toBe(1);
    expect(us.awards).toBe(0);
    expect(us.projects).toBeNull();
    expect(us.slots.map((s) => s.province)).toEqual(["Texas"]);
  });

  it("only breaks companies down by slot when the list is complete", () => {
    const rows = [{ categories: ["Electrical"], province: "Ontario", countries: ["CA" as const] }, { categories: ["HVAC"], province: "Texas", countries: ["US" as const] }];
    expect(buildAudience({ country: "CA", board, categories, companies: { rows, capped: false } }).slots[0].companies).toBe(1);
    const capped = buildAudience({ country: "CA", board, categories, companies: { rows, capped: true } });
    expect(capped.companies).toEqual({ n: 1, capped: true });
    expect(capped.slots[0].companies).toBeNull();
  });

  it("picks an email's country and province from its listings", () => {
    expect(dominantPlace([{ province: "ON" }, { province: "Ontario" }, { province: "Quebec" }])).toEqual({ country: "CA", province: "Ontario" });
    expect(dominantPlace([{ province: "TX", country: "US" }])).toEqual({ country: "US", province: "Texas" });
    expect(dominantPlace([])).toEqual({ country: "CA", province: null });
    expect(normalizeRegion("Québec")).toBe("Quebec");
  });
});

describe("monthly report", () => {
  it("adds impressions and clicks per day, placement, trade and province", () => {
    const r = buildReport(
      "2026-10",
      [
        { day: "2026-10-02", placement: "rfp_detail", trade: "electrical", region: "ontario", n: 40 },
        { day: "2026-10-02", placement: "alerts_email", trade: "electrical", region: "ontario", n: 10 },
      ],
      [{ day: "2026-10-02", placement: "rfp_detail", trade: "electrical", region: "ontario", n: 3 }],
    );
    expect(r.impressions).toBe(50);
    expect(r.clicks).toBe(3);
    expect(r.ctr).toBeCloseTo(0.06);
    expect(r.byPlacement[0]).toEqual({ placement: "rfp_detail", impressions: 40, clicks: 3 });
    const csv = reportCsv("=Acme, Inc.", r);
    expect(csv.split("\n")[0]).toBe("sponsor,month,day,placement,trade,province_state,impressions,clicks");
    expect(csv).toContain(`"'=Acme, Inc.",2026-10,2026-10-02,rfp_detail,electrical,ontario,40,3`);
    expect(csv).toContain("TOTAL,,,,50,3");
  });

  it("reads a month, else the current one", () => {
    expect(monthRange("2026-02", TODAY)).toEqual({ month: "2026-02", from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("junk", TODAY)).toEqual({ month: "2026-10", from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("/advertise copy", () => {
  it("has every string in en, fr and es", () => {
    const keys = (o: unknown, prefix = ""): string[] =>
      o && typeof o === "object" && !Array.isArray(o)
        ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    const en = keys(v3Pages.en.advertise).sort();
    expect(keys(v3Pages.fr.advertise).sort()).toEqual(en);
    expect(keys(v3Pages.es.advertise).sort()).toEqual(en);
  });
});
