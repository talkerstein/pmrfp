import { describe, expect, it } from "vitest";
import {
  classifyUnc,
  ncEvpDuplicate,
  parseUncDetail,
  parseUncList,
  uncDate,
  uncDetailUrl,
  uncSystemSource,
  uncToRfpInsert,
  type UncBid,
} from "@/lib/tenders/unc-system";
import { UNC_SYSTEM_ATTRIBUTION } from "@/lib/tenders/us-state-sources";
import { publicTenderSource } from "@/lib/tenders/sources";
import { robotsAllows } from "@/lib/tenders/city-list";
import { creditFor } from "@/lib/data-credits";

const TODAY = "2026-10-28";

const row = (campus: string, code: string, id: string, project: string, posted: string, close: string, closeLabel = "Bid Date") =>
  `<tr>
	<td headers="University">${campus}</td>
	<td headers="Project">
		<a href='/apps/finance/vendors/opportunities.htm?mode=view&code=${code}&id=${id}'
		onClick="activateLightBox(this.href,true); return false;">${project}</a>
	</td>
	<td headers="Initial Posting" align='center'>${posted}</td>
	<td headers="${closeLabel}" align='center'>${close}</td>
</tr>`;

const LIST = `<html><body>
<h4>Designer Solicitations (1)</h4><table><tbody>
${row("NC State University", "des_solicit", "148026", "Engineering Building II Roof Replacement", "10/06/26", "10/23/26", "Closing")}
</tbody></table>
<h4>Construction Bids (3)</h4><table><tbody>
${row("NC A&amp;T University", "bid_solicit", "148021", "Television Studio Renovation", "09/30/26", "10/29/26")}
${row("East Carolina University", "bid_solicit", "148043", "Parking Lot RS-12 Resurfacing and Safety Improvements", "10/01/26", "11/05/26")}
${row("UNC - Chapel Hill Academic Affairs", "bid_solicit", "148001", "Old Closed Thing", "08/01/26", "09/01/26")}
</tbody></table>
<h4>Prequalified (1)</h4><table><tbody>
${row("NC State University", "bidpre_solicit", "148044", "Roof Repairs Phase 3 &#8211; College of Veterinary Medicine Main Building", "10/16/26", "11/17/26", "Due Date")}
</tbody></table>
<h4>Design-Build (1)</h4><table><tbody>
${row("UNC - Chapel Hill Academic Affairs", "db_risk", "148036", "Frank Porter Graham Student Union - Solar Array Expansion", "10/09/26", "11/03/26", "Closing")}
</tbody></table>
<h4>Public meetings (1)</h4><table><tbody>
${row("NC Central University", "pub_meeting", "148027", "Pre-solicitation meeting", "10/01/26", "10/30/26", "Closing")}
</tbody></table>
</body></html>`;

const field = (key: string, label: string, value: string) =>
  `<tr id='df.fin_ads.${key}'  class='cms-df-text-type'><td class='df_spacer'>&nbsp;</td><th scope='row' class='df_field_heading' valign='top' colspan='1'><label>${label}</label></th><td class='df_field_icons' valign='top'>&nbsp;</td><td class='df_field' headers='h_${key}' valign='top'>${value}</td><td>&nbsp;</td></tr>`;

const DETAIL = `<table>${[
  field("inst_name", "Institution", "UNC - Chapel Hill Academic Affairs"),
  field("proj_name", "Project Name", "Frank Porter Graham Student Union - Solar Array Expansion"),
  field("proj_manager", "Project Manager", "Someone Named"),
  field("contact_email", "Contact Email", "someone@unc.edu"),
  field("pre_bid_date", "Pre-Proposal Date", "10/15/2026"),
  field("pre_bid_time", "Pre-Proposal Time", "1:00 pm"),
  field("pre_loc", "Pre-proposal Location", "Zoom - Meeting ID 976"),
  field("close_date", "Closing Date", "11/03/2026"),
  field("proj_budget", "Project Budget", "$1,200,000"),
  field("proj_desc", "Project Description", "<div>One-Two Sentences The Student Union serves as an active hub. The building houses a 20 kW photovoltaic array.</div>"),
  field("submit_to", "Submit To", "UNC-Chapel Hill 103 Airport Drive"),
].join("")}</table>`;

const bid = (over: Partial<UncBid> = {}): UncBid => ({
  id: "148021",
  code: "bid_solicit",
  campus: "NC A&T University",
  project: "Television Studio Renovation",
  posted: "2026-09-30",
  closing: "2026-10-29",
  ...over,
});

describe("UNC System list page", () => {
  it("reads only the contractor categories, with campus, dates and ids", () => {
    const bids = parseUncList(LIST);
    expect(bids.map((b) => [b.id, b.code])).toEqual([
      ["148021", "bid_solicit"],
      ["148043", "bid_solicit"],
      ["148001", "bid_solicit"],
      ["148044", "bidpre_solicit"],
      ["148036", "db_risk"],
    ]);
    expect(bids[0]).toEqual({ id: "148021", code: "bid_solicit", campus: "NC A&T University", project: "Television Studio Renovation", posted: "2026-09-30", closing: "2026-10-29" });
    expect(bids[3].closing).toBe("2026-11-17");
    expect(bids[3].project).toBe("Roof Repairs Phase 3 – College of Veterinary Medicine Main Building");
    expect(parseUncList("<p>nothing</p>")).toEqual([]);
  });

  it("reads MM/DD/YY and MM/DD/YYYY dates", () => {
    expect(uncDate("10/29/26")).toBe("2026-10-29");
    expect(uncDate("10/29/2026 (Date Bids Will Be Opened)")).toBe("2026-10-29");
    expect(uncDate("soon")).toBeNull();
  });
});

describe("UNC System detail page", () => {
  it("reads the label table and keeps description, budget and dates", () => {
    const d = parseUncDetail(DETAIL);
    expect(d.get("proj_budget")).toBe("$1,200,000");
    expect(d.get("pre_loc")).toBe("Zoom - Meeting ID 976");
    const row = uncToRfpInsert(bid({ id: "148036", code: "db_risk", campus: "UNC - Chapel Hill Academic Affairs", project: "Frank Porter Graham Student Union - Solar Array Expansion", closing: "2026-11-03" }), d, TODAY)!;
    expect(row.scope).toContain("Project budget: $1,200,000");
    expect(row.scope).toContain("Pre-bid / pre-proposal: 10/15/2026 1:00 pm (Zoom - Meeting ID 976)");
    expect(row.scope).toContain("The Student Union serves as an active hub.");
    expect(row.scope).not.toMatch(/One-Two Sentences/i);
    expect(row.summary).toContain("Budget $1,200,000.");
    // Names and emails of project managers stay on the official notice.
    expect(JSON.stringify(row)).not.toMatch(/someone@unc\.edu|Someone Named/);
    expect(row.contact_email).toBeNull();
  });

  it("treats a budget of None as no budget", () => {
    const d = parseUncDetail(`<table>${field("proj_budget", "Project Budget", "None")}${field("proj_desc", "Project Description", "Renovate the studio and replace the lighting grid.")}</table>`);
    const row = uncToRfpInsert(bid(), d, TODAY)!;
    expect(row.scope).not.toMatch(/budget/i);
  });
});

describe("UNC System listing", () => {
  it("maps a bid to a credited public listing that links to the official notice", () => {
    const row = uncToRfpInsert(bid(), null, TODAY)!;
    expect(row.title).toBe("NC A&T University: Television Studio Renovation");
    expect(row.slug).toBe("nc-a-t-university-television-studio-renovation-uncs-148021");
    expect(row.source_url).toBe("https://www.northcarolina.edu/apps/finance/vendors/opportunities.htm?mode=view&id=148021");
    expect(row.source_url).toBe(uncDetailUrl("148021"));
    expect(row.province).toBe("North Carolina");
    expect(row.deadline).toBe("2026-10-29");
    expect(row.status).toBe("published");
    expect(row.source_type).toBe("public_source");
    expect(row.source_notes).toContain(UNC_SYSTEM_ATTRIBUTION);
    expect(row.submission_instructions).toMatch(/does not manage/);
    expect(publicTenderSource(row.slug).key).toBe("unc-system");
    expect(creditFor(UNC_SYSTEM_ATTRIBUTION)?.fr).toMatch(/Caroline du Nord/);
    expect(uncToRfpInsert(bid({ closing: null }), null, TODAY)).toBeNull();
  });

  it("does not collide with other U.S. importers' slug markers", () => {
    for (const s of ["x-ncevp-bbbd9a8151bbf111aaae001dd80d92a5", "x-scbo-69032", "x-lacr-232048"]) {
      expect(publicTenderSource(s).key).not.toBe("unc-system");
    }
  });
});

describe("classifyUnc", () => {
  it("tags trades, falls back to general contracting, drops closed bids", () => {
    expect(classifyUnc(bid({ project: "Roof Repairs Phase 3", closing: "2026-11-17" }), TODAY)).toContain("roofing");
    expect(classifyUnc(bid({ project: "School of Education HVAC and BAS Repairs", closing: "2026-11-17" }), TODAY)).toContain("hvac");
    expect(classifyUnc(bid({ project: "Parking Lot RS-12 Resurfacing and Safety Improvements" }), TODAY)).toContain("concrete-and-asphalt");
    expect(classifyUnc(bid({ project: "New Residence Hall 1 - Full Building Round 1-Package 23a Only" }), TODAY)).toEqual(["general-contracting"]);
    expect(classifyUnc(bid({ closing: "2026-10-27" }), TODAY)).toEqual([]);
    expect(classifyUnc(bid({ code: "des_solicit" }), TODAY)).toEqual([]);
  });
});

describe("dedupe against NC eVP", () => {
  const b = bid({ project: "Television Studio Renovation" });
  it("drops a bid whose project name is in an eVP title", () => {
    expect(ncEvpDuplicate(b, [{ number: "", title: "NC A&T State University - Television Studio Renovation" }])).toBe(true);
    expect(ncEvpDuplicate(b, [{ number: "", title: "Television  Studio  Renovation" }])).toBe(true);
  });
  it("drops a bid that shares a solicitation number", () => {
    const p = bid({ project: "Library Roof 26-1234 Replacement" });
    expect(ncEvpDuplicate(p, [{ number: "ITB 26-1234", title: "Something else entirely" }])).toBe(true);
  });
  it("keeps unrelated bids", () => {
    expect(ncEvpDuplicate(b, [{ number: "26-5555", title: "Janitorial Supplies" }, { number: "", title: "Studio Lighting Fixtures" }])).toBe(false);
    expect(ncEvpDuplicate(bid({ project: "Roof" }), [{ number: "", title: "Roof" }])).toBe(false); // too short to trust
    expect(ncEvpDuplicate(b, [])).toBe(false);
  });
});

describe("robots.txt", () => {
  const ROBOTS = "User-agent: *\nDisallow: /wp-admin/\n\nUser-agent: *\nDisallow: /wp-content/uploads/\n";
  it("allows the opportunities board and detail pages, honours disallows", () => {
    expect(robotsAllows(ROBOTS, "https://www.northcarolina.edu/apps/finance/vendors/opportunities.htm", "pmrfp-tenderfeed")).toBe(true);
    expect(robotsAllows(ROBOTS, uncDetailUrl("1"), "pmrfp-tenderfeed")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /apps/\n", uncDetailUrl("1"), "pmrfp-tenderfeed")).toBe(false);
  });
});

describe("uncSystemSource", () => {
  const evpRow = { id: "x", number: "", title: "NC A&T State University - Television Studio Renovation", description: "", closing: null, posted: null, status: "Open", agency: "" };

  it("collects building bids, drops eVP duplicates and closed bids, and tags the region", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /wp-admin/\n");
      if (u.includes("mode=view")) return new Response(DETAIL);
      return new Response(LIST);
    }) as typeof fetch;
    try {
      const src = uncSystemSource({ gapMs: 0, evp: async () => [evpRow] });
      const found = await src.collect(TODAY);
      expect(found.map((c) => c.insert.source_url.split("id=")[1])).toEqual(["148043", "148044", "148036"]);
      expect(found.every((c) => c.regionSlug === "us-north-carolina")).toBe(true);
      expect(found[1].categories).toContain("roofing");
      const enriched = await src.enrich!(found, { today: TODAY, dry: true });
      expect(enriched).toHaveLength(3);
      expect(enriched[2].insert.scope).toContain("Project budget: $1,200,000");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("skips the whole source when robots.txt disallows the board", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) =>
      String(url).endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /apps/\n") : new Response(LIST)) as typeof fetch;
    try {
      await expect(uncSystemSource({ evp: async () => [] }).collect(TODAY)).rejects.toThrow(/robots\.txt disallows/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
