import { runMajorProjectImport } from "@/lib/major-projects/run";

// Six feeds, fetched one after another (Toronto's filtered permit set is the big one).
export const maxDuration = 300;

/**
 * Weekly major-projects import, core group (Vercel cron, Sundays 09:26 UTC —
 * no other cron uses that slot): BC MPI, Ontario Builds, Toronto / Calgary /
 * Edmonton / Mississauga permits. The wave-2 groups run at 09:41 (funding)
 * and 09:56 (local) from ./[group]. ?dry=1 and ?source=<key> as described in
 * lib/major-projects/run.ts.
 */
export async function GET(request: Request) {
  return runMajorProjectImport(request, "core");
}
