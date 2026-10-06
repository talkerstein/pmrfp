import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import {
  aggregateSuppliers,
  buildIndex,
  parseAmount,
  parseCsv,
  rowsFromCsv,
  supplierKey,
  tidySupplierName,
} from "@/lib/data/toronto-awards";

const HEADER =
  "_id,Document Number,RFx (Solicitation) Type,High Level Category,Successful Supplier,Award,Award Authority Obtained Date,Division,Buyer Name,Buyer Email,Buyer Phone Number,Solicitation Document Description,Supplier Address,Wards";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded commas/newlines and CRLF", () => {
    const rows = parseCsv('a,b,c\r\n1,"x, y","say ""hi""\nthere"\r\n2,,\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", 'say "hi"\nthere'],
      ["2", "", ""],
    ]);
  });
  it("strips a BOM and ignores a trailing blank line", () => {
    expect(parseCsv("﻿a,b\n1,2\n\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseAmount", () => {
  it("parses thousands separators and rejects blanks", () => {
    expect(parseAmount("771,931.57")).toBe(771931.57);
    expect(parseAmount("$1,000")).toBe(1000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("n/a")).toBeNull();
    expect(parseAmount("0")).toBeNull();
  });
});

describe("supplier name normalisation", () => {
  it("merges legal-suffix and case variants", () => {
    expect(supplierKey("GUILD ELECTRIC LTD.")).toBe(supplierKey("Guild Electric Limited"));
    expect(supplierKey("Furfari Paving Co. Ltd.")).toBe(supplierKey("FURFARI PAVING CO LTD"));
    expect(supplierKey("Black and McDonald Ltd")).toBe(supplierKey("BLACK & MCDONALD LIMITED"));
    expect(supplierKey("The Hydro Group Inc.")).toBe(supplierKey("Hydro Group Inc"));
    expect(supplierKey("Sanscon Construction")).not.toBe(supplierKey("Sanscon Paving"));
  });
  it("title-cases SHOUTING names but keeps acronyms and mixed case", () => {
    expect(tidySupplierName("SANSCON CONSTRUCTION LIMITED")).toBe("Sanscon Construction Limited");
    expect(tidySupplierName("PAVE-TAR CONSTRUCTION LTD.")).toBe("Pave-Tar Construction Ltd.");
    expect(tidySupplierName("GFL ENVIRONMENTAL INC")).toBe("GFL Environmental Inc.");
    expect(tidySupplierName("BLACK & MCDONALD LTD.")).toBe("Black & McDonald Ltd.");
    expect(tidySupplierName("Compugen Inc.")).toBe("Compugen Inc.");
  });
});

describe("aggregateSuppliers", () => {
  const csv = [
    HEADER,
    '1,100,RFQ,Construction Services,GUILD ELECTRIC LTD.,"120,000.00",2024-05-01,Transportation Services,Jane Buyer,j@toronto.ca,416,"Traffic signal maintenance",,Ward 1 Etobicoke North',
    '2,101,RFT,Construction Services,Guild Electric Limited,80000,2025-02-03,Toronto Water,Jane Buyer,j@toronto.ca,416,"Pumping station electrical",,',
    "3,102,RFQ,Goods & Services,Tiny Supplies Inc.,900,2023-01-01,Parks,,,,Pens,,",
    "4,103,RFQ,Goods and Services,John Smith,5000,2023-01-01,Parks,,,,Consulting,,",
    "5,104,RFP,Professional Services,Big Consult Corp,400000,2022-06-30,City Planning,,,,Study,,",
  ].join("\n");
  const rows = rowsFromCsv(csv);
  const suppliers = aggregateSuppliers(rows);

  it("drops buyer contact fields and parses rows", () => {
    expect(rows).toHaveLength(5);
    expect(JSON.stringify(rows)).not.toContain("j@toronto.ca");
    expect(rows[0].wards).toBe(1);
    expect(rows[2].category).toBe("Goods and Services");
  });

  it("merges duplicates, totals and orders by value", () => {
    const guild = suppliers.find((s) => s.slug === "guild-electric-limited");
    expect(guild).toBeTruthy();
    expect(guild!.count).toBe(2);
    expect(guild!.total).toBe(200000);
    expect(guild!.latest).toBe("2025-02-03");
    expect(guild!.first).toBe("2024-05-01");
    expect(guild!.divisions.map((d) => d.name).sort()).toEqual(["Toronto Water", "Transportation Services"]);
    expect(suppliers[0].slug).toBe("big-consult-corp");
  });

  it("skips personal names and gates thin suppliers out of the index", () => {
    expect(suppliers.some((s) => /john/i.test(s.name))).toBe(false);
    expect(suppliers.find((s) => s.name === "Tiny Supplies Inc.")!.indexable).toBe(false);
    expect(suppliers.find((s) => s.name === "Big Consult Corp")!.indexable).toBe(true);
  });

  it("builds a compact index with recent awards linked to supplier slugs", () => {
    const idx = buildIndex(rows, suppliers);
    expect(idx.rows).toBe(5);
    expect(idx.recent[0].slug).toBe("guild-electric-limited");
    expect(idx.suppliers[0]).not.toHaveProperty("awards");
  });
});
