/**
 * Running the city flow inside the daily Canadian municipal cron
 * (/api/cron/canada-local-tenders): each city that may run (citySourceGate)
 * becomes one sync Source.
 *
 * Politeness, per city per run: robots.txt, then ONE read of the list page
 * or feed, as "PMRFP tender indexer", inside a 30 s budget. No detail pages.
 * Redirects are followed only on the buyer's own hosts, so a page that moves
 * to a bid platform is never read. robots.txt that can't be fetched (5xx,
 * timeout) means "don't read today" (RFC 9309); a 4xx means no rules.
 */
import { TENDER_UA } from "./florida-vbs";
import { CITY_SOURCES, type CitySourceConfig } from "./city-sources";
import { cityHosts, cityRowToRfpInsert, citySourceGate, classifyCityRow, parseCityList, robotsAllows } from "./city-list";
import { hostOf, isBlockedUrl, type PermissionRegistry } from "@/lib/buyers/permissions";
import type { Candidate, Source } from "./sync";

export const CITY_BUDGET_MS = 30_000;
const MAX_REDIRECTS = 3;

export type CityFetcher = (cfg: CitySourceConfig, registry: PermissionRegistry, signal: AbortSignal) => Promise<string>;

/** One GET on the buyer's own site; same-site redirects only. */
async function ownSiteGet(url: string, cfg: CitySourceConfig, registry: PermissionRegistry, signal: AbortSignal, accept: string): Promise<Response> {
  const hosts = cityHosts(cfg);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (isBlockedUrl(current, registry) || !hosts.includes(hostOf(current) ?? "")) throw new Error(`refusing to read ${current}: not the buyer's own site`);
    const res = await fetch(current, { cache: "no-store", redirect: "manual", signal, headers: { "User-Agent": TENDER_UA, Accept: accept } });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    current = new URL(location, current).toString();
  }
  throw new Error(`too many redirects reading ${url}`);
}

/** robots.txt, then the list (or feed), once. Throws when robots.txt says no or can't be read. */
export const fetchCityList: CityFetcher = async (cfg, registry, signal) => {
  if (cfg.list.kind === "platform") throw new Error(`${cfg.key}: bids are hosted on ${cfg.list.platform}; nothing is read`);
  const listUrl = cfg.list.url;
  const robotsRes = await ownSiteGet(new URL("/robots.txt", listUrl).toString(), cfg, registry, signal, "text/plain");
  if (robotsRes.status >= 500) throw new Error(`${cfg.key}: robots.txt unavailable (HTTP ${robotsRes.status}); not reading today`);
  const robots = robotsRes.ok ? await robotsRes.text() : null;
  if (!robotsAllows(robots, listUrl)) throw new Error(`${cfg.key}: robots.txt disallows ${listUrl}`);
  const accept = cfg.list.kind === "rss" ? "application/rss+xml,application/xml,text/xml" : "text/html,application/xhtml+xml";
  const res = await ownSiteGet(listUrl, cfg, registry, signal, accept);
  if (!res.ok) throw new Error(`${cfg.key}: list fetch failed: HTTP ${res.status}`);
  return res.text();
};

export interface CityPlan {
  sources: Source[];
  skipped: { key: string; reason: string }[];
}

/**
 * Sync sources for every city that may run today; the rest are listed with
 * the reason (permission, platform-hosted, never-read host). A "no" buyer is
 * never turned into a Source, so nothing is fetched for it.
 */
export function citySyncSources(registry: PermissionRegistry, configs: readonly CitySourceConfig[] = CITY_SOURCES, fetcher: CityFetcher = fetchCityList): CityPlan {
  const plan: CityPlan = { sources: [], skipped: [] };
  for (const cfg of configs) {
    const gate = citySourceGate(cfg, registry);
    if (!gate.run) {
      plan.skipped.push({ key: cfg.key, reason: gate.reason });
      continue;
    }
    plan.sources.push({
      key: cfg.key,
      // Small lists: one match is a valid day; zero means "don't archive".
      minMatchesToArchive: cfg.minMatchesToArchive ?? 1,
      fallbackRegion: "canada",
      collect: async (today) => {
        // Checked again at run time: the registry can't have changed, but the config might be reused.
        const again = citySourceGate(cfg, registry);
        if (!again.run) throw new Error(`${cfg.key}: ${again.reason}`);
        const signal = AbortSignal.timeout(CITY_BUDGET_MS);
        let body: string;
        try {
          body = await fetcher(cfg, registry, signal);
        } catch (err) {
          if (signal.aborted) throw new Error(`${cfg.key} exceeded its ${CITY_BUDGET_MS / 1000}s budget`);
          throw err;
        }
        return parseCityList(body, cfg).flatMap((row): Candidate[] => {
          const categories = classifyCityRow(row, today);
          const insert = categories.length ? cityRowToRfpInsert(row, cfg, today) : null;
          return insert ? [{ insert, categories, regionSlug: cfg.regionSlug }] : [];
        });
      },
    });
  }
  return plan;
}
