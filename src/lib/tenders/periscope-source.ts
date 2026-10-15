/**
 * A Periscope board (./periscope-sites) as a public-tender sync source:
 * collect() reads the open list (CSV export, 2 requests), enrich() reads the
 * detail page of each NEW building-trade bid — capped and paced, so a normal
 * day costs the board a handful of requests.
 */
import type { Candidate, Source } from "./sync";
import type { PeriscopeSite } from "./periscope-sites";
import {
  MAX_DETAILS,
  REQUEST_DELAY_MS,
  classifyPeriscope,
  fetchPeriscopeDetail,
  fetchPeriscopeOpenBids,
  periscopeToRfpInsert,
  sleep,
  type PeriscopeBid,
} from "./periscope";

/** Detail pages a dry run reads — enough to see the text, not a crawl. */
const DRY_DETAILS = 3;

export interface PeriscopeSourceOptions {
  /** Abort signal factory for the list fetch (fresh per run). */
  listSignal?: () => AbortSignal;
  /** Wall-clock budget for the detail pass; unfinished bids wait a day. */
  detailBudgetMs?: number;
  fetchOpen?: typeof fetchPeriscopeOpenBids;
  fetchDetail?: typeof fetchPeriscopeDetail;
  delayMs?: number;
}

export function periscopeSource(site: PeriscopeSite, opts: PeriscopeSourceOptions = {}): Source {
  const fetchOpen = opts.fetchOpen ?? fetchPeriscopeOpenBids;
  const fetchDetail = opts.fetchDetail ?? fetchPeriscopeDetail;
  const delayMs = opts.delayMs ?? REQUEST_DELAY_MS;
  const bySourceUrl = new Map<string, PeriscopeBid>();

  return {
    key: site.key,
    // ~100+ building-trade bids a day on COMMBUYS; far fewer means a bad download.
    minMatchesToArchive: 20,
    fallbackRegion: "united-states",
    collect: async (today) => {
      bySourceUrl.clear();
      const { bids } = await fetchOpen(site, opts.listSignal?.());
      return bids.flatMap((b): Candidate[] => {
        const categories = classifyPeriscope(b, today);
        const insert = categories.length ? periscopeToRfpInsert(site, b, today) : null;
        if (!insert) return [];
        bySourceUrl.set(insert.source_url, b);
        return [{ insert, categories, regionSlug: site.regionSlug }];
      });
    },
    enrich: async (fresh, { today, dry }) => {
      const max = dry ? DRY_DETAILS : MAX_DETAILS;
      const signal = AbortSignal.timeout(opts.detailBudgetMs ?? 200_000);
      // Soonest-closing first: those are the ones a day's wait would hurt.
      const queue = [...fresh].sort((a, b) => (a.insert.deadline ?? "").localeCompare(b.insert.deadline ?? "")).slice(0, max);
      const out: Candidate[] = [];
      for (const c of queue) {
        const bid = bySourceUrl.get(c.insert.source_url);
        if (!bid) continue;
        try {
          await sleep(delayMs, signal);
          const detail = await fetchDetail(site, bid.number, signal);
          out.push({ ...c, insert: periscopeToRfpInsert(site, bid, today, detail) ?? c.insert });
        } catch {
          if (signal.aborted) break;
          out.push(c); // detail page failed: list data is still a valid listing
        }
      }
      // A dry run reports every new bid (a sample of them enriched); a real
      // run inserts only the enriched ones and leaves the rest for tomorrow.
      if (dry) return [...out, ...fresh.filter((c) => !out.some((o) => o.insert.source_url === c.insert.source_url))];
      return out;
    },
  };
}
