/**
 * Cheap early answers for traffic that can never become a visitor or a
 * sign-up. Pure and unit-tested; the proxy calls it first, before the rate
 * limiter (a Redis call) and the session refresh, so none of this costs a
 * page render or a database read.
 *
 *  - Vulnerability scanners probing for WordPress, PHP, dotfiles and
 *    database dumps: this site has none of them. Plain 404.
 *  - SEO-tool crawlers and bulk scrapers that only resell our pages
 *    (AhrefsBot, SemrushBot, MJ12bot, Bytespider...). 403. They also get a
 *    `Disallow: /` in robots.txt; this is for the ones that ignore it.
 *  - /buyers/<province>/... with a province that does not exist.
 *
 * Never blocked: Googlebot, Bingbot, DuckDuckBot, Applebot, and the AI search
 * and assistant agents that send us sign-ups (ChatGPT-User, OAI-SearchBot,
 * PerplexityBot, Claude-SearchBot, ClaudeBot, Google-Extended...).
 */
import { BUYER_PROVINCE_SLUGS } from "@/lib/buyers/province-slugs";

/** SEO-tool and bulk-scraper crawlers. Keep in step with robots.ts. */
export const BLOCKED_BOTS = [
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
  "Bytespider",
  "PetalBot",
  "Barkrowler",
  "ImagesiftBot",
  "AwarioBot",
  "SerpstatBot",
  "SeekportBot",
  "MegaIndex",
  "ZoominfoBot",
  "Scrapy",
] as const;

const BLOCKED_BOT_UA = new RegExp(BLOCKED_BOTS.join("|"), "i");
/** Script libraries (no browser, no crawler identity) fetching web pages. */
const SCRIPT_UA = /^(?:python-requests|python-httpx|Python-urllib|aiohttp|libwww-perl|Go-http-client|Wget|Java\/)/i;

/** Paths only a vulnerability scanner asks for. */
const PROBE_PATH = new RegExp(
  [
    "^/(?:wp-admin|wp-login|wp-content|wp-includes|wp-json|wp-config|xmlrpc|phpmyadmin|pma|cgi-bin|server-status|actuator|boaform|HNAP1|owa|ecp|autodiscover|jenkins|manager/html|vendor/phpunit|telescope|_profiler|\\.env|\\.git|\\.aws|\\.ssh|\\.svn|\\.ds_store|\\.vscode|\\.htaccess|\\.htpasswd)(?:[/.?]|$)",
    "\\.(?:php\\d?|asp|aspx|jsp|cgi|sql|bak|old|orig|swp|ini|yml|yaml|env|log|tar|tgz|gz|7z|rar)$",
  ].join("|"),
  "i",
);

/** Not a probe on this site even though the extension looks like one. */
const PROBE_ALLOWED = /^\/(?:robots\.txt|sitemap[^/]*\.xml)$/i;

/** The path without a language prefix (/fr/buyers -> /buyers). */
function unprefixed(pathname: string): string {
  return pathname.replace(/^\/(?:en|fr|es)(?=\/|$)/, "") || "/";
}

export type EarlyAnswer = { status: 403 | 404; reason: "blocked-bot" | "probe" | "no-such-province" };

/**
 * Whether the request deserves an instant bare answer instead of a render.
 * Returns null for everything that should carry on through the proxy.
 */
export function earlyAnswer(method: string, pathname: string, userAgent: string | null | undefined): EarlyAnswer | null {
  const path = unprefixed(pathname);
  const isApi = /^\/api(?:\/|$)/.test(path);

  if (!PROBE_ALLOWED.test(path) && PROBE_PATH.test(path)) return { status: 404, reason: "probe" };

  // robots.txt and the sitemap stay readable: a bot that obeys robots.txt
  // must be able to learn that it is not welcome.
  if (!PROBE_ALLOWED.test(path)) {
    const ua = String(userAgent ?? "");
    if (BLOCKED_BOT_UA.test(ua)) return { status: 403, reason: "blocked-bot" };
    if (!isApi && SCRIPT_UA.test(ua)) return { status: 403, reason: "blocked-bot" };
  }

  if (method === "GET" || method === "HEAD") {
    const m = path.match(/^\/buyers\/([^/]+)/);
    if (m && !BUYER_PROVINCE_SLUGS.has(m[1])) return { status: 404, reason: "no-such-province" };
  }
  return null;
}
