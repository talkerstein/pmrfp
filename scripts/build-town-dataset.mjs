#!/usr/bin/env node
/**
 * Builds src/lib/towns/csd.json: every Canadian municipality (2021 Census
 * subdivisions) PMRFP gives a page, with its name, type, province,
 * population and a stable page slug.
 *
 * Source: Statistics Canada, 2021 Census of Population, Census Profile
 * (98-316-X2021001), census subdivision level, read through StatCan's
 * official SDMX web service. The same counts are published as Table
 * 98-10-0002-01 "Population and dwelling counts: Canada and census
 * subdivisions (municipalities)" (open.canada.ca dataset
 * 0715efb0-4fd2-426f-9e37-ed474c76947a).
 *   Names and types: https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/datastructure/STC_CP/DSD_CSD?references=children
 *   Population 2021: https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_CSD/A5..1.1.1
 *   Census divisions (only to tell same-named places apart in a slug):
 *                    https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/codelist/STC_CP/CL_GEO_CD
 * Licence: Open Government Licence – Canada
 * (https://open.canada.ca/en/open-government-licence-canada).
 * "Contains information licensed under the Open Government Licence – Canada."
 * api.statcan.gc.ca has no robots.txt (404); three requests per run.
 *
 * Which CSDs get a page and why: src/lib/towns/names.ts (header).
 *
 * Usage:
 *   node scripts/build-town-dataset.mjs                      # downloads the three files
 *   node scripts/build-town-dataset.mjs --structure dsd_csd.xml --population pop.csv --divisions cl_geo_cd.xml
 *
 * Slugs never change once published: a re-run keeps the slug already in
 * csd.json for every CSD code it has seen, and only new places get new ones.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COUNTY_MUNICIPALITY,
  PROVINCE_BY_PRUID,
  baseTownSlug,
  countyOfSubdivision,
  csdDecision,
  townSlugify,
} from "../src/lib/towns/names.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src/lib/towns/csd.json");

export const SOURCE = {
  name: "Statistics Canada, 2021 Census of Population, Census Profile (98-316-X2021001), census subdivisions",
  table: "98-10-0002-01 Population and dwelling counts: Canada and census subdivisions (municipalities)",
  urls: {
    structure: "https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/datastructure/STC_CP/DSD_CSD?references=children",
    population: "https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_CSD/A5..1.1.1",
    divisions: "https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/codelist/STC_CP/CL_GEO_CD",
    dataset: "https://open.canada.ca/data/en/dataset/0715efb0-4fd2-426f-9e37-ed474c76947a",
  },
  licence: "Open Government Licence – Canada",
  licenceUrl: "https://open.canada.ca/en/open-government-licence-canada",
  attribution: "Contains information licensed under the Open Government Licence – Canada.",
};

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e]);

/** One codelist's codes: id → { name: {en, fr}, desc: {en, fr} }. */
export function parseCodelist(xml, id) {
  const start = xml.indexOf(`<structure:Codelist id="${id}"`);
  if (start < 0) throw new Error(`codelist ${id} not found`);
  const end = xml.indexOf("</structure:Codelist>", start);
  const seg = xml.slice(start, end);
  const out = new Map();
  for (const m of seg.matchAll(/<structure:Code id="([^"]+)">([\s\S]*?)<\/structure:Code>/g)) {
    const pick = (tag) => Object.fromEntries([...m[2].matchAll(new RegExp(`<common:${tag} xml:lang="(en|fr)">([^<]*)</common:${tag}>`, "g"))].map((x) => [x[1], decode(x[2])]));
    out.set(m[1], { name: pick("Name"), desc: pick("Description") });
  }
  return out;
}

/** "Cobourg, Town [Census subdivision], Ontario" → { type: "Town" } (names can hold commas, types can't). */
export function typeFromDescription(desc, marker) {
  const at = desc.lastIndexOf(marker);
  if (at < 0) return null;
  const head = desc.slice(0, at).trimEnd();
  const comma = head.lastIndexOf(", ");
  return comma < 0 ? null : head.slice(comma + 2).trim();
}

/** SDMX-CSV → Map(DGUID → population or null). */
export function parsePopulation(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",");
  const area = head.indexOf("REF_AREA");
  const value = head.indexOf("OBS_VALUE");
  const out = new Map();
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const v = cells[value];
    out.set(cells[area], v === "" || v == null ? null : Number(v));
  }
  return out;
}

/**
 * The page rows. `kept` maps CSD code → slug from an earlier csd.json, so a
 * published slug never changes.
 */
export function buildTowns({ csds, divisions, population, kept = new Map() }) {
  const towns = [];
  const counties = new Map();
  const skipped = {};
  const unknown = [];
  for (const [dguid, c] of csds) {
    const uid = dguid.slice(-7);
    const provinceCode = PROVINCE_BY_PRUID[uid.slice(0, 2)];
    const type = typeFromDescription(c.desc.en ?? "", " [Census subdivision]");
    const typeFrRaw = typeFromDescription(c.desc.fr ?? "", " [Subdivision de recensement]");
    if (!provinceCode || !type) throw new Error(`unreadable CSD ${dguid}: ${c.desc.en}`);
    const decision = csdDecision(type, provinceCode);
    const pop = population.get(dguid) ?? null;
    if (decision === "exclude") {
      skipped[type] = (skipped[type] ?? 0) + 1;
      continue;
    }
    if (decision === "unknown") {
      unknown.push(`${uid} ${c.desc.en}`);
      continue;
    }
    if (decision === "merge-county") {
      const county = countyOfSubdivision(c.name.en);
      if (!county) throw new Error(`county subdivision without "Subd.": ${c.desc.en}`);
      const cd = uid.slice(0, 4);
      const key = `${cd}|${county}`;
      const row = counties.get(key) ?? { id: cd, name: county, type: COUNTY_MUNICIPALITY, typeFr: null, provinceCode, population: 0, cd };
      row.population += pop ?? 0;
      counties.set(key, row);
      continue;
    }
    towns.push({
      id: uid,
      name: c.name.en,
      type,
      // StatCan's French status when it differs (an official French name, e.g. "Ville" d'Ottawa).
      typeFr: typeFrRaw && typeFrRaw !== type ? typeFrRaw : null,
      provinceCode,
      population: pop,
      cd: uid.slice(0, 4),
    });
  }
  if (unknown.length) throw new Error(`CSD types with no rule in src/lib/towns/names.ts:\n${unknown.join("\n")}`);
  towns.push(...counties.values());

  // Slugs: kept ones first, then new ones; a clash (same formal name in one
  // province) adds the census division's name to every clashing place.
  const used = new Set();
  for (const t of towns) {
    const k = kept.get(t.id);
    if (k) {
      t.slug = k;
      used.add(`${t.provinceCode}/${k}`);
    }
  }
  const fresh = towns.filter((t) => !t.slug);
  const groups = new Map();
  for (const t of fresh) {
    const key = `${t.provinceCode}/${baseTownSlug(t)}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  for (const [key, group] of groups) {
    const base = key.split("/")[1];
    const clash = group.length > 1 || used.has(key);
    for (const t of group) {
      const cdName = divisions.get(`2021A0003${t.cd}`)?.name.en ?? "";
      let slug = clash ? `${base}-${townSlugify(cdName)}`.replace(/-+$/, "") : base;
      if (used.has(`${t.provinceCode}/${slug}`)) slug = `${base}-${t.id}`;
      t.slug = slug;
      used.add(`${t.provinceCode}/${slug}`);
    }
  }
  towns.sort((a, b) => a.provinceCode.localeCompare(b.provinceCode) || a.slug.localeCompare(b.slug));
  return { towns, skipped };
}

/** Compact JSON: a type table plus one array per place. */
export function toDataset(towns) {
  const typeKeys = [];
  const typeIndex = new Map();
  const idx = (t) => {
    const k = `${t.type}|${t.typeFr ?? ""}`;
    if (!typeIndex.has(k)) {
      typeIndex.set(k, typeKeys.length);
      typeKeys.push([t.type, t.typeFr ?? null]);
    }
    return typeIndex.get(k);
  };
  const rows = towns.map((t) => [t.id, t.name, idx(t), t.provinceCode, t.population, t.slug]);
  return { v: 1, census: 2021, source: SOURCE, columns: ["id", "name", "type", "province", "population", "slug"], types: typeKeys, rows };
}

async function load(arg, url) {
  if (arg) return readFileSync(arg, "utf8");
  const res = await fetch(url, url.includes("/data/") ? { headers: { Accept: "application/vnd.sdmx.data+csv;version=1.0.0" } } : {});
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function argOf(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const structure = await load(argOf("structure"), SOURCE.urls.structure);
  const pop = await load(argOf("population"), SOURCE.urls.population);
  const div = await load(argOf("divisions"), SOURCE.urls.divisions);
  const csds = parseCodelist(structure, "CL_GEO_CSD");
  const divisions = parseCodelist(div, "CL_GEO_CD");
  const kept = new Map();
  if (existsSync(OUT)) for (const r of JSON.parse(readFileSync(OUT, "utf8")).rows) kept.set(r[0], r[5]);
  const { towns, skipped } = buildTowns({ csds, divisions, population: parsePopulation(pop), kept });
  writeFileSync(OUT, `${JSON.stringify(toDataset(towns))}\n`);
  const byProv = {};
  for (const t of towns) byProv[t.provinceCode] = (byProv[t.provinceCode] ?? 0) + 1;
  console.log(`towns: ${towns.length} municipalities from ${csds.size} census subdivisions -> ${OUT}`);
  console.log("by province:", JSON.stringify(byProv));
  console.log("skipped (no page):", JSON.stringify(skipped));
}
