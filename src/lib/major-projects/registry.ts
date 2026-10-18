/**
 * Every automated major-projects source, by cron group. Canada only.
 *   core      /api/cron/major-projects           Sun 09:26 UTC (PR #138 sources)
 *   funding   /api/cron/major-projects/funding   Sun 09:41 UTC (Québec PQI, Edmonton capital, Manitoba capital plans)
 *   local     /api/cron/major-projects/local     Sun 09:56 UTC (Halifax / Surrey permits, development applications)
 *   corridor  /api/cron/major-projects/corridor  Sun 10:11 UTC (Toronto–Kitchener corridor permits + applications)
 * Infrastructure Canada is upload-only (robots.txt): see UPLOAD_SOURCES.
 */
import { PROJECT_SOURCES, type ProjectSource, type SourceGroup } from "./sources";
import { WAVE2_SOURCES } from "./sources-wave2";
import { CORRIDOR_SOURCES } from "./sources-corridor";

export const ALL_SOURCES: ProjectSource[] = [
  ...PROJECT_SOURCES.map((s) => ({ ...s, group: s.group ?? ("core" as const) })),
  ...WAVE2_SOURCES,
  ...CORRIDOR_SOURCES,
];

export const SOURCE_GROUPS: readonly SourceGroup[] = ["core", "funding", "local", "corridor"];

export function sourcesFor(group: SourceGroup, only?: string | null): ProjectSource[] {
  // ?source=<key> picks one source from any group (manual dry runs).
  return only ? ALL_SOURCES.filter((s) => s.key === only) : ALL_SOURCES.filter((s) => (s.group ?? "core") === group);
}
