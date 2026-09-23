import { describe, expect, it } from "vitest";
import { classifyNsAward, nsAwardToRfpInsert } from "@/lib/tenders/nova-scotia";
import { classifyYukon, yukonToRfpInsert } from "@/lib/tenders/yukon";
import { classifyTorontoAward } from "@/lib/tenders/toronto";
import { publicTenderSource } from "@/lib/tenders/sources";

const T = "2026-09-23";

describe("Nova Scotia awards", () => {
  const ns = (over: Record<string, string> = {}) => ({
    TENDER_ID: "60141649", ENTITY: "Halifax Regional Municipality", GOODS: "N", SERVICE: "Y", CONSTRUCTION: "N",
    TENDER_DESCRIPTION: "SACKVILLE SPORTS STADIUM BOILER REPLACEMENT", AWARDED_DATE: "2026/09/11", AWARDED_AMOUNT: "592585.00",
    VENDOR: "Acme Mechanical Ltd", ...over,
  });
  it("keeps building-trade awards, drops goods-only, road work and stale rows", () => {
    expect(classifyNsAward(ns(), T)).toEqual(["hvac"]);
    expect(classifyNsAward(ns({ SERVICE: "N", GOODS: "Y" }), T)).toEqual([]);
    expect(classifyNsAward(ns({ TENDER_DESCRIPTION: "Route 304 & Trunk 1 Paving" }), T)).toEqual([]);
    expect(classifyNsAward(ns({ AWARDED_DATE: "2024/01/01" }), T)).toEqual([]);
  });
  it("never prints a unit rate as a contract value", () => {
    expect(nsAwardToRfpInsert(ns({ AWARDED_AMOUNT: "20.00" }))!.summary).toContain("value not disclosed");
    const i = nsAwardToRfpInsert(ns())!;
    expect(i.summary).toContain("$592,585 CAD");
    expect(publicTenderSource(i.slug)).toMatchObject({ key: "ns-awards", past: true });
  });
});

describe("Yukon open tenders", () => {
  const yk = (over: Record<string, string> = {}) => ({
    "Project Number": "RSO - RFB-2026-9-5567",
    "Project Description": "The Facilities Management Branch intends to form a Standing Offer Arrangement with qualified contractors for generator repair services, including but not limited to repair.",
    Department: "Highways and Public Works", "Published Date": "2026-09-18 4:00:00 PM", "Closing Date": "2026-10-13 11:00:00 PM",
    "Project Type": "Request for Standing Offer", "Project Classification": "Services", "Project Status": "Open", ...over,
  });
  it("extracts the actual work as the title", () => {
    expect(classifyYukon(yk(), T)).toEqual(["electrical"]);
    const i = yukonToRfpInsert(yk(), T)!;
    expect(i.title).toBe("Standing offer: Generator repair services");
    expect(i.deadline).toBe("2026-10-13");
    expect(publicTenderSource(i.slug)).toMatchObject({ key: "yukon", past: false });
  });
  it("skips closed and goods", () => {
    expect(classifyYukon(yk({ "Closing Date": "2026-09-01 11:00 PM" }), T)).toEqual([]);
    expect(classifyYukon(yk({ "Project Classification": "Goods" }), T)).toEqual([]);
  });
});

describe("Toronto awards", () => {
  it("skips rows whose description is only procurement boilerplate", () => {
    const row = {
      "Document Number": "1", "High Level Category": "Construction Services", "Successful Supplier": "X Inc",
      "Award Authority Obtained Date": "2026-05-05", "Solicitation Document Description": "No award has been made at RFSQ stage for roofing",
    };
    expect(classifyTorontoAward(row, T)).toEqual([]);
  });
});
