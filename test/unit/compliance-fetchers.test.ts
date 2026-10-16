import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CANADABUYS_FEED_KEYS, CanadabuysFetchDisabledError, allowedSources, canadabuysFetch, canadabuysFetchAllowed } from "@/lib/tenders/canadabuys-access";
import { fetchOpenTenders } from "@/lib/tenders/canadabuys";
import { fetchAwards } from "@/lib/tenders/awards";
import { fetchClosedTenderData } from "@/lib/tenders/canadabuys-closed";
import { SEAO_DATASET_PAGE, newestWeekly, resetSeaoPacing, seaoGet, seaoWeeklyUrls } from "@/lib/tenders/seao";
import { savedSeaoFiles } from "@/lib/contract-history/sources/seao-files";
import { buildPayload, fileStem, filesFor, missingFiles, payloadError } from "@/lib/tenders/canadabuys-upload";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  resetSeaoPacing();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("CANADABUYS_DIRECT_FETCH", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("CanadaBuys: no bot download unless the flag is on (robots.txt: User-agent: * / Disallow: /)", () => {
  it("is off by default", () => {
    expect(canadabuysFetchAllowed({})).toBe(false);
    expect(canadabuysFetchAllowed({ CANADABUYS_DIRECT_FETCH: "true" })).toBe(false);
    expect(canadabuysFetchAllowed({ CANADABUYS_DIRECT_FETCH: "1" })).toBe(true);
  });

  it("the open, awards and closed importers refuse without making a request", async () => {
    await expect(fetchOpenTenders()).rejects.toBeInstanceOf(CanadabuysFetchDisabledError);
    await expect(fetchAwards("2026-10-16")).rejects.toBeInstanceOf(CanadabuysFetchDisabledError);
    await expect(fetchClosedTenderData("2026-10-16")).rejects.toBeInstanceOf(CanadabuysFetchDisabledError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("downloads only when CANADABUYS_DIRECT_FETCH=1, and only from canadabuys.canada.ca", async () => {
    vi.stubEnv("CANADABUYS_DIRECT_FETCH", "1");
    fetchMock.mockResolvedValue(new Response("title-titre-eng\nx\n", { status: 200 }));
    await fetchOpenTenders();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).hostname).toBe("canadabuys.canada.ca");
    await expect(canadabuysFetch("https://example.com/x.csv")).rejects.toThrow(/not a CanadaBuys URL/);
  });

  it("the crons leave CanadaBuys feeds out while the flag is off (so their rows aren't archived)", () => {
    const sources = [{ key: "canadabuys" }, { key: "toronto" }, { key: "awards" }, { key: "seao" }, { key: "canadabuys-closed" }, { key: "yukon-closed" }];
    expect(allowedSources(sources, false).map((s) => s.key)).toEqual(["toronto", "seao", "yukon-closed"]);
    expect(allowedSources(sources, true)).toHaveLength(6);
    expect([...CANADABUYS_FEED_KEYS].sort()).toEqual(["awards", "canadabuys", "canadabuys-closed"]);
  });

  it("no source file fetches a CanadaBuys open-data URL except through canadabuysFetch", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk(join(process.cwd(), "src"));
    const offenders = files.filter((p) => {
      const s = readFileSync(p, "utf8");
      if (!/canadabuys\.canada\.ca\/opendata/.test(s) || p.endsWith("canadabuys-access.ts")) return false;
      // Files that only link to the files (admin pages, file lists) never call fetch on them.
      const fetches = /\b(fetch|politeFetch|politeText|politeStream|politeBytes|politeJson)\(/.test(s);
      return fetches && !/canadabuysFetch\(/.test(s);
    });
    expect(offenders).toEqual([]);
  });
});

describe("SEAO / Données Québec: no CKAN /api/, crawl delay respected", () => {
  it("lists weekly files from the dataset page, never the API", async () => {
    const id = "868890cd-7846-4ee5-a8ed-933294f8d346";
    const html = `<a href="https://www.donneesquebec.ca/recherche/dataset/d23b2e02-085d-43e5-9e6e-e1d558ebfdd5/resource/${id}/download/hebdo_20261012_20261018.json">x</a>`;
    fetchMock.mockResolvedValue(new Response(html, { status: 200 }));
    const urls = await seaoWeeklyUrls(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(SEAO_DATASET_PAGE);
    expect(urls[0]).toMatch(/\/download\/hebdo_20261012_20261018\.json$/);
    for (const u of urls) {
      expect(u).not.toMatch(/\/api\//);
      expect(u).not.toContain("?");
    }
    // A named User-Agent on every request.
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ "User-Agent": expect.stringMatching(/^PMRFP-/) });
  });

  it("falls back to the saved /download/ list when the page is a bot challenge", async () => {
    fetchMock.mockResolvedValue(new Response("<script>challenge</script>", { status: 202 }));
    const urls = await seaoWeeklyUrls(2);
    expect(urls).toEqual(newestWeekly(savedSeaoFiles(), 2));
    expect(urls.every((u) => u.includes("/download/hebdo_"))).toBe(true);
  });

  it("refuses API and query-string URLs outright", async () => {
    await expect(seaoGet("https://www.donneesquebec.ca/recherche/api/3/action/package_show?id=x", "application/json")).rejects.toThrow(/Not an allowed/);
    await expect(seaoGet("https://www.donneesquebec.ca/recherche/dataset/x?y=1", "text/html")).rejects.toThrow(/Not an allowed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits the 10 s crawl delay between two requests", async () => {
    vi.useFakeTimers();
    resetSeaoPacing();
    try {
      fetchMock.mockImplementation(async () => new Response("", { status: 200 }));
      await seaoGet(SEAO_DATASET_PAGE, "text/html");
      const second = seaoGet(SEAO_DATASET_PAGE, "text/html");
      await vi.advanceTimersByTimeAsync(9_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_500);
      await second;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no source file calls the CKAN API on a Québec open-data host", () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) {
          const s = readFileSync(p, "utf8");
          if (/https:\/\/(www\.)?(donneesquebec\.ca|donnees\.montreal\.ca)\/(recherche\/)?api\//.test(s)) hits.push(p);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(hits).toEqual([]);
  });
});

describe("CanadaBuys admin upload payload", () => {
  const today = "2026-10-16";
  it("names the files each feed needs and tolerates browser renames", () => {
    expect(filesFor("open", today).map(fileStem)).toEqual(["opentendernotice-ouvertavisappeloffres"]);
    expect(filesFor("awards", today).map(fileStem)).toEqual(["2026-2027-awardnotice-avisattribution", "2025-2026-awardnotice-avisattribution"]);
    expect(fileStem("C:\\Downloads\\2025-2026-awardNotice-avisAttribution (1).csv")).toBe("2025-2026-awardnotice-avisattribution");
    expect(missingFiles("awards", ["2026-2027-awardNotice-avisAttribution.csv"], today)).toHaveLength(1);
  });

  it("requires every file (a partial upload would archive valid rows)", () => {
    expect(() => buildPayload("awards", [{ name: "2026-2027-awardNotice-avisAttribution.csv", text: "a\n" }], today)).toThrow(/Missing file/);
    expect(payloadError({ kind: "open", files: [], rows: [] }, today)).toMatch(/Missing file/);
    expect(payloadError({ kind: "nope", files: [], rows: [] }, today)).toBe("Unknown kind");
    expect(payloadError({ kind: "open", files: ["openTenderNotice-ouvertAvisAppelOffres.csv"], rows: [{ a: 1 }] }, today)).toMatch(/string records/);
    expect(payloadError({ kind: "open", files: ["openTenderNotice-ouvertAvisAppelOffres.csv"], rows: [] }, today)).toBeNull();
  });

  it("keeps only rows the open-tender import uses, and only its columns", () => {
    const header = ["title-titre-eng", "procurementCategory-categorieApprovisionnement", "tenderClosingDate-appelOffresDateCloture", "noticeURL-URLavis-eng", "extra-fra"].join(",");
    const csv = `${header}\n"Snow removal services at the depot",*SRV,2026-11-30,https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/cb-1-2,ignored\n"Laptops",*GD,2026-11-30,https://canadabuys.canada.ca/x,ignored\n`;
    const p = buildPayload("open", [{ name: "openTenderNotice-ouvertAvisAppelOffres.csv", text: csv }], today);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]["title-titre-eng"]).toBe("Snow removal services at the depot");
    expect(p.rows[0]["extra-fra"]).toBeUndefined();
  });
});
