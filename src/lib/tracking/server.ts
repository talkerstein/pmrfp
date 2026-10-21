import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { referrerHost, sanitizePath } from "@/lib/attribution/cookie";
import { bufferEvent, scheduleFlush } from "./buffer";
import { campaignOf } from "./ingest";
import { countryCode, langOfPath, sanitizeProps, type SiteEvent } from "./events";
import { BOT_UA, optedOut } from "./privacy";
import { requestFacts } from "./request";

/**
 * Records one first-party funnel event (site_events) from a server action,
 * route handler or webhook. Fire-and-forget: it buffers the row and the
 * batched write runs after the response (lib/tracking/buffer). Never
 * throws, never slows the action down.
 *
 * From a request (the default) it also reads, without any database or
 * Auth call: Do-Not-Track / Global Privacy Control (then nothing is
 * recorded), the host's country estimate, the page the action was sent
 * from, the campaign tags in the first-touch cookie and the anonymous
 * visitor hash. Pass `fromRequest: false` where the request isn't the
 * person's (the Stripe webhook): only what the caller passes is kept.
 */

export interface TrackContext {
  userId?: string | null;
  role?: string | null;
  lang?: string | null;
  country?: string | null;
  path?: string | null;
  fromRequest?: boolean;
}

const ROLE = /^[a-z_]{1,40}$/;
const LANGS = new Set(["en", "fr", "es"]);

export async function recordSiteEvent(event: SiteEvent, props: Record<string, unknown> = {}, ctx: TrackContext = {}): Promise<void> {
  try {
    let country = countryCode(ctx.country);
    let path = ctx.path ? sanitizePath(ctx.path) || null : null;
    let userId = ctx.userId ?? null;
    let anon: string | null = null;
    let utm: { source?: string; medium?: string; campaign?: string } = {};
    let lang = ctx.lang && LANGS.has(ctx.lang) ? ctx.lang : null;

    if (ctx.fromRequest !== false) {
      const [h, jar] = await Promise.all([headers(), cookies()]);
      if (optedOut(h)) return;
      if (BOT_UA.test(h.get("user-agent") ?? "")) return;
      const all = typeof jar.getAll === "function" ? jar.getAll() : [];
      const facts = requestFacts(h, all, { userId });
      country ??= facts.country;
      userId ??= facts.userId;
      anon = facts.hash;
      utm = campaignOf(facts.ft);
      if (!path) {
        // A server action is posted from the page it's on.
        const ref = h.get("referer");
        if (ref && referrerHost(ref) === referrerHost(`https://${facts.host}`)) {
          try {
            path = sanitizePath(new URL(ref).pathname) || null;
          } catch {
            /* no path */
          }
        }
      }
      lang ??= path ? langOfPath(path) : facts.ft?.lang || null;
    }

    const role = typeof ctx.role === "string" && ROLE.test(ctx.role) ? ctx.role : null;
    bufferEvent({
      event,
      path,
      lang,
      country,
      role,
      user_id: userId,
      anon_hash: anon,
      utm_source: utm.source ?? null,
      utm_medium: utm.medium ?? null,
      utm_campaign: utm.campaign ?? null,
      props: sanitizeProps(props),
      at: new Date().toISOString(),
    });
    flushAfterResponse();
  } catch {
    // Analytics must never break the action that called it.
  }
}

/** Write the buffer once the response has gone out. Outside a request (scripts, tests) it just waits for the next one. */
export function flushAfterResponse(): void {
  try {
    after(() => scheduleFlush());
  } catch {
    /* not in a request scope */
  }
}
