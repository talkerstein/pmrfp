import { describe, expect, it } from "vitest";
import { classifyOntn, ontnToRfpInsert, parseOntnList, torontoDate } from "./ontario-northland";
import { FVRD, SAANICH, bcTableToRfpInsert, classifyBcTableRow, parseBcTenderTable } from "./bc-tenders-table";
import { classifySk, parseSkSearch, skResultCount, skSearchUrl, skToRfpInsert } from "./sasktenders";
import { classifyLocalTitle, monthDayYear, urlRef } from "./local-html";
import { classifyPlap, parsePlapList, plapClosingDate, plapPostBody, plapToRfpInsert } from "./portage-la-prairie";
import { publicTenderSource } from "./sources";

const today = "2026-10-15";

describe("local-html helpers", () => {
  it("reads month-day-year dates", () => {
    expect(monthDayYear("Nov 05, 2026")).toBe("2026-11-05");
    expect(monthDayYear("November 5, 2026 at 2:00 PM")).toBe("2026-11-05");
    expect(monthDayYear("Sept. 3 2026")).toBe("2026-09-03");
    expect(monthDayYear("TBD")).toBeNull();
  });

  it("makes a stable 12-hex reference from the notice URL", () => {
    const a = urlRef("https://www.fvrd.ca/EN/main/government/tenders-rfps/x.html");
    expect(a).toMatch(/^[a-f0-9]{12}$/);
    expect(urlRef("https://www.fvrd.ca/EN/main/government/tenders-rfps/x.html")).toBe(a);
  });

  it("keeps building work and drops supplies, studies, civil and closed calls", () => {
    expect(classifyLocalTitle("LLM27004 Air Handling Unit Replacement at Kilburn Hall", "2026-11-02", today)).toEqual(["hvac"]);
    expect(classifyLocalTitle("Exterior Stair Replacement & Repairs - 2300 Angus Street, Regina SK", "2026-10-23", today)).toEqual(["general-contracting"]);
    expect(classifyLocalTitle("Dan Sharrers Aquatic Centre Pool Filtration Replacement", "2026-10-16", today)).toEqual(["plumbing"]);
    expect(classifyLocalTitle("RFSO Janitorial Cleaning Supplies", "2026-11-05", today)).toEqual([]);
    expect(classifyLocalTitle("Roofing Consultant Services", "2026-10-30", today)).toEqual([]);
    expect(classifyLocalTitle("Design Services for the La Ronge Health Centre Emergency Department Renovation", "2026-11-06", today)).toEqual([]);
    expect(classifyLocalTitle("Design and Construction Services for the Brett Sewer Lift Station & Force Main Upgrades", "2026-10-29", today)).toEqual([]);
    expect(classifyLocalTitle("Roadwork-Construction of Short Span Bridge on HWY 35 over Barrier River", "2026-10-27", today)).toEqual([]);
    expect(classifyLocalTitle("Purchase of Three (3) Rough Terrain Forklifts", "2026-10-19", today)).toEqual([]);
    expect(classifyLocalTitle("Network Access Control", "2026-10-16", today)).toEqual([]);
    expect(classifyLocalTitle("Granular De-Icing Material", "2026-11-03", today)).toEqual([]);
    // Standing arrangements with placeholder dates years out.
    expect(classifyLocalTitle("Electrical Maintenance and Repairs", "2030-01-31", today)).toEqual([]);
    expect(classifyLocalTitle("Electrical Maintenance and Repairs", "2027-05-03", today)).toEqual(["electrical"]);
    expect(classifyLocalTitle("Laird School Roof", "2026-10-14", today)).toEqual([]);
    expect(classifyLocalTitle("Laird School Roof", null, today)).toEqual([]);
  });
});

const ontnTeaser = (href: string, title: string, ref: string, posted: string, closing: string) =>
  `<a class="sales-tenders-requests is-promoted teaser list-group-item" href="${href}">
    <h2 class="list-group-item-heading">
<span>${title}</span>
</h2>
  <div class="list-group-item-text">
  <div class="field field--name-field-reference field--type-string field--label-inline">
    <div class="field--label">Reference #</div>
              <div class="field--item">${ref}</div>
          </div>
  <div class="field field--name-field-posting-date field--type-datetime field--label-inline">
    <div class="field--label">Posting Date</div>
              <div class="field--item"><time datetime="${posted}">October 6, 2026</time>
</div>
          </div>
  <div class="field field--name-field-closing-date field--type-datetime field--label-inline">
    <div class="field--label">Closing Date</div>
              <div class="field--item"><time datetime="${closing}">November 5, 2026 at 2:00 PM</time>
</div>
          </div>
  </div>
</a>`;

describe("Ontario Northland", () => {
  const page =
    `<div class="list-group has-icon">` +
    ontnTeaser("/en/company/north-bay-station-backup-generator", "North Bay Station Backup Generator Project", "RFP 2026 089", "2026-10-06T12:00:00Z", "2026-11-05T19:00:00Z") +
    ontnTeaser("/en/company/property-maintenance-services", "Property Maintenance Services for Northlander Train Shelters &ndash; South, ON", "RFQ 2026 088", "2026-09-17T12:00:00Z", "2026-10-19T19:00:00Z") +
    ontnTeaser("/en/company/purchase-three-3-rough-terrain-forklifts", "Purchase of Three (3) Rough Terrain Forklifts", "RFQ 2026 058", "2026-09-11T12:00:00Z", "2026-10-19T19:00:00Z") +
    ontnTeaser("/en/company/driveway-relocation-crossing-closure", "Driveway Relocation and Crossing Closure", "RFP 2026 075", "2026-10-01T12:00:00Z", "2026-10-16T19:00:00Z") +
    `</div>`;

  it("parses each teaser with Toronto-time dates", () => {
    const list = parseOntnList(page);
    expect(list).toHaveLength(4);
    expect(list[0]).toEqual({
      url: "https://www.ontarionorthland.ca/en/company/north-bay-station-backup-generator",
      title: "North Bay Station Backup Generator Project",
      reference: "RFP 2026 089",
      posted: "2026-10-06",
      closing: "2026-11-05",
    });
    expect(list[1].title).toBe("Property Maintenance Services for Northlander Train Shelters – South, ON");
    // 02:00 UTC is still the previous evening in Toronto.
    expect(torontoDate("2026-11-06T02:00:00Z")).toBe("2026-11-05");
  });

  it("keeps the generator and shelter maintenance, drops forklifts and the crossing", () => {
    expect(parseOntnList(page).map((n) => classifyOntn(n, today))).toEqual([["electrical"], ["property-maintenance"], [], []]);
  });

  it("maps to an Ontario rfp row that links to the official notice", () => {
    const row = ontnToRfpInsert(parseOntnList(page)[0], today)!;
    expect(row.source_url).toBe("https://www.ontarionorthland.ca/en/company/north-bay-station-backup-generator");
    expect(row.slug).toMatch(/^north-bay-station-backup-generator-project-ontn-[a-f0-9]{12}$/);
    expect(row.province).toBe("Ontario");
    expect(row.deadline).toBe("2026-11-05");
    expect(row.contact_email).toBe("vendorservices@ontarionorthland.ca");
    expect(row.published_at).toBe("2026-10-06T00:00:00Z");
    expect(publicTenderSource(row.slug).key).toBe("ontario-northland");
  });
});

const bcRow = (href: string, title: string, number: string, posted: string, closing: string, status = "Open") =>
  `<tr>
     <td class="opportunities-title tenders-title"><a href="${href}" title="${title}"  >${title} </a></td>
     <td class="opportunities-number tenders-number">
       ${number}
     </td>
     <td class="opportunities-posted tenders-posted" data-sort-value="${posted}">
       Oct 9, 2026 <span class="time">1:30pm</span>
     </td>
     <td class="opportunities-closing tenders-closing" data-sort-value="${closing}">
       Nov 3, 2026 <span class="time">3:00pm</span>
     </td>
     <td class="opportunities-status tenders-status open">${status}</td>
     <td class="opportunities-awarded tenders-awarded">--</td>
   </tr>`;

describe("BC tenders-table sites (Saanich, FVRD)", () => {
  const table = (rows: string) =>
    `<table class="table_border table_sortable opportunities-table tenders-table"><thead><tr><th>Title</th></tr></thead><tbody>${rows}</tbody></table>`;
  const saanich = table(
    bcRow("/EN/main/business/selling-to-saanich/bid-opportunities/steam-room-renovation-gordon-head-recreation-centre.html", "Steam Room Renovation - Gordon Head Recreation Centre", "RFQ 26-215", "20261009013000", "20261103030000") +
      bcRow("/EN/main/business/selling-to-saanich/bid-opportunities/supply-and-delivery-of-storage-tanks-and-propane.html", "Supply and Delivery of Storage Tanks and Propane", "RFQ 26-214", "20261005024500", "20261022030000") +
      bcRow("/EN/main/business/selling-to-saanich/bid-opportunities/old-roof.html", "Fire Hall Roof Replacement", "RFQ 26-101", "20260601010000", "20260701030000", "Open") +
      bcRow("/EN/main/business/selling-to-saanich/bid-opportunities/awarded-roof.html", "Library Roof Replacement", "RFQ 26-180", "20260901010000", "20261120030000", "Awarded"),
  );

  it("parses rows with local dates from data-sort-value", () => {
    const rows = parseBcTenderTable(saanich, SAANICH);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      url: "https://www.saanich.ca/EN/main/business/selling-to-saanich/bid-opportunities/steam-room-renovation-gordon-head-recreation-centre.html",
      title: "Steam Room Renovation - Gordon Head Recreation Centre",
      number: "RFQ 26-215",
      posted: "2026-10-09",
      closing: "2026-11-03",
      status: "Open",
    });
  });

  it("filters on the closing date, not the stale 'Open' status, and skips awarded rows", () => {
    expect(parseBcTenderTable(saanich, SAANICH).map((r) => classifyBcTableRow(r, today))).toEqual([["general-contracting"], [], [], []]);
  });

  it("maps Saanich and FVRD rows to BC rfp rows with their own markers", () => {
    const s = bcTableToRfpInsert(parseBcTenderTable(saanich, SAANICH)[0], SAANICH, today)!;
    expect(s.slug).toMatch(/-saan-[a-f0-9]{12}$/);
    expect(s.province).toBe("British Columbia");
    expect(s.contact_email).toBe("purchase@saanich.ca");
    expect(publicTenderSource(s.slug).key).toBe("saanich");

    const fvrd = table(
      bcRow("/EN/main/government/tenders-rfps/ventilation-installation-at-boston-bar-fire-hall-1.html", "Ventilation Installation at Boston Bar Fire Hall 1 ", "RFP-26028", "20261008023000", "20261028010000"),
    );
    const [r] = parseBcTenderTable(fvrd, FVRD);
    expect(classifyBcTableRow(r, today)).toEqual(["hvac"]);
    const f = bcTableToRfpInsert(r, FVRD, today)!;
    expect(f.source_url).toBe("https://www.fvrd.ca/EN/main/government/tenders-rfps/ventilation-installation-at-boston-bar-fire-hall-1.html");
    expect(f.contact_email).toBeNull();
    expect(publicTenderSource(f.slug).key).toBe("fvrd");
  });

  it("ignores rows that link off the buyer's own site", () => {
    const off = table(bcRow("https://www.bcbid.gov.bc.ca/x", "Roof Replacement", "X", "20261001000000", "20261101000000"));
    expect(parseBcTenderTable(off, SAANICH)).toEqual([]);
  });
});

const skBody = (id: string, title: string, org: string, number: string, opens: string, closes: string, email = "stephen.bellacera@pvsd.ca") =>
  `<tbody x-data="{ myId: '${id}' }" class="divide-y divide-gray-200">
     <tr class="bg-white align-top" @click="openId = (openId === myId ? null : myId)">
       <td class="w-14 px-4 py-4 align-top"><button type="button"><span aria-hidden="true">+</span></button></td>
       <td class="w-1/4 px-4 py-4 align-top break-words"><div class="font-semibold text-sask-green-700">${title}</div></td>
       <td class="w-1/4 px-4 py-4 align-top break-words">${org}</td>
       <td class="w-[15%] px-4 py-4 align-top break-words">${number}</td>
       <td class="w-[13%] px-4 py-4 align-top"><div>${opens}</div><div class="text-sm text-gray-500">4:00 PM CST</div></td>
       <td class="w-[13%] px-4 py-4 align-top "><div>${closes}</div><div class="text-sm text-gray-500">2:00 PM CST</div></td>
       <td class="w-[9%] px-4 py-4 align-top font-semibold text-gray-800 break-words">Open</td>
     </tr>
     <tr x-show="openId === myId" x-cloak class="bg-white border-t border-gray-200"><td colspan="7">
       <section><h3>Synopsis:</h3><div class="prose prose-sm max-w-none"><p>The Division invites tenders to replace the roof &amp; fall protection at the school.</p></div></section>
       <dl><div class="flex gap-1"><dt class="font-semibold text-gray-900 whitespace-nowrap">Competition Type:</dt>
           <dd>Tender</dd></div></dl>
       <button type="button" data-competition-number="${number}" data-contact-name="Stephen Bellacera" data-contact-email="${email}" data-contact-phone="" onclick="return openQuestionModal(this);"></button>
     </td></tr>
   </tbody>`;

describe("SaskTenders", () => {
  const page =
    `<p class="text-base font-semibold">Your search returned 242 results</p><table>` +
    skBody("7f3c2a10-0bce-4457-8efb-8694aa3adf17", "St. Pascal Roof Replacement &amp; Fall Protection", "Northern Lights School Division No. 113", "NLSD-26-04", "Oct 08, 2026", "Nov 10, 2026") +
    skBody("7689600a-0bce-4457-8efb-8694aa3adf17", "RFSO Janitorial Cleaning Supplies", "Prairie Valley School Division No. 208", "765-369", "Oct 15, 2026", "Nov 05, 2026") +
    skBody("0108960a-ecff-4700-8488-5bb6957c3393", "Tender For Purchase of Property - 29 Phelps Drive - Old Shop", "Rural Municipality of Prince Albert No. 461", "RM-1", "Oct 01, 2026", "Oct 29, 2026", "not-an-email") +
    `</table>`;

  it("reads the result count and the desktop table rows", () => {
    expect(skResultCount(page)).toBe(242);
    const [roof] = parseSkSearch(page);
    expect(parseSkSearch(page)).toHaveLength(3);
    expect(roof).toMatchObject({
      id: "7f3c2a10-0bce-4457-8efb-8694aa3adf17",
      title: "St. Pascal Roof Replacement & Fall Protection",
      organization: "Northern Lights School Division No. 113",
      number: "NLSD-26-04",
      opens: "2026-10-08",
      closes: "2026-11-10",
      status: "Open",
      type: "Tender",
      contactName: "Stephen Bellacera",
      contactEmail: "stephen.bellacera@pvsd.ca",
    });
    expect(roof.synopsis).toContain("replace the roof & fall protection");
    expect(parseSkSearch(page)[2].contactEmail).toBe("");
    expect(skSearchUrl(2)).toContain("pageNumber=2&pageSize=100");
  });

  it("keeps the roof, drops supplies and property sales", () => {
    expect(parseSkSearch(page).map((c) => classifySk(c, today))).toEqual([["roofing"], [], []]);
  });

  it("maps to a Saskatchewan rfp row that links to the public print page", () => {
    const row = skToRfpInsert(parseSkSearch(page)[0], today)!;
    expect(row.source_url).toBe("https://www.sasktenders.ca/Competitions/Print?id=7f3c2a10-0bce-4457-8efb-8694aa3adf17");
    expect(row.slug).toMatch(/-sktn-7f3c2a100bce44578efb8694aa3adf17$/);
    expect(row.province).toBe("Saskatchewan");
    expect(row.summary).toMatch(/^Saskatchewan\. Northern Lights School Division No\. 113: /);
    expect(row.published_at).toBe("2026-10-08T00:00:00Z");
    expect(publicTenderSource(row.slug).key).toBe("sasktenders");
  });
});

const plapItem = (slug: string, title: string, desc: string, date: string) =>
  `<li class="gs-feed-list-item items-1 item item_text-right text-left  divider-lines">
     <div class="inner "><div class="gs-feed-list-content info  "><div class="gs-feed-list-meta text ">
       <a href="/news/posts/${slug}/" title="Click to open ${title}"
          class="gs-feed-list-title ">${title}</a>
       <span class="gs-feed-list-description"><p>${desc}</p></span>
       <div class="gs-feed-list-author-date"><span class="gs-feed-list-date">${date}</span><br /></div>
     </div></div></div>
   </li>`;

describe("City of Portage la Prairie", () => {
  const list =
    `<ul class="gs-feed-list-news">` +
    plapItem("tender-for-the-supply-and-installation-of-one-back-up-generator", "Tender for the Supply and Installation of One Back Up Generator", "Submissions are invited for Tender 26 OPS 035 – Tender for the Supply and Installation of One Back Up Generator.", "Oct 06, 2026") +
    plapItem("tender-for-the-removal-of-dutch-elm-diseased-trees", "Tender for the Removal of Dutch Elm Diseased Trees", "Submissions are invited for Tender 26 OPS 034 - Removal of Dutch Elm Diseased Trees", "Oct 01, 2026") +
    `</ul>`;
  const post = `<div class="text base-text " data-os-animation="fadeIn" data-os-animation-delay="0s">
      <p>Submissions are invited for Tender 26 OPS 035 – Tender for the Supply and Installation of One Back Up Generator. </p>
      <p>Sealed bids must be received at the Operations Building, 495 11th St NW, Portage la Prairie, MB, R1N 4B3, on or before 2:00 p.m. local time on Thursday, October 29, 2026.  Emailed submissions must be submitted as a PDF.</p>
    </div>`;

  it("parses the list and reads the closing date from the post body", () => {
    const items = parsePlapList(list);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      url: "https://www.city-plap.com/news/posts/tender-for-the-supply-and-installation-of-one-back-up-generator/",
      title: "Tender for the Supply and Installation of One Back Up Generator",
      posted: "2026-10-06",
    });
    const body = plapPostBody(post);
    expect(body).toContain("on or before 2:00 p.m.");
    expect(plapClosingDate(body)).toBe("2026-10-29");
    expect(plapClosingDate("Closing date: November 3, 2026 at 2 pm")).toBe("2026-11-03");
    expect(plapClosingDate("Call the office for details.")).toBeNull();
  });

  it("classifies and maps to a Manitoba rfp row", () => {
    const [gen, trees] = parsePlapList(list);
    const g = { ...gen, body: plapPostBody(post), closing: "2026-10-29" };
    expect(classifyPlap(g, today)).toEqual(["electrical"]);
    expect(classifyPlap({ ...trees, body: "", closing: "2026-11-03" }, today)).toEqual(["landscaping"]);
    expect(classifyPlap({ ...trees, body: "", closing: null }, today)).toEqual([]);
    const row = plapToRfpInsert(g, today)!;
    expect(row.slug).toMatch(/-plap-[a-f0-9]{12}$/);
    expect(row.province).toBe("Manitoba");
    expect(row.source_notes).toContain("Tender 26 OPS 035");
    expect(row.contact_email).toBe("tenders@city-plap.com");
    expect(publicTenderSource(row.slug).key).toBe("portage-la-prairie");
  });
});

describe("new markers never claim another source's slug", () => {
  it("title words that look like the new markers", () => {
    expect(publicTenderSource("ontn-saan-roof-cb-cw2466670").key).toBe("canadabuys");
    expect(publicTenderSource("fvrd-sktn-hvac-qc-ao-21243").key).toBe("seao");
    expect(publicTenderSource("sktn-roofing-scbo-69395").key).toBe("scbo");
    // A free-text SEAO ref after an earlier marker loses to the real marker at the end.
    expect(publicTenderSource("travaux-qc-ao-1-fvrd-0123456789ab").key).toBe("fvrd");
    // Wrong ref length is not a match.
    expect(publicTenderSource("roof-ontn-0123456789").key).toBe("canadabuys");
  });
});
