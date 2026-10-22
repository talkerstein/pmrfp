import { safeNextPath } from "@/lib/auth/next";
import { signupRoleFromLink } from "@/lib/auth/signup-link";
import { parsePlanIntent, type PlanId, type PlanInterval } from "@/lib/billing/plan-intent";

/**
 * What a visitor meant when they reached /sign-up (the role they clicked, the
 * plan, where to go after, the town to follow) held for two hours in a
 * first-party cookie, so it survives the things real people do: going back,
 * clicking "Sign up" in the header, switching language, opening the page a
 * second time. The first measurement showed exactly that: a French visitor
 * clicked Trade Pro on a listing, landed on /fr/sign-up?plan=pro, and nine
 * seconds later loaded /fr/sign-up again with no plan; the account was
 * created with no checkout to resume.
 *
 * Pure and client-safe. The URL always wins; the cookie only fills a page
 * that arrived with no plan, no return path, no template and no award.
 * Everything read back is re-validated here (plan allowlist, safeNextPath,
 * role allowlist, slug shape), so a tampered cookie can change nothing but
 * which summary is shown.
 */

export const SIGNUP_INTENT_COOKIE = "pmrfp_su";
export const SIGNUP_INTENT_TTL_S = 2 * 60 * 60;

export interface SignupIntent {
  role?: string;
  plan?: PlanId;
  interval?: PlanInterval;
  next?: string;
  region?: string;
  /** ms since the epoch. */
  at: number;
}

/** The sign-up page's query, as the page reads it. */
export interface SignupParams {
  role?: string;
  kind?: string;
  next?: string;
  template?: string;
  plan?: string;
  interval?: string;
  award?: string;
  region?: string;
}

const REGION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NEXT = 300;

/** The part of the URL worth remembering, or null when there is nothing to remember. */
export function intentFromParams(p: SignupParams, now: number = Date.now()): SignupIntent | null {
  const out: SignupIntent = { at: now };
  const role = signupRoleFromLink(p.role, p.kind);
  if (role) out.role = role;
  const plan = parsePlanIntent(p.plan, p.interval);
  if (plan) {
    out.plan = plan.plan;
    out.interval = plan.interval;
  }
  const next = safeNextPath(p.next);
  if (next && next.length <= MAX_NEXT) out.next = next;
  if (typeof p.region === "string" && p.region.length <= 80 && REGION.test(p.region)) out.region = p.region;
  // A role alone is the page's own default: not worth a cookie.
  return out.plan || out.next || out.region ? out : null;
}

export function serializeIntent(i: SignupIntent): string {
  const o: Record<string, string | number> = { a: i.at };
  if (i.role) o.r = i.role;
  if (i.plan) o.p = i.plan;
  if (i.interval) o.i = i.interval;
  if (i.next) o.n = i.next;
  if (i.region) o.g = i.region;
  return encodeURIComponent(JSON.stringify(o));
}

/** The remembered intent, or null when missing, expired, from the future or malformed. */
export function parseIntent(raw: string | null | undefined, now: number = Date.now()): SignupIntent | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const at = typeof o.a === "number" && Number.isFinite(o.a) ? o.a : 0;
    if (!at || at > now + 60_000 || now - at > SIGNUP_INTENT_TTL_S * 1000) return null;
    const i = intentFromParams(
      {
        role: typeof o.r === "string" ? o.r : undefined,
        plan: typeof o.p === "string" ? o.p : undefined,
        interval: typeof o.i === "string" ? o.i : undefined,
        next: typeof o.n === "string" ? o.n : undefined,
        region: typeof o.g === "string" ? o.g : undefined,
      },
      at,
    );
    return i;
  } catch {
    return null;
  }
}

/** The `Set-Cookie`-free attribute string for document.cookie (client) or response.cookies. */
export function intentCookieAttributes(secure: boolean): string {
  return `Max-Age=${SIGNUP_INTENT_TTL_S}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * The page's params with the remembered intent filled in. The URL wins; the
 * cookie is used only when the URL carried no plan, return path, template or
 * award (a fresh, specific link is never overridden by an old one).
 */
export function withRememberedIntent(p: SignupParams, remembered: SignupIntent | null): SignupParams {
  if (!remembered) return p;
  if (p.plan || p.next || p.template || p.award) return p;
  // A link for another side of the market (a property-manager invite) isn't about an earlier trade plan.
  const linked = signupRoleFromLink(p.role, p.kind);
  if (linked && linked !== "trade" && linked !== "supplier") return p;
  return {
    ...p,
    role: p.role ?? remembered.role,
    plan: remembered.plan,
    interval: remembered.interval,
    next: remembered.next,
    region: p.region ?? remembered.region,
  };
}
