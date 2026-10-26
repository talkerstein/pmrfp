import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { fmt, formatDate, plural } from "@/i18n/format";
import { lostParts, usedParts, type BannerTone, type BannerView, type TrialUsage } from "./banner";

/**
 * The words in the trial banner, in the visitor's language, built on the
 * server so the page needs no extra client translations. Everything comes
 * from the real BannerView and TrialUsage; no number is made up here.
 * Unit tested in en/fr/es (test/unit/trial-first.test.ts).
 */

export interface BannerCopy {
  kind: "active" | "expired";
  tone: BannerTone;
  /** "Trial day 1 of 14" / "Your trial ended on Oct 3, 2026." */
  title: string;
  /** "Trial: 13 days left · 4 alerts received, 2 bids saved" or the 3-day / 1-day warning. */
  detail: string;
  /** Expired only: heading and the lines for features they actually used. */
  lostHead: string | null;
  lost: string[];
  upgradeLabel: string;
  plansLabel: string;
}

export function bannerCopy(view: BannerView, usage: TrialUsage, lang: Locale): BannerCopy {
  const t = getDictionary(lang).trialFirst.banner;
  if (view.kind === "expired") {
    const date = formatDate(view.endedAt, lang);
    const lost = lostParts(usage).map((p) => plural(p.n, t.lostAlerts));
    return {
      kind: "expired",
      tone: "normal",
      title: fmt(t.ended, { date }),
      detail: lost.length ? "" : t.endedFree,
      lostHead: lost.length ? t.lostHead : null,
      lost,
      upgradeLabel: t.upgrade,
      plansLabel: t.seePlans,
    };
  }
  const date = view.endsAt ? formatDate(view.endsAt, lang) : "";
  const parts = usedParts(usage).map((p) => plural(p.n, t[p.key]));
  let detail: string;
  if (view.tone === "one" || view.tone === "three") detail = [fmt(view.tone === "one" ? t.one : t.three, { date }), parts.join(", ")].filter(Boolean).join(" · ");
  else detail = [plural(view.daysLeft, t.left), parts.length ? parts.join(", ") : t.usedNone].join(" · ");
  return {
    kind: "active",
    tone: view.tone,
    title: fmt(t.day, { day: view.day, total: view.total }),
    detail,
    lostHead: null,
    lost: [],
    upgradeLabel: t.upgrade,
    plansLabel: t.seePlans,
  };
}
