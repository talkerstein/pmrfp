/**
 * The ONBOARDING RESCUE track: trade accounts that never finished onboarding
 * (no company yet), so never reach the free track's Day 0 welcome. Pure: the
 * cron loads a StalledState per account and asks decideRescue(); tests do
 * the same with fixtures (test/unit/onboarding-rescue.test.ts).
 *
 *   rescue_2h  +2 hours   "Finish your profile in 2 minutes" (what's left, why,
 *                          a link straight back to onboarding)
 *   rescue_1d  +1 day     2–3 real leads for the trade they picked (else open
 *                          bids in their province / country), honest counts
 *   rescue_3d  +3 days    last nudge: "reply and we'll set it up for you"
 * Then nothing, ever. The clock starts when the account could first be used
 * (email confirmed; Google sign-ups are confirmed at once).
 *
 * Order of checks:
 *   1. Stop: onboarding completed (the free track's welcome takes over from
 *      the new membership, so there's never a double welcome), inactive or
 *      admin, internal / test / demo address, bounced, unsubscribed, email
 *      never confirmed (the link would only bounce them to sign-in).
 *   2. The track only ever starts with rescue_2h: if its window passed
 *      unsent (say the flag was off), nothing goes. No backlog blast.
 *   3. The first unrecorded step whose window is open; a missed window is
 *      never sent late.
 *   4. Gates: one lifecycle email per local day, not on a weekly-email day,
 *      sending hours. rescue_2h uses relaxed hours (8:00–20:00 Mon–Thu,
 *      Friday 9–17, no weekends); the others the normal 9–17 weekdays.
 */
import { RESCUE_STEPS, RESCUE_WINDOWS, type RescueStep, type StepId } from "./config";
import { sendGate, type WaitReason } from "./schedule";
import type { Stage } from "@/lib/onboarding/steps";

export interface StalledState {
  userId: string;
  /** Email confirmed (else account created), ISO: the rescue clock starts here. */
  startedAt: string;
  /** For quiet hours: province/state picked at sign-up, else Eastern. */
  province: string | null;
  /** Active, trade role, not an admin. */
  active: boolean;
  /** Internal, test or demo address (isInternalEmail). */
  internal: boolean;
  emailConfirmed: boolean;
  /** onboarding_completed AND linked to a company. */
  completed: boolean;
  optedOut: boolean;
  suppressed: boolean;
  recorded: ReadonlySet<StepId>;
  lastSentAt: string | null;
  digestSentAt: string | null;
}

export type RescueStopReason =
  | "completed"
  | "inactive"
  | "internal"
  | "bounced"
  | "unsubscribed"
  | "unconfirmed"
  | "not_in_sequence"
  | "finished";

export type RescueDecision =
  | { action: "send"; step: RescueStep }
  | { action: "wait"; step: RescueStep | null; reason: WaitReason }
  | { action: "stop"; reason: RescueStopReason };

export function rescueWindow(step: RescueStep, s: Pick<StalledState, "startedAt">): { from: number; until: number } | null {
  const start = Date.parse(s.startedAt);
  if (!Number.isFinite(start)) return null;
  const w = RESCUE_WINDOWS[step];
  return { from: start + w.dueMs, until: start + w.untilMs };
}

export function rescueStopReason(s: StalledState): RescueStopReason | null {
  if (s.completed) return "completed";
  if (!s.active) return "inactive";
  if (s.internal) return "internal";
  if (s.suppressed) return "bounced";
  if (s.optedOut) return "unsubscribed";
  if (!s.emailConfirmed) return "unconfirmed";
  return null;
}

export function decideRescue(s: StalledState, now: Date): RescueDecision {
  const stop = rescueStopReason(s);
  if (stop) return { action: "stop", reason: stop };
  const t = now.getTime();
  if (!s.recorded.has("rescue_2h")) {
    const w = rescueWindow("rescue_2h", s);
    if (!w || t > w.until) return { action: "stop", reason: "not_in_sequence" };
  }
  for (const step of RESCUE_STEPS) {
    if (s.recorded.has(step)) continue;
    const w = rescueWindow(step, s);
    if (!w || t > w.until) continue; // missed: never late
    if (t < w.from) return { action: "wait", step: null, reason: "not_due" };
    const gate = sendGate(s, now, step === "rescue_2h");
    return gate ? { action: "wait", step, reason: gate } : { action: "send", step };
  }
  return { action: "stop", reason: "finished" };
}

/* ------------------------------------------------------------------ who never gets it */

const INTERNAL_DOMAINS = [
  "pmrfp.com",
  "pmrfp.ca",
  "talkerstein.com",
  "talkerstein.ca",
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "mailinator.com",
  "yopmail.com",
  "guerrillamail.com",
  "sharklasers.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
];
const INTERNAL_TLDS = [".test", ".example", ".invalid", ".localhost", ".local"];
const TEST_LOCAL = /^(test|tester|testing|demo|qa|noreply|no-reply)\d*$|\+(test|demo|qa)/;

/**
 * Our own staff, test, demo and throwaway addresses: never on the rescue
 * track, never on the stalled list. Extra addresses or @domains can be added
 * with LIFECYCLE_INTERNAL_EMAILS (comma-separated).
 */
export function isInternalEmail(email: string | null | undefined, extra: string | undefined = process.env.LIFECYCLE_INTERNAL_EMAILS): boolean {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return true;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (INTERNAL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
  if (INTERNAL_TLDS.some((tld) => domain.endsWith(tld))) return true;
  if (TEST_LOCAL.test(local)) return true;
  const more = (extra ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return more.some((x) => (x.startsWith("@") ? domain === x.slice(1) : e === x));
}

/* ------------------------------------------------------------------ what's left, and the link back */

export type Missing = "role" | "company" | "trades" | "areas";

/**
 * What they still have to do on /onboarding. Sign-up picks (company, trades,
 * areas) are pre-filled there, so only what they didn't pick is "left".
 */
export function missingParts(p: { stage: Stage; prefCompany: boolean; prefTrades: boolean; prefAreas: boolean }): Missing[] {
  const out: Missing[] = [];
  if (p.stage === "role_pick_viewed") out.push("role");
  if (!p.prefCompany) out.push("company");
  if (!p.prefTrades) out.push("trades");
  if (!p.prefAreas) out.push("areas");
  return out;
}

/**
 * Where the email links: /onboarding, which shows the exact step they
 * stopped at (the Google role question if unanswered, else the company form
 * with their sign-up picks ticked). Signed out, it goes via sign-in and
 * straight back (unfinished accounts always land on onboarding).
 */
export function resumePath(p: { orgKind?: string | null }): string {
  if (p.orgKind === "builder") return "/onboarding?role=general_contractor";
  return "/onboarding";
}

/** Open bids for the "no trade picked" +1 day email: in their province (if known), else their country. Pure. */
export function openBidsIn<R extends { title: string; status: string; province: string | null; deadline: string | null; isDemo: boolean }>(
  rfps: readonly R[],
  p: { inCountry: (r: R) => boolean; province: string | null; today: string; isPast: (r: R) => boolean },
): R[] {
  const live = rfps.filter((r) => !r.isDemo && r.status === "open" && !p.isPast(r) && (!r.deadline || r.deadline >= p.today) && p.inCountry(r));
  if (!p.province) return live;
  const prov = p.province.trim().toLowerCase();
  return live.filter((r) => (r.province ?? "").trim().toLowerCase() === prov);
}

/**
 * The personal note for /admin/lifecycle's "copy email" (Rishon sends it by
 * hand from info@). Plain text, no links to track, nothing automatic.
 */
export function manualOutreach(p: { email: string; firstName: string | null; company: string | null; role: string }): { subject: string; text: string } {
  const hi = p.firstName ? `Hi ${p.firstName},` : "Hi,";
  const forCompany = p.company ? ` for ${p.company}` : "";
  const ask =
    p.role === "property_manager"
      ? "If it's easier, reply with your company name and the kind of buildings you manage, and I'll set it up for you."
      : "If it's easier, reply with your company name, the trades you do and the area you cover, and I'll set it up for you.";
  const subject = "Your PMRFP account";
  const text = [
    `To: ${p.email}`,
    `Subject: ${subject}`,
    "",
    hi,
    "",
    `I saw you started a PMRFP account${forCompany} but didn't get to finish the profile. Anything I can help with?`,
    "",
    ask,
    "",
    "R. Talkar",
    "PMRFP · info@pmrfp.com",
  ].join("\n");
  return { subject, text };
}
