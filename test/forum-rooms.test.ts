import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FORUM_CATEGORY_SLUGS,
  FORUM_CHANNELS,
  ROOM_REDIRECTS,
  canonicalRoom,
  isForumCategory,
  provincesForRoom,
  redirectRoom,
  regionalOrder,
  roomCountry,
  roomForProvince,
  roomSlugCandidates,
} from "@/lib/forum/categories";
import { canonicalRows } from "@/lib/forum/data";
import { STAFF_GUIDES } from "@/lib/forum/staff-guides-content";
import { MAX_PINS_PER_FORUM } from "@/lib/forum/staff-guides";
import { pickOpenBids, pickRooms } from "@/lib/forum/this-week";
import { CA_PROVINCES, US_STATE_NAMES } from "@/lib/geo";
import forumMessages from "@/i18n/messages/forum";

const MIGRATION = readFileSync("supabase/migrations/20261017000002_forum_rework.sql", "utf8");

describe("rooms", () => {
  it("has the rooms the study calls for", () => {
    expect(FORUM_CHANNELS["shop-talk"]).toEqual(["finding-work", "pricing-estimating", "getting-paid", "running-the-business", "show-your-work", "break-room"]);
    for (const r of ["ontario", "quebec", "alberta", "british-columbia", "prairies", "atlantic", "us-northeast", "us-midwest", "us-south", "us-west"]) expect(isForumCategory(r)).toBe(true);
    expect(new Set(FORUM_CATEGORY_SLUGS).size).toBe(FORUM_CATEGORY_SLUGS.length);
    // Trade rooms keep their slugs (no broken links).
    for (const r of ["electrical", "hvac-mechanical", "plumbing", "roofing-envelope", "painting-finishes", "concrete-structure", "landscaping-snow", "cleaning-janitorial", "general-contractors", "codes-permits", "tools-gear"]) expect(isForumCategory(r)).toBe(true);
  });

  it("names and describes every room in every language", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      for (const slug of FORUM_CATEGORY_SLUGS) {
        expect(forumMessages[lang].categories[slug].name.length).toBeGreaterThan(1);
        expect(forumMessages[lang].categories[slug].blurb.length).toBeGreaterThan(10);
      }
      for (const slug of Object.keys(forumMessages[lang].hub.roomAbout)) expect(isForumCategory(slug)).toBe(true);
    }
  });

  it("seeds every room in the migration", () => {
    for (const slug of FORUM_CATEGORY_SLUGS) expect(MIGRATION).toContain(`('${slug}', `);
  });
});

describe("renamed and merged rooms redirect", () => {
  it("maps every old slug to a current room, and never a current room to anything", () => {
    for (const [from, to] of Object.entries(ROOM_REDIRECTS)) {
      expect(isForumCategory(from)).toBe(false);
      expect(isForumCategory(to)).toBe(true);
      expect(redirectRoom(from)).toBe(to);
      expect(canonicalRoom(from)).toBe(to);
    }
    for (const slug of FORUM_CATEGORY_SLUGS) {
      expect(redirectRoom(slug)).toBeNull();
      expect(canonicalRoom(slug)).toBe(slug);
    }
    expect(canonicalRoom("nope")).toBeNull();
    expect(roomSlugCandidates("getting-paid")).toEqual(["getting-paid", "client-talk"]);
    expect(roomSlugCandidates("electrical")).toEqual(["electrical"]);
  });

  it("matches the migration's rename list exactly", () => {
    const block = MIGRATION.slice(MIGRATION.indexOf("  for r in"), MIGRATION.indexOf("  loop"));
    const sql = [...block.matchAll(/\('([a-z-]+)', '([a-z-]+)', '[^']+'\)/g)].map((m) => [m[1], m[2]]);
    expect(Object.fromEntries(sql)).toEqual(ROOM_REDIRECTS);
  });

  it("shows rows still on an old slug (before the migration) under the new room, new row first", () => {
    expect(canonicalRows([{ id: "1", slug: "client-talk" }, { id: "2", slug: "electrical" }, { id: "3", slug: "gone" }])).toEqual([
      { id: "1", slug: "getting-paid" },
      { id: "2", slug: "electrical" },
    ]);
    expect(canonicalRows([{ id: "old", slug: "off-topic" }, { id: "new", slug: "break-room" }])).toEqual([{ id: "new", slug: "break-room" }]);
  });
});

describe("regional rooms (country-first, province-first)", () => {
  it("puts every province and state in one room of its own country", () => {
    for (const p of CA_PROVINCES) {
      const room = roomForProvince(p);
      if (/Yukon|Northwest|Nunavut/.test(p)) expect(room).toBeNull();
      else expect(room && roomCountry(room)).toBe("CA");
    }
    for (const s of US_STATE_NAMES) {
      const room = roomForProvince(s);
      expect(room && roomCountry(room)).toBe("US");
    }
    expect(roomForProvince("Saskatchewan")).toBe("prairies");
    expect(roomForProvince("Nova Scotia")).toBe("atlantic");
    expect(roomForProvince("Texas")).toBe("us-south");
    expect(provincesForRoom("prairies").sort()).toEqual(["Manitoba", "Saskatchewan"]);
    expect(roomCountry("finding-work")).toBeNull();
  });

  it("orders the regional rooms: home room, then own country, then the other country", () => {
    const order = regionalOrder(FORUM_CHANNELS.regional, { country: "CA", province: "Manitoba" });
    expect(order[0]).toBe("prairies");
    const firstUs = order.findIndex((r) => roomCountry(r) === "US");
    expect(order.slice(0, firstUs).every((r) => roomCountry(r) === "CA")).toBe(true);
    expect(regionalOrder(FORUM_CHANNELS.regional, { country: "US", province: "Ohio" })[0]).toBe("us-midwest");
  });

  it("leads the home with followed, trade and regional rooms, never a room from the other country", () => {
    expect(pickRooms({ followed: ["ontario"], tradeSlugs: ["hvac", "snow-removal"], province: "Ontario", country: "CA" })).toEqual(["ontario", "hvac-mechanical", "landscaping-snow"]);
    expect(pickRooms({ followed: ["us-west"], tradeSlugs: [], province: "Alberta", country: "CA" })).toEqual(["alberta"]);
    const now = new Date("2026-11-03T12:00:00Z");
    const th = (id: string, categorySlug: "ontario" | "electrical" | "alberta", createdAt = "2026-11-02T13:38:00Z") => ({ id, categorySlug, createdAt });
    expect(pickOpenBids([th("a", "alberta"), th("b", "electrical"), th("c", "ontario")], ["ontario", "electrical"], 4, now).map((x) => x.id)).toEqual(["c", "b"]);
    expect(pickOpenBids([th("old", "ontario", "2026-10-01T00:00:00Z")], ["ontario"], 4, now)).toEqual([]);
  });
});

describe("staff guides land in the new rooms", () => {
  it("files every guide in a current room, at most 3 pinned per room", () => {
    const pins = new Map<string, number>();
    for (const g of STAFF_GUIDES) {
      expect(isForumCategory(g.category)).toBe(true);
      if (g.pinned) pins.set(g.category, (pins.get(g.category) ?? 0) + 1);
    }
    for (const n of pins.values()) expect(n).toBeLessThanOrEqual(MAX_PINS_PER_FORUM);
    expect(STAFF_GUIDES.length).toBe(55);
    const by = (key: string) => STAFF_GUIDES.find((g) => g.key === key)!.category;
    expect(by("A7")).toBe("getting-paid");
    expect(by("B1")).toBe("finding-work");
    expect(by("D17")).toBe("pricing-estimating");
    expect(by("C3")).toBe("running-the-business");
    expect(by("A5")).toBe("quebec");
  });

  it("moves already-imported guides to the same rooms and pins as the content (migration)", () => {
    const moves = [...MIGRATION.matchAll(/\('guide:([A-Z0-9]+)', '([a-z-]+)', (true|false)\)/g)];
    expect(moves.length).toBeGreaterThan(0);
    for (const [, key, room, pinned] of moves) {
      const g = STAFF_GUIDES.find((x) => x.key === key)!;
      expect(g, key).toBeTruthy();
      expect(g.category).toBe(room);
      expect(String(g.pinned)).toBe(pinned);
    }
    // Every guide whose room changed in this rework is in the move list or covered by a rename.
    const moved = new Set(moves.map((m) => m[1]));
    for (const key of ["A7", "A9", "A4", "A6", "D18", "D14", "D15"]) expect(moved.has(key)).toBe(true);
  });
});
