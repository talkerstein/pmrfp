import { describe, expect, it } from "vitest";
import { earlyAnswer } from "@/lib/bot-guard";
import { BUYER_PROVINCE_SLUGS } from "@/lib/buyers/province-slugs";
import { PROVINCE_NAMES, provinceSlugOf } from "@/lib/buyers/model";
import robots from "@/app/robots";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("early answers for scanners and SEO-tool bots", () => {
  it("404s scanner probes, with or without a language prefix", () => {
    for (const p of ["/wp-login.php", "/wp-admin/setup-config.php", "/fr/wp-content/x", "/.env", "/.git/config", "/xmlrpc.php", "/phpmyadmin/", "/index.php", "/db.sql", "/backup.tar"]) {
      expect(earlyAnswer("GET", p, CHROME), p).toEqual({ status: 404, reason: "probe" });
    }
  });

  it("leaves real pages, files and the API alone", () => {
    for (const p of ["/", "/rfps", "/rfps/some-tender-1a2b", "/buyers/ontario/town-of-cobourg", "/robots.txt", "/sitemap.xml", "/api/t", "/trades/electrical"]) {
      expect(earlyAnswer("GET", p, CHROME), p).toBeNull();
    }
  });

  it("refuses SEO-tool crawlers but lets robots.txt through so they can read it", () => {
    expect(earlyAnswer("GET", "/rfps/x", "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)")).toEqual({ status: 403, reason: "blocked-bot" });
    expect(earlyAnswer("GET", "/fr/directory", "Mozilla/5.0 (compatible; SemrushBot/7~bl)")).toEqual({ status: 403, reason: "blocked-bot" });
    expect(earlyAnswer("GET", "/robots.txt", "Mozilla/5.0 (compatible; AhrefsBot/7.0)")).toBeNull();
    expect(earlyAnswer("GET", "/sitemap.xml", "MJ12bot/v1.4.8")).toBeNull();
  });

  it("refuses bare script libraries on pages, but not on the API", () => {
    expect(earlyAnswer("GET", "/rfps", "python-requests/2.31.0")).toEqual({ status: 403, reason: "blocked-bot" });
    expect(earlyAnswer("POST", "/api/stripe/webhook", "python-requests/2.31.0")).toBeNull();
  });

  it("never blocks search engines or the AI agents that send sign-ups", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "DuckDuckBot/1.1",
      "Mozilla/5.0 AppleWebKit/605.1.15 (Applebot/0.1)",
      "Mozilla/5.0 AppleWebKit/537.36 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
      "Mozilla/5.0 AppleWebKit/537.36 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
      "Mozilla/5.0 AppleWebKit/537.36 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
      "Mozilla/5.0 AppleWebKit/537.36 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)",
      "Mozilla/5.0 AppleWebKit/537.36 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    ]) {
      expect(earlyAnswer("GET", "/rfps/some-tender", ua), ua).toBeNull();
    }
  });

  it("404s a province that does not exist, and keeps all thirteen that do", () => {
    expect(earlyAnswer("GET", "/buyers/atlantis/some-town", CHROME)).toEqual({ status: 404, reason: "no-such-province" });
    expect(earlyAnswer("GET", "/fr/buyers/texas", CHROME)).toEqual({ status: 404, reason: "no-such-province" });
    expect(earlyAnswer("GET", "/buyers/ontario/town-of-cobourg", CHROME)).toBeNull();
    expect(earlyAnswer("GET", "/buyers", CHROME)).toBeNull();
  });

  it("keeps the province list in step with the buyer model", () => {
    const fromModel = new Set(Object.values(PROVINCE_NAMES).map(provinceSlugOf));
    expect(new Set(BUYER_PROVINCE_SLUGS)).toEqual(fromModel);
  });
});

describe("robots.txt", () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];

  it("keeps everything crawlable for the default group and sets a crawl delay", () => {
    const star = rules.find((x) => x.userAgent === "*");
    expect(star?.allow).toBe("/");
    expect(star?.crawlDelay).toBeGreaterThan(0);
  });

  it("shuts out the SEO-tool bots and nobody a visitor can come from", () => {
    const blocked = rules.filter((x) => x.disallow === "/").flatMap((x) => (Array.isArray(x.userAgent) ? x.userAgent : [x.userAgent]));
    expect(blocked).toContain("AhrefsBot");
    for (const ok of ["Googlebot", "Bingbot", "ChatGPT-User", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"]) {
      expect(blocked.map((b) => String(b).toLowerCase())).not.toContain(ok.toLowerCase());
    }
  });
});
