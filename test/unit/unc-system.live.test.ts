/**
 * Live dry run against northcarolina.edu and evp.nc.gov. Skipped unless
 * UNC_LIVE=1. Reads only; writes nothing anywhere.
 *   UNC_LIVE=1 npx vitest run test/unit/unc-system.live.test.ts
 */
import { describe, it } from "vitest";
import { classifyUnc, fetchUncOpen, ncEvpDuplicate, uncSystemSource } from "@/lib/tenders/unc-system";
import { fetchNcEvpOpen } from "@/lib/tenders/nc-evp";

describe.runIf(process.env.UNC_LIVE === "1")("UNC System live dry run", () => {
  it("prints the parsed rows", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const list = await fetchUncOpen();
    const evp = await fetchNcEvpOpen();
    console.log(`list rows: ${list.length}; open eVP solicitations: ${evp.length}`);
    for (const b of list) {
      console.log(
        `LIST ${b.id} [${b.code}] ${b.campus} | ${b.project} | posted ${b.posted} | closes ${b.closing} | trades ${classifyUnc(b, today).join(",") || "-"} | evpDup ${ncEvpDuplicate(b, evp)}`,
      );
    }
    const src = uncSystemSource({ evp: async () => evp });
    const cands = await src.collect(today);
    const rows = await src.enrich!(cands, { today, dry: true });
    console.log(`importable rows: ${rows.length}`);
    for (const r of rows) {
      console.log("ROW", JSON.stringify({ slug: r.insert.slug, title: r.insert.title, deadline: r.insert.deadline, categories: r.categories, region: r.regionSlug, url: r.insert.source_url, summary: r.insert.summary }));
    }
    console.log("SAMPLE SCOPE\n" + rows[0]?.insert.scope);
  }, 120_000);
});
