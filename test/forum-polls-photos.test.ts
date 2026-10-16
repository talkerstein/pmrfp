import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_POLL_OPTIONS, canSeeResults, checkVote, isPollOpen, parsePoll, tally } from "@/lib/forum/polls";
import {
  FORUM_PHOTO_BUCKET,
  FORUM_PRIVATE_PHOTO_BUCKET,
  MAX_FORUM_UPLOAD_BYTES,
  MAX_IMAGES_PER_POST,
  bucketForStatus,
  bucketName,
  checkUpload,
  forumPhotoPath,
  isForumPhotoPath,
  parseImagesField,
  publicPhotoUrl,
  sanitizeImages,
} from "@/lib/forum/photos";
import { THROTTLE_HOURS, forumUnsubscribeUrl, shouldNotify, verifyForumUnsubscribe } from "@/lib/forum/notify-rules";

const MIGRATION = readFileSync("supabase/migrations/20261017000002_forum_rework.sql", "utf8");
const U = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const P = (n: number) => `${U}/0000000${n}-aaaa-4bbb-8ccc-dddddddddddd.jpg`;

describe("polls", () => {
  it("parses one question with 2 to 6 distinct options; no poll when left blank", () => {
    expect(parsePoll({})).toBeNull();
    expect(parsePoll({ question: "", options: ["", " "] })).toBeNull();
    expect(parsePoll({ question: "Which costs you most?", options: ["Labour", " materials ", ""] })).toEqual({ question: "Which costs you most?", options: ["Labour", "materials"] });
    expect(parsePoll({ question: "Which?", options: ["One"] })).toBe("invalid");
    expect(parsePoll({ question: "Which?", options: ["A", "B", "C", "D", "E", "F", "G"] })).toBe("invalid");
    expect(parsePoll({ question: "Which?", options: ["Labour", "labour"] })).toBe("invalid");
    expect(parsePoll({ question: "", options: ["A", "B"] })).toBe("invalid");
    expect(MAX_POLL_OPTIONS).toBe(6);
  });

  it("lets a verified member vote once, on an open poll, for one of its options", () => {
    const ok = { canPost: true, pollExists: true, threadApproved: true, closesAt: null, optionInPoll: true, alreadyVoted: false };
    expect(checkVote(ok)).toEqual({ ok: true });
    expect(checkVote({ ...ok, canPost: false })).toEqual({ ok: false, reason: "unverified" });
    expect(checkVote({ ...ok, alreadyVoted: true })).toEqual({ ok: false, reason: "already" });
    expect(checkVote({ ...ok, optionInPoll: false })).toEqual({ ok: false, reason: "option" });
    expect(checkVote({ ...ok, threadApproved: false })).toEqual({ ok: false, reason: "notfound" });
    const now = new Date("2026-11-02T00:00:00Z");
    expect(checkVote({ ...ok, closesAt: "2026-11-01T00:00:00Z", now })).toEqual({ ok: false, reason: "closed" });
    expect(isPollOpen("2026-11-03T00:00:00Z", now)).toBe(true);
  });

  it("shows results only after voting (or to admins, or once closed)", () => {
    expect(canSeeResults({ voted: false })).toBe(false);
    expect(canSeeResults({ voted: true })).toBe(true);
    expect(canSeeResults({ voted: false, isAdmin: true })).toBe(true);
    expect(canSeeResults({ voted: false, closesAt: "2020-01-01T00:00:00Z" })).toBe(true);
  });

  it("tallies percentages that add up to 100", () => {
    const opts = [{ id: "a", label: "A", position: 0 }, { id: "b", label: "B", position: 1 }, { id: "c", label: "C", position: 2 }];
    const { rows, total } = tally(opts, new Map([["a", 1], ["b", 1], ["c", 1]]));
    expect(total).toBe(3);
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBe(100);
    expect(tally(opts, new Map()).rows.every((r) => r.pct === 0)).toBe(true);
  });

  it("is enforced by the database too: 6 positions, one vote per member, results only for voters, no write policies", () => {
    expect(MIGRATION).toMatch(/position smallint not null check \(position between 0 and 5\)/);
    expect(MIGRATION).toMatch(/primary key \(poll_id, user_id\)/);
    expect(MIGRATION).toMatch(/mine\.user_id = auth\.uid\(\)/);
    expect(MIGRATION).toMatch(/revoke all on function public\.forum_poll_results\(uuid\) from public, anon;/);
    expect(MIGRATION).not.toMatch(/create policy[^;]*forum_poll_votes[^;]*for (insert|update|delete|all)/i);
    expect(MIGRATION).toMatch(/create policy "forum poll votes own read" on public\.forum_poll_votes for select using \(user_id = auth\.uid\(\)/);
  });
});

describe("photo uploads", () => {
  it("accepts photos up to 10 MB, 4 per post, and refuses other files", () => {
    expect(checkUpload({ size: 2_000_000, type: "image/jpeg" })).toEqual({ ok: true });
    expect(checkUpload({ size: 2_000_000, type: "" })).toEqual({ ok: true }); // some HEIC files: sharp decides
    expect(checkUpload({ size: MAX_FORUM_UPLOAD_BYTES + 1, type: "image/jpeg" })).toEqual({ ok: false, reason: "too-big" });
    expect(checkUpload({ size: 0, type: "image/jpeg" })).toEqual({ ok: false, reason: "empty" });
    expect(checkUpload({ size: 1000, type: "application/pdf" })).toEqual({ ok: false, reason: "type" });
    expect(checkUpload({ size: 1000, type: "image/svg+xml" })).toEqual({ ok: false, reason: "type" });
    expect(checkUpload({ size: 1000, type: "image/png" }, MAX_IMAGES_PER_POST)).toEqual({ ok: false, reason: "too-many" });
    expect(MAX_IMAGES_PER_POST).toBe(4);
  });

  it("only attaches the member's own processed uploads", () => {
    expect(isForumPhotoPath(forumPhotoPath(U, "00000001-aaaa-4bbb-8ccc-dddddddddddd"), U)).toBe(true);
    expect(isForumPhotoPath(P(1), OTHER)).toBe(false);
    expect(isForumPhotoPath("../etc/passwd")).toBe(false);
    expect(parseImagesField(JSON.stringify([{ path: P(1), w: 1920, h: 1080 }]), U)).toEqual([{ path: P(1), w: 1920, h: 1080 }]);
    expect(parseImagesField(JSON.stringify([{ path: P(1), w: 10, h: 10 }]), OTHER)).toBe("invalid");
    expect(parseImagesField(JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ path: P(n), w: 1, h: 1 }))), U)).toBe("invalid");
    expect(parseImagesField("not json", U)).toBe("invalid");
    expect(parseImagesField("", U)).toEqual([]);
    expect(sanitizeImages([{ path: P(1), w: 1, h: 1 }, { path: P(1), w: 1, h: 1 }, { path: "x", w: 1, h: 1 }, { path: P(2), w: 0, h: 1 }])).toEqual([{ path: P(1), w: 1, h: 1 }]);
  });

  it("makes photos public only with an approved post (held and hidden stay private)", () => {
    expect(bucketForStatus("approved")).toBe("public");
    expect(bucketForStatus("held")).toBe("private");
    expect(bucketForStatus("hidden")).toBe("private");
    expect(bucketName("public")).toBe(FORUM_PHOTO_BUCKET);
    expect(bucketName("private")).toBe(FORUM_PRIVATE_PHOTO_BUCKET);
    expect(publicPhotoUrl("https://x.supabase.co/", P(1))).toBe(`https://x.supabase.co/storage/v1/object/public/forum-photos/${P(1)}`);
    expect(MIGRATION).toMatch(/'forum-photos-private', 'forum-photos-private', false, 5242880, array\['image\/jpeg'\]/);
    expect(MIGRATION).toMatch(/jsonb_array_length\(images\) <= 4/);
  });

  it("strips metadata: the upload route re-encodes every photo with sharp (EXIF/GPS gone)", async () => {
    const route = readFileSync("src/app/api/forum/photos/route.ts", "utf8");
    expect(route).toMatch(/processPhoto\(/);
    expect(route).toMatch(/sessionCanPost/);
    expect(route).toMatch(/storePrivatePhoto/);
    const sharp = (await import("sharp")).default;
    const { processPhoto } = await import("@/lib/projects/image");
    const withExif = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "camera serial 123" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "43/1 39/1 0/1" } } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy();
    const out = await processPhoto(withExif);
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
    expect(out.width).toBe(40);
  });
});

describe("reply emails", () => {
  const base = { threadAuthorId: "a", replierId: "b", authorIsSystem: false, pref: null, channelEmail: null, lastSentAt: null };
  it("emails the thread's author by default, never for their own reply or the system accounts", () => {
    expect(shouldNotify(base)).toBe(true);
    expect(shouldNotify({ ...base, replierId: "a" })).toBe(false);
    expect(shouldNotify({ ...base, authorIsSystem: true })).toBe(false);
  });
  it("respects the preference, the email switch and the throttle", () => {
    expect(shouldNotify({ ...base, pref: "off" })).toBe(false);
    expect(shouldNotify({ ...base, channelEmail: false })).toBe(false);
    const now = new Date("2026-11-02T12:00:00Z");
    expect(shouldNotify({ ...base, lastSentAt: "2026-11-02T10:00:00Z", now })).toBe(false);
    expect(shouldNotify({ ...base, lastSentAt: new Date(now.getTime() - (THROTTLE_HOURS + 1) * 3_600_000).toISOString(), now })).toBe(true);
  });
  it("signs a one-click unsubscribe link that only works for that member", () => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret";
    const url = new URL(forumUnsubscribeUrl("https://pmrfp.com", "user-1")!);
    expect(url.pathname).toBe("/api/forum/unsubscribe");
    expect(verifyForumUnsubscribe("user-1", url.searchParams.get("t"))).toBe(true);
    expect(verifyForumUnsubscribe("user-2", url.searchParams.get("t"))).toBe(false);
  });
});
