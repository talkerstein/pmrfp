/**
 * Every automated major-projects source, by cron group. Canada only.
 *   core     /api/cron/major-projects          Sun 09:26 UTC (PR #138 sources)
 *   funding  /api/cron/major-projects/funding  Sun 09:41 UTC (Québec PQI, Edmonton capital, Manitoba capital plans)
 *   local    /api/cron/major-projects/local    Sun 09:56 UTC (Halifax / Surrey permits, development applications)
 * Infrastructure Canada is upload-only (robots.txt): see UPLOAD_SOURCES.
 */
import { PROJECT_SOURCES, type ProjectSource, type SourceGroup } from "./sources";
import { WAVE2_SOURCES } from "./sources-wave2";

export const ALL_SOURCES: ProjectSource[] = [...PROJECT_SOURCES.map((s) => ({ ...s, group: s.group ?? ("core" as const) })), ...WAVE2_SOURCES];

export const SOURCE_GROUPS: readonly SourceGroup[] = ["core", "funding", "local"];

export function sourcesFor(group: SourceGroup, only?: string | null): ProjectSource[] {
  // ?source=<key> picks one source from any group (manual dry runs).
  return only ? ALL_SOURCES.filter((s) => s.key === only) : ALL_SOURCES.filter((s) => (s.group ?? "core") === group);
}
