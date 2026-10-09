import { describe, expect, it } from "vitest";
import {
  badgesFor,
  checkPost,
  hasLink,
  hasShortener,
  isIndexableListPage,
  isIndexableProfile,
  isIndexableThread,
  isNewMember,
  pageCount,
  parsePage,
  ratingLabel,
  shouldAutoHide,
  canPost,
  type PostCheckInput,
} from "@/lib/forum/rules";
import { excerpt, handleFrom, normalizeBody, parseBody, parseThreadParam, safeHref, slugify, wordCount } from "@/lib/forum/text";
import { forumForTrade, tradeForForum, FORUM_CATEGORY_SLUGS, channelOf, defaultThreadType, isFrenchForum } from "@/lib/forum/categories";
import { isGoogleUser } from "@/lib/forum/eligibility";
import { previewSamplesOn, samplePosts, sampleProfile, sampleThread } from "@/lib/forum/preview-samples";
import forumMessages from "@/i18n/messages/forum";

const NOW = new Date("2026-10-06T12:00:00Z");
const OLD = "2026-01-01T00:00:00Z";

// Reputation points and member ranks moved to company reputation:
// see test/unit/karma-rules.test.ts.
describe("badges", () => {
  it("computes badges", () => {
    expect(badgesFor({ answers: 0, accepted: 0, verifiedBusiness: false, bestThreadAverage: null, joinedAt: NOW, isModerator: false, now: NOW })).toEqual([]);
    expect(
      badgesFor({ answers: 3, accepted: 10, verifiedBusiness: true, bestThreadAverage: 4.2, joinedAt: "2025-10-01T00:00:00Z", isModerator: true, now: NOW }),
    ).toEqual(["first-answer", "accepted-10", "verified-business", "sharp-thread", "year-one", "moderator"]);
    expect(badgesFor({ answers: 1, accepted: 9, verifiedBusiness: false, bestThreadAverage: 3.9, joinedAt: OLD, isModerator: false, now: NOW })).toEqual(["first-answer"]);
  });
});

describe("thread rating labels", () => {
  it("rounds the average to a label", () => {
    expect(ratingLabel(null)).toBeNull();
    expect(ratingLabel(1)).toBe("dud");
    expect(ratingLabel(2.4)).toBe("fair");
    expect(ratingLabel(3)).toBe("solid");
    expect(ratingLabel(3.6)).toBe("sharp");
    expect(ratingLabel(5)).toBe("gold");
  });
});

describe("indexing gate", () => {
  const base = { status: "approved" as const, type: "question" as const, replyCount: 1, wordsTotal: 150 };
  it("indexes an approved, answered question with 150+ words", () => {
    expect(isIndexableThread(base)).toBe(true);
  });
  it("needs 2 replies for a discussion", () => {
    expect(isIndexableThread({ ...base, type: "discussion" })).toBe(false);
    expect(isIndexableThread({ ...base, type: "discussion", replyCount: 2 })).toBe(true);
  });
  it("noindexes thin, unanswered, held, hidden or flagged threads", () => {
    expect(isIndexableThread({ ...base, wordsTotal: 149 })).toBe(false);
    expect(isIndexableThread({ ...base, replyCount: 0 })).toBe(false);
    expect(isIndexableThread({ ...base, status: "held" })).toBe(false);
    expect(isIndexableThread({ ...base, status: "hidden" })).toBe(false);
    expect(isIndexableThread({ ...base, flagged: true })).toBe(false);
  });
  it("profiles need 5 posts; list pages beyond 5 are noindex", () => {
    expect(isIndexableProfile(4)).toBe(false);
    expect(isIndexableProfile(5)).toBe(true);
    expect(isIndexableListPage(5)).toBe(true);
    expect(isIndexableListPage(6)).toBe(false);
  });
  it("paginates at 25 and parses /page/N", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25)).toBe(1);
    expect(pageCount(26)).toBe(2);
    expect(parsePage("2")).toBe(2);
    expect(parsePage("1")).toBeNull();
    expect(parsePage("abc")).toBeNull();
    expect(parsePage("02x")).toBeNull();
  });
});

describe("spam rules", () => {
  const ok: PostCheckInput = {
    kind: "post",
    body: "Check the backflow preventer first.",
    postCount: 10,
    joinedAt: OLD,
    secondsSinceLast: null,
    threadsToday: 0,
    postsToday: 0,
    duplicate: false,
    now: NOW,
  };

  it("lets an established member post, links included", () => {
    expect(checkPost(ok)).toEqual({ ok: true, hold: false });
    expect(checkPost({ ...ok, body: "See https://example.com/spec" })).toEqual({ ok: true, hold: false });
  });

  it("holds links from new members (first 5 posts or 48h)", () => {
    expect(isNewMember(4, OLD, NOW)).toBe(true);
    expect(isNewMember(10, "2026-10-05T12:00:00Z", NOW)).toBe(true);
    expect(isNewMember(5, OLD, NOW)).toBe(false);
    expect(checkPost({ ...ok, postCount: 2, body: "Buy at https://spam.example" })).toEqual({ ok: true, hold: true });
    expect(checkPost({ ...ok, postCount: 2, body: "try acme-supply.com for that" })).toEqual({ ok: true, hold: true });
    expect(checkPost({ ...ok, postCount: 2 })).toEqual({ ok: true, hold: false });
  });

  it("refuses honeypot, bans, shorteners and duplicates", () => {
    expect(checkPost({ ...ok, honeypot: "http://x" })).toEqual({ ok: false, reason: "honeypot" });
    expect(checkPost({ ...ok, banned: true })).toEqual({ ok: false, reason: "banned" });
    expect(checkPost({ ...ok, body: "go to bit.ly/abc" })).toEqual({ ok: false, reason: "shortener" });
    expect(checkPost({ ...ok, duplicate: true })).toEqual({ ok: false, reason: "duplicate" });
  });

  it("enforces the 60s cooldown and daily caps", () => {
    expect(checkPost({ ...ok, secondsSinceLast: 30 })).toEqual({ ok: false, reason: "cooldown" });
    expect(checkPost({ ...ok, secondsSinceLast: 61 }).ok).toBe(true);
    expect(checkPost({ ...ok, kind: "thread", postCount: 1, threadsToday: 3 })).toEqual({ ok: false, reason: "daily-threads" });
    expect(checkPost({ ...ok, kind: "thread", threadsToday: 3 }).ok).toBe(true);
    expect(checkPost({ ...ok, postCount: 1, postsToday: 20 })).toEqual({ ok: false, reason: "daily-posts" });
    expect(checkPost({ ...ok, postsToday: 99, threadsToday: 1 })).toEqual({ ok: false, reason: "daily-posts" });
  });

  it("lets staff skip cooldown, caps and the link hold, but not shorteners", () => {
    expect(checkPost({ ...ok, trusted: true, postCount: 0, secondsSinceLast: 1, body: "https://pmrfp.com" })).toEqual({ ok: true, hold: false });
    expect(checkPost({ ...ok, trusted: true, body: "tinyurl.com/x" }).ok).toBe(false);
  });

  it("detects links and shorteners without false positives", () => {
    expect(hasLink("no links here, just 3.5 tons")).toBe(false);
    expect(hasLink("www.example.org")).toBe(true);
    expect(hasShortener("https://t.co/abc")).toBe(true);
    expect(hasShortener("see t.co/abc")).toBe(true);
    expect(hasShortener("contact@bit.ly.example")).toBe(false);
    expect(hasShortener("visit microsoft.com")).toBe(false);
  });

  it("auto-hides at 3 distinct reports", () => {
    expect(shouldAutoHide(2)).toBe(false);
    expect(shouldAutoHide(3)).toBe(true);
  });
});

describe("sanitizer", () => {
  it("never produces HTML: markup stays text", () => {
    const blocks = parseBody('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].every((t) => t.t === "text")).toBe(true);
    expect(blocks[0].map((t) => ("v" in t ? t.v : "")).join("")).toContain("<script>");
  });

  it("links only http(s) URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("https://user:pw@evil.com")).toBeNull();
    expect(safeHref("www.example.com")).toBe("https://www.example.com/");
    const [p] = parseBody("See https://example.com/a?b=1. And javascript:alert(1)");
    const links = p.filter((t) => t.t === "link");
    expect(links).toEqual([{ t: "link", href: "https://example.com/a?b=1", v: "https://example.com/a?b=1" }]);
  });

  it("supports paragraphs, line breaks, bold and code", () => {
    const blocks = parseBody("First **bold** line\nsecond `code`\n\n\n\nNext para");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual([
      { t: "text", v: "First " },
      { t: "bold", v: "bold" },
      { t: "text", v: " line" },
      { t: "br" },
      { t: "text", v: "second " },
      { t: "code", v: "code" },
    ]);
  });

  it("strips control and bidi characters and caps length", () => {
    expect(normalizeBody("a\u0000b‮c\r\n\r\n\r\n\r\nd ")).toBe("abc\n\nd");
    expect(normalizeBody("x".repeat(20000))).toHaveLength(10000);
  });

  it("counts words, slugs titles and parses thread URLs", () => {
    expect(wordCount("Who supplies the RTU's permit drawings?")).toBe(6);
    expect(slugify("Who supplies RTU permit drawings? (Ontario)")).toBe("who-supplies-rtu-permit-drawings-ontario");
    expect(slugify("¿Qué?")).toBe("que");
    expect(slugify("!!!")).toBe("thread");
    expect(parseThreadParam("who-supplies-rtu-ab12cd34")).toEqual({ slug: "who-supplies-rtu", shortId: "ab12cd34" });
    expect(parseThreadParam("nope")).toBeNull();
    expect(parseThreadParam("../etc-ab12cd34")).toBeNull();
  });

  it("builds handles and excerpts", () => {
    expect(handleFrom("Jane Doé")).toBe("jane_doe");
    expect(handleFrom("jo@acme.ca")).toMatch(/^[a-z0-9_]{3,24}$/);
    expect(excerpt("**Short** answer")).toBe("Short answer");
    expect(excerpt("word ".repeat(100), 50).length).toBeLessThanOrEqual(50);
  });
});

describe("posting gate (verified members only)", () => {
  const none = { isAdmin: false, isMod: false, orgProfileStatus: null, google: false, emailVerified: false, onboarded: false };
  it("lets approved companies, admins and mods post", () => {
    expect(canPost(none)).toBe(false);
    expect(canPost({ ...none, orgProfileStatus: "approved" })).toBe(true);
    expect(canPost({ ...none, orgProfileStatus: "pending_review" })).toBe(false);
    expect(canPost({ ...none, isAdmin: true })).toBe(true);
    expect(canPost({ ...none, isMod: true })).toBe(true);
  });
  it("needs Google + verified email + onboarding together", () => {
    expect(canPost({ ...none, google: true, emailVerified: true, onboarded: true })).toBe(true);
    expect(canPost({ ...none, google: true, emailVerified: true })).toBe(false);
    expect(canPost({ ...none, google: true, onboarded: true })).toBe(false);
    expect(canPost({ ...none, emailVerified: true, onboarded: true })).toBe(false);
  });
  it("detects Google sign-ins", () => {
    expect(isGoogleUser({ app_metadata: { provider: "google" }, identities: [] })).toBe(true);
    expect(isGoogleUser({ app_metadata: { provider: "email", providers: ["email", "google"] }, identities: [] })).toBe(true);
    expect(isGoogleUser({ app_metadata: { provider: "email" }, identities: [] })).toBe(false);
    expect(isGoogleUser(null)).toBe(false);
  });
});

describe("channels", () => {
  it("defaults trades to Question and community channels to Discussion", () => {
    expect(defaultThreadType("plumbing")).toBe("question");
    expect(defaultThreadType("job-site-stories")).toBe("discussion");
    expect(defaultThreadType("off-topic")).toBe("discussion");
  });
  it("never indexes Off the Clock", () => {
    const t = { status: "approved" as const, type: "discussion" as const, replyCount: 5, wordsTotal: 900 };
    expect(isIndexableThread({ ...t, category: "off-topic" })).toBe(false);
    expect(isIndexableThread({ ...t, category: "job-site-stories" })).toBe(true);
  });
  it("puts every category in exactly one channel; Québec is French-first", () => {
    expect(new Set(FORUM_CATEGORY_SLUGS).size).toBe(FORUM_CATEGORY_SLUGS.length);
    expect(channelOf("quebec")).toBe("regional");
    expect(isFrenchForum("quebec")).toBe(true);
    expect(isFrenchForum("ontario")).toBe(false);
  });
});

describe("preview samples", () => {
  it("are off unless PREVIEW_SAMPLES=1", () => {
    const prev = process.env.PREVIEW_SAMPLES;
    delete process.env.PREVIEW_SAMPLES;
    expect(previewSamplesOn()).toBe(false);
    process.env.PREVIEW_SAMPLES = "true";
    expect(previewSamplesOn()).toBe(false);
    process.env.PREVIEW_SAMPLES = "1";
    expect(previewSamplesOn()).toBe(true);
    if (prev === undefined) delete process.env.PREVIEW_SAMPLES;
    else process.env.PREVIEW_SAMPLES = prev;
  });
  it("include an answered question and community threads", () => {
    const t = sampleThread("hv01rtu1");
    expect(t?.type).toBe("question");
    expect(samplePosts(t!).accepted).not.toBeNull();
    expect(sampleThread("js01boil")?.categorySlug).toBe("job-site-stories");
    expect(sampleProfile("dave_hvac")?.crew?.listed).toBe(true);
  });
});

describe("categories", () => {
  it("has a translated name and blurb for every category in every language", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      for (const slug of FORUM_CATEGORY_SLUGS) {
        expect(forumMessages[lang].categories[slug].name.length).toBeGreaterThan(1);
      }
    }
  });
  it("maps trades to forums and back", () => {
    expect(forumForTrade("hvac")).toBe("hvac-mechanical");
    expect(forumForTrade("snow-removal")).toBe("landscaping-snow");
    expect(forumForTrade("unknown")).toBeNull();
    expect(tradeForForum("plumbing")).toBe("plumbing");
    expect(tradeForForum("off-topic")).toBeNull();
  });
});
