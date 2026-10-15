/**
 * Which channel a first visit came from, decided on the server from the
 * referring host and the utm tags only. Pure and unit-tested.
 *
 * Order: our own campaign tags first (email, paid, social, referral), then
 * the referring site (search engines, AI assistants, webmail, social
 * networks, our own pages), then "direct" when the browser sent nothing.
 */

import type { Utm } from "./cookie";

export const CHANNELS = [
  "google_organic",
  "bing_organic",
  "other_search",
  "ai_assistant",
  "email",
  "social",
  "paid",
  "referral",
  "internal",
  "direct",
  "other",
  "unknown",
] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABEL: Record<Channel, string> = {
  google_organic: "Google (organic)",
  bing_organic: "Bing (organic)",
  other_search: "Other search",
  ai_assistant: "AI assistant",
  email: "Email",
  social: "Social",
  paid: "Paid",
  referral: "Referral",
  internal: "Internal",
  direct: "Direct",
  other: "Other campaign",
  unknown: "Unknown",
};

export function isChannel(v: unknown): v is Channel {
  return typeof v === "string" && (CHANNELS as readonly string[]).includes(v);
}

/** Our own hosts: a visit "from" them is internal (cookie cleared, a preview, a tab restored). */
const OWN = /(^|\.)pmrfp\.com$|(^|\.)vercel\.app$|^localhost$|^127\.0\.0\.1$/;
const AI = /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|bard\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com|meta\.ai|grok\.com|deepseek\.com|chat\.mistral\.ai)$/;
/** google.com, google.ca, google.co.uk, news.google.com and the Android search app. Other Google hosts (docs, mail) are not search. */
const GOOGLE = /^(news\.|m\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$|^com\.google\.android\.googlequicksearchbox$/;
const BING = /(^|\.)bing\.com$/;
const OTHER_SEARCH = /(^|\.)(duckduckgo\.com|search\.yahoo\.com|yahoo\.com|ecosia\.org|search\.brave\.com|yandex\.[a-z.]+|baidu\.com|qwant\.com|startpage\.com|kagi\.com|naver\.com|ask\.com|aol\.com)$/;
const WEBMAIL = /(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|mail\.yahoo\.com|mail\.proton\.me|mail\.aol\.com|mail\.zoho\.com|mail\.zoho\.ca|webmail\.[a-z0-9.-]+|mail\.hostinger\.com|com\.google\.android\.gm)$/;
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com|linkedin\.com|lnkd\.in|x\.com|twitter\.com|t\.co|instagram\.com|threads\.net|threads\.com|reddit\.com|youtube\.com|youtu\.be|tiktok\.com|pinterest\.com|nextdoor\.com|bsky\.app|com\.linkedin\.android)$/;

const EMAIL_MEDIUM = new Set(["email", "e-mail", "e_mail", "newsletter", "mail", "edm"]);
const PAID_MEDIUM = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_search", "paid-search", "paid_social", "paid-social", "paidsocial", "display", "cpm", "ads", "ad"]);
const SOCIAL_SOURCE = new Set(["facebook", "fb", "meta", "instagram", "ig", "linkedin", "li", "x", "twitter", "threads", "reddit", "youtube", "tiktok", "bluesky"]);
const SOCIAL_MEDIUM = new Set(["social", "social-media", "social_media", "organic_social", "organic-social", "sm"]);
const REFERRAL_MEDIUM = new Set(["referral", "embed", "widget", "badge", "partner", "affiliate"]);
/** Our outreach and email links (founder_outreach, weekly-digest, daily-matches…). */
const EMAIL_SOURCE = /(^|[-_.])(email|newsletter|digest|outreach|invite|mailchimp|resend|alerts?)([-_.]|$)/;

export function isOwnHost(host: string, extra: readonly string[] = []): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return OWN.test(h) || extra.some((e) => e && e.toLowerCase().replace(/^www\./, "") === h);
}

/**
 * The channel for a first touch. `ownHosts` adds hosts that count as our own
 * (the request's host, a custom preview domain).
 */
export function classifyChannel(i: { ref?: string | null; utm?: Utm | null }, ownHosts: readonly string[] = []): Channel {
  const ref = String(i.ref ?? "").toLowerCase();
  const source = String(i.utm?.source ?? "").toLowerCase();
  const medium = String(i.utm?.medium ?? "").toLowerCase();

  if (source || medium) {
    if (EMAIL_MEDIUM.has(medium) || EMAIL_SOURCE.test(source)) return "email";
    if (PAID_MEDIUM.has(medium)) return "paid";
    if (SOCIAL_MEDIUM.has(medium)) return "social";
    if (REFERRAL_MEDIUM.has(medium) || source === "badge" || source === "widget") return "referral";
    if (SOCIAL_SOURCE.has(source)) return "social";
    // A tag we don't recognise: let the referrer decide when there is one.
    if (!ref) return "other";
  }

  if (!ref) return "direct";
  if (isOwnHost(ref, ownHosts)) return "internal";
  if (AI.test(ref)) return "ai_assistant";
  if (WEBMAIL.test(ref)) return "email";
  if (GOOGLE.test(ref)) return "google_organic";
  if (BING.test(ref)) return "bing_organic";
  if (OTHER_SEARCH.test(ref)) return "other_search";
  if (SOCIAL.test(ref)) return "social";
  return "referral";
}
