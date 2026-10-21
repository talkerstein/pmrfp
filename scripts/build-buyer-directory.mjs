#!/usr/bin/env node
/**
 * Builds src/lib/buyers/directory.json (the public "where every buyer posts
 * bids" directory) from the feed-map evidence CSVs:
 *
 *   briefs/strategy/feed-map/municipal-2026-10-15.csv      606 Canadian public buyers
 *   briefs/strategy/feed-map/state-provincial-portals.csv  provincial / territorial portals (Canada rows only)
 *
 * Re-import: edit or replace the CSVs, run `node scripts/build-buyer-directory.mjs`,
 * commit the JSON. Why JSON and not a table: the directory changes when the
 * research changes (a reviewed PR), not at runtime; a static file adds zero
 * database reads to every buyer page (DB-load rules, PR #136) and keeps the
 * evidence CSV and the published directory in one reviewable diff.
 *
 * Only what a contractor needs is kept: the buyer, where it posts bids
 * (official page + platform), and a role-based procurement inbox when the
 * buyer's own page shows one (personal staff addresses are dropped). Internal
 * research notes and verdicts are not published. `domains` (the buyer's own
 * web and email domains) lets a clerk with a matching work email claim the
 * buyer's page on the spot (src/lib/towns/domains.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MUNICIPAL = join(root, "briefs/strategy/feed-map/municipal-2026-10-15.csv");
const PROVINCIAL = join(root, "briefs/strategy/feed-map/state-provincial-portals.csv");
const OUT = join(root, "src/lib/buyers/directory.json");

/** RFC 4180 CSV → array of objects keyed by the header row. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const PROVINCES = {
  ON: "Ontario",
  BC: "British Columbia",
  AB: "Alberta",
  NS: "Nova Scotia",
  MB: "Manitoba",
  SK: "Saskatchewan",
  QC: "Quebec",
  NB: "New Brunswick",
  PE: "Prince Edward Island",
  NL: "Newfoundland and Labrador",
  YT: "Yukon",
  NT: "Northwest Territories",
  NU: "Nunavut",
};
const CODE_BY_NAME = Object.fromEntries(Object.entries(PROVINCES).map(([k, v]) => [v, k]));

const slugify = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");

const safeUrl = (u) => {
  const s = (u ?? "").trim().split(/\s+/)[0];
  if (!s) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/** Platforms named in the free-text "platform" column, in the order they appear. */
const PLATFORM_RULES = [
  ["bids-and-tenders", /bids\s*&\s*tenders|bidsandtenders/i],
  ["bonfire", /bonfire/i],
  ["biddingo", /biddingo/i],
  ["merx", /\bmerx\b/i],
  ["ontario-tenders-portal", /ontario tenders portal|jaggaer/i],
  ["bc-bid", /bc ?bid/i],
  ["apc", /\bapc\b|alberta purchasing connection/i],
  ["ns-portal", /ns procurement portal|nova scotia procurement portal/i],
  ["sasktenders", /sasktenders/i],
  ["nbon", /\bnbon\b/i],
  ["sap-ariba", /ariba/i],
  ["civicinfo-bc", /civicinfo/i],
];
const OWN_SITE = /own[- ]site|own site|own page|own supplier portal|own-site|rss feed \(own site\)/i;

export function platformsOf(raw, ownSiteList) {
  const text = raw ?? "";
  const found = PLATFORM_RULES.map(([k, re]) => [k, text.search(re)]).filter(([, at]) => at >= 0).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const own = /^yes/i.test(ownSiteList ?? "") || OWN_SITE.test(text);
  if (own && !found.includes("own-site")) found.push("own-site");
  return found;
}

/** The buyer's own portal on a platform, when the research names it ("guelph.bidsandtenders.ca"). */
export function portalUrlOf(raw) {
  const t = raw ?? "";
  const host = t.match(/\b([a-z0-9-]+\.(?:bidsandtenders\.ca|bonfirehub\.(?:ca|com)))\b/i)?.[1];
  if (host) return `https://${host.toLowerCase()}/`;
  const bdg = t.match(/\b((?:portal\.)?biddingo\.com\/[a-z0-9/_-]+)/i)?.[1];
  if (bdg) return `https://${bdg.replace(/\/+$/, "")}`;
  const merx = t.match(/\b(merx\.com\/[a-z0-9_-]+)/i)?.[1];
  if (merx) return `https://www.${merx}`;
  return null;
}

/** Buyer type → directory group. */
export function groupOf(type) {
  const t = (type ?? "").toLowerCase();
  if (t === "province") return "province";
  if (/upper-tier|regional district|county|district services|dssab/.test(t)) return "regional";
  if (/municipal|rural/.test(t)) return "municipality";
  if (/school/.test(t)) return "school";
  if (/universit|college|post-secondary/.test(t)) return "post-secondary";
  if (/hospital|health/.test(t)) return "health";
  if (/housing/.test(t)) return "housing";
  if (/conservation/.test(t)) return "conservation";
  return "agency";
}

/** Two-label public suffixes (on.ca, gc.ca…): the registrable domain is one label deeper. */
const MULTI_SUFFIX = new Set(["on.ca", "qc.ca", "bc.ca", "ab.ca", "mb.ca", "sk.ca", "ns.ca", "nb.ca", "nl.ca", "nf.ca", "pe.ca", "yk.ca", "nt.ca", "nu.ca", "gc.ca"]);

/**
 * Domains that never prove someone works for a buyer: bid platforms, website
 * builders and social sites a bids page or contact can sit on.
 */
const NOT_A_BUYER_DOMAIN = new Set([
  "bidsandtenders.ca", "bidsandtenders.com", "bonfirehub.ca", "bonfirehub.com", "biddingo.com", "merx.com", "ariba.com",
  "jaggaer.com", "civicinfo.bc.ca", "sasktenders.ca", "google.com", "facebook.com", "linkedin.com", "wixsite.com",
  "squarespace.com", "wordpress.com", "weebly.com", "godaddysites.com", "eventbrite.com", "esolutionsgroup.ca",
]);

/** "https://www.city.oakville.on.ca/x" → "oakville.on.ca"; null for anything that isn't a hostname. */
export function registrableDomain(input) {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;
  let host = raw.includes("@") ? raw.split("@").pop() : raw;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(host) ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  const parts = host.split(".");
  const lastTwo = parts.slice(-2).join(".");
  return MULTI_SUFFIX.has(lastTwo) && parts.length >= 3 ? parts.slice(-3).join(".") : lastTwo;
}

/**
 * The buyer's own domains, for verifying a clerk's work email (lib/towns/domains):
 * its official bids page's domain first, then the domain of its role inbox and
 * of the page that inbox was read on. Platforms and site builders are dropped.
 */
export function buyerDomains(b) {
  const out = [];
  for (const src of [b.tendersUrl, b.email, b.emailSource]) {
    const d = registrableDomain(src);
    if (d && !NOT_A_BUYER_DOMAIN.has(d) && !out.includes(d)) out.push(d);
  }
  return out;
}

/** A role inbox (purchasing@, bids@, procurement@…), never a person's address. */
const ROLE = /purchas|procure|bid|tender|suppl|vendor|contract|finance|buy|sourc|customerservice|^info|general|^supply/i;
export function roleEmail(e) {
  const s = (e ?? "").trim().split(/[\s;,]+/)[0];
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) return null;
  return ROLE.test(s.split("@")[0]) ? s.toLowerCase() : null;
}

function build() {
  const out = [];
  const used = new Set();
  const add = (b) => {
    // The research file lists some buyers twice (two passes): merge them into one page.
    const twin = out.find((o) => o.provinceCode === b.provinceCode && o.name.toLowerCase() === b.name.toLowerCase());
    if (twin) {
      twin.platforms = [...new Set([...twin.platforms, ...b.platforms])];
      twin.tendersUrl ??= b.tendersUrl;
      twin.portalUrl ??= b.portalUrl;
      if (!twin.email && b.email) [twin.email, twin.emailSource] = [b.email, b.emailSource];
      twin.ownSiteList ||= b.ownSiteList;
      if (b.checkedOn > twin.checkedOn) twin.checkedOn = b.checkedOn;
      return;
    }
    const base = `${slugify(PROVINCES[b.provinceCode])}/${slugify(b.name) || "buyer"}`;
    let key = base;
    for (let i = 2; used.has(key); i++) key = `${base}-${i}`;
    used.add(key);
    out.push({ ...b, slug: key.split("/")[1] });
  };

  for (const r of parseCsv(readFileSync(MUNICIPAL, "utf8"))) {
    const code = (r.province ?? "").toUpperCase();
    if (!PROVINCES[code] || !r.buyer) continue;
    const tendersUrl = safeUrl(r.tenders_url);
    const platforms = platformsOf(r.platform, r.own_site_list);
    add({
      name: r.buyer.replace(/\s+/g, " "),
      provinceCode: code,
      type: r.type || "public buyer",
      group: groupOf(r.type),
      tendersUrl,
      platforms,
      portalUrl: portalUrlOf(r.platform),
      ownSiteList: /^yes/i.test(r.own_site_list ?? "") && !/empty|0 open|stale/i.test(r.own_site_list ?? ""),
      email: roleEmail(r.procurement_email),
      emailSource: roleEmail(r.procurement_email) ? safeUrl(r.email_source_url) : null,
      checkedOn: /^\d{4}-\d{2}-\d{2}$/.test(r.checked_on ?? "") ? r.checked_on : "2026-10-15",
    });
  }

  for (const r of parseCsv(readFileSync(PROVINCIAL, "utf8"))) {
    if (r.country === "US") continue; // Canada and the U.S. never mixed: this directory is Canadian.
    const code = CODE_BY_NAME[r.jurisdiction];
    const url = safeUrl(r.url);
    if (!code || !url) continue;
    // The municipal file already has this province's own buyer row (e.g. "Province of Manitoba").
    if (out.some((b) => b.provinceCode === code && b.type === "province")) continue;
    const platforms = platformsOf(`${r.portal} ${r.platform}`, "");
    add({
      name: `Government of ${r.jurisdiction}`,
      provinceCode: code,
      type: "province",
      group: "province",
      tendersUrl: url,
      platforms: platforms.length ? platforms : ["own-site"],
      portalUrl: null,
      portalName: r.portal || null,
      ownSiteList: false,
      email: null,
      emailSource: null,
      checkedOn: "2026-10-09",
    });
  }

  out.sort((a, b) => a.provinceCode.localeCompare(b.provinceCode) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  for (const b of out) b.domains = buyerDomains(b);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = build();
  writeFileSync(OUT, `${JSON.stringify(rows, null, 1)}\n`);
  const withUrl = rows.filter((r) => r.tendersUrl).length;
  console.log(`buyer directory: ${rows.length} buyers (${withUrl} with an official bids page) -> ${OUT}`);
}
