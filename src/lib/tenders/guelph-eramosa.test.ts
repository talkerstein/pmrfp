import { describe, expect, it } from "vitest";
import { GETE_LIST_URL, classifyGete, geteToRfpInsert, parseGeteBids } from "./guelph-eramosa";
import { GUELPH_ERAMOSA_ATTRIBUTION } from "./canada-local-sources";
import { publicTenderSource } from "./sources";
import { creditFor } from "@/lib/data-credits";

const TODAY = "2026-10-18";

const page = (rows: string) => `<html><body><article>
<table border=".8" cellpadding="0" cellspacing="0" style="width: 800px;">
  <thead><tr><th scope="col">&nbsp; Bid Documents</th><th scope="col">Bidding Close Date</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p><strong>NOTE: It is the responsibility of bid takers to review this webpage regularly for addendums.</strong></p>
</article></body></html>`;

const row = (href: string, title: string, close: string) =>
  `<tr><td style="text-align: center; width: 400px;"><a href="${href}">${title}</a></td><td style="text-align: center; width: 400px;">${close}</td></tr>`;

describe("Township of Guelph/Eramosa bids (own site)", () => {
  it("reads the Bid Documents / Bidding Close Date table", () => {
    const bids = parseGeteBids(
      page(
        row("/uploads/userfiles/files/GET - ICB - Scope of Work.pdf", "Interim Control By-law Study", "July 27, 2026 at 4:00 p.m.") +
          row("/uploads/userfiles/files/Rockwood Fire Hall Roof.pdf", "Rockwood Fire Hall Roof Replacement", "November 12, 2026 at 2:00 p.m."),
      ),
    );
    expect(bids).toEqual([
      { url: "https://www.get.on.ca/uploads/userfiles/files/GET%20-%20ICB%20-%20Scope%20of%20Work.pdf", title: "Interim Control By-law Study", closing: "2026-07-27", closingText: "July 27, 2026 at 4:00 p.m." },
      { url: "https://www.get.on.ca/uploads/userfiles/files/Rockwood%20Fire%20Hall%20Roof.pdf", title: "Rockwood Fire Hall Roof Replacement", closing: "2026-11-12", closingText: "November 12, 2026 at 2:00 p.m." },
    ]);
    expect(parseGeteBids("<p>No bids right now.</p>")).toEqual([]);
  });

  it("keeps open building work only (closed studies drop out)", () => {
    const [study, roof] = parseGeteBids(
      page(row("/a.pdf", "Interim Control By-law Study", "July 27, 2026 at 4:00 p.m.") + row("/b.pdf", "Rockwood Fire Hall Roof Replacement", "November 12, 2026 at 2:00 p.m.")),
    );
    expect(classifyGete(study, TODAY)).toEqual([]);
    expect(classifyGete(roof, TODAY)).toContain("roofing");
  });

  it("maps a bid to a credited public listing that points at the Township's page", () => {
    const [roof] = parseGeteBids(page(row("/b.pdf", "Rockwood Fire Hall Roof Replacement", "November 12, 2026 at 2:00 p.m.")));
    const insert = geteToRfpInsert(roof, TODAY)!;
    expect(insert.slug).toMatch(/^rockwood-fire-hall-roof-replacement-gete-[a-f0-9]{12}$/);
    expect(insert.deadline).toBe("2026-11-12");
    expect(insert.province).toBe("Ontario");
    expect(insert.source_url).toBe(GETE_LIST_URL);
    expect(insert.source_notes).toContain(GUELPH_ERAMOSA_ATTRIBUTION);
    expect(insert.submission_instructions).toMatch(/not PMRFP/);
    expect(publicTenderSource(insert.slug).key).toBe("guelph-eramosa");
    expect(creditFor(GUELPH_ERAMOSA_ATTRIBUTION)?.fr).toMatch(/Guelph\/Eramosa/);
    expect(geteToRfpInsert({ ...roof, closing: null }, TODAY)).toBeNull();
  });
});
