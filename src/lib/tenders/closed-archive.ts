/**
 * Public links for closed-archive listings. A closed tender isn't biddable,
 * so its official notice is shown to everyone (not behind Trade Pro like an
 * open tender's "bid here" link). Derived from the slug — the public teaser
 * view has no source_url.
 */
import { closedNoticeUrl, CLOSED_REF, parseClosedAward } from "./canadabuys-closed";
import { awardNoticeUrl } from "./awards";
import { publicTenderSource } from "./sources";
import { YUKON_PORTAL_URL } from "./yukon";
import { slugify } from "./shared";

/** The official notice (CanadaBuys page) or the issuer's portal (Yukon), or null. */
export function closedArchiveNoticeUrl(slug: string): string | null {
  const src = publicTenderSource(slug);
  if (!src.closedArchive) return null;
  if (src.key === "canadabuys-closed") {
    const ref = slug.split("-cbc-").pop() ?? "";
    return CLOSED_REF.test(ref) ? closedNoticeUrl(ref) : null;
  }
  if (src.key === "yukon-closed") return YUKON_PORTAL_URL;
  return null;
}

export interface ClosedArchiveAward {
  winner: string;
  value: string | null;
  date: string;
  /** Official CanadaBuys award notice. */
  noticeUrl: string;
  /** Slug suffix of the matching award listing on PMRFP ("-cba-<ref>"). */
  listingSuffix: string;
}

export function closedArchiveAward(summary: string | null | undefined): ClosedArchiveAward | null {
  const a = parseClosedAward(summary);
  if (!a) return null;
  const ref = slugify(a.ref);
  return { winner: a.winner, value: a.value, date: a.date, noticeUrl: awardNoticeUrl(ref), listingSuffix: `-cba-${ref}` };
}
