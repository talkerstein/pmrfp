import { Resend } from "resend";
import { COPY, SITE } from "@/lib/site";
import { ROLE_LABEL, withDelta, type WeeklyReport } from "@/lib/admin/weekly-report";
import { fmtByCurrency } from "@/lib/admin/stripe-revenue";
import { recentAwardsHtml } from "@/lib/alerts/awards";
import { majorProjectsHtml } from "@/lib/major-projects/alerts";
import { tagEmailLinks } from "@/lib/email/utm";
import { adminNotificationEmail } from "@/lib/pm-jobs/rules";
import {
  confirmationEmail,
  contactSharedEmail,
  declinedEmail,
  jobAlertEmail,
  newInterestEmail,
  notSelectedEmail,
  pickedEmail,
  publishedEmail,
  rejectedEmail,
  type BuiltEmail,
  type EmailLang,
} from "@/lib/pm-jobs/email-copy";
import { followAlertEmail, type FollowEmailItem } from "@/lib/follows/email-copy";

/**
 * Transactional email via Resend. No-ops (logs) when RESEND_API_KEY is unset
 * so the app runs without email configured. All member-facing emails carry
 * the no-guarantee disclaimer where relevant (§14, §18).
 */

const FROM = process.env.RESEND_FROM_EMAIL || "PMRFP <info@pmrfp.com>";
/** The admin inbox: ADMIN_NOTIFICATION_EMAIL, else info@pmrfp.com (read per email, lib/pm-jobs/rules). */
const adminInbox = () => adminNotificationEmail();
const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com";

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

async function send(
  to: string,
  subject: string,
  html: string,
  headers?: Record<string, string>,
  opts?: {
    replyTo?: string;
    cc?: string[];
    attachments?: { filename: string; content: Buffer }[];
    /** utm_campaign for our pmrfp.com links (lib/email/utm). Member- and public-facing emails only. */
    utm?: string;
  },
): Promise<void> {
  if (opts?.utm) html = tagEmailLinks(html, opts.utm, BASE);
  const resend = client();
  if (!resend) {
    console.info(`[email:noop] to=${to} subject="${subject}"`);
    return;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      ...(headers ? { headers } : {}),
      ...(opts?.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(opts?.cc?.length ? { cc: opts.cc } : {}),
      ...(opts?.attachments?.length ? { attachments: opts.attachments } : {}),
    });
  } catch (err) {
    console.error("[email] send failed", err);
  }
}

// Same shell as the Supabase account emails (supabase/templates/build.py):
// white card on grey, logo, phone breakpoint, table layout for Outlook.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";
const LOGO = "https://pmrfp.com/brand/email-logo.png";

/** Email chrome in French for the few emails a French visitor asks for directly. */
const CHROME = {
  en: {
    ps: `<strong style="color:#0C7A5A">P.S.</strong> Know a trade or a project?
            <a href="${BASE}/refer" style="color:#282B59;font-weight:600;text-decoration:underline">Refer them and earn up to $75</a>
            when they list on PMRFP.`,
    tagline: "Commercial property RFPs and public tenders in Canada and the U.S.",
  },
  fr: {
    ps: `<strong style="color:#0C7A5A">P.-S.</strong> Vous connaissez un entrepreneur ou un projet?
            <a href="${BASE}/fr/refer" style="color:#282B59;font-weight:600;text-decoration:underline">Recommandez-le et gagnez jusqu'à 75 $</a>
            lorsqu'il s'inscrit sur PMRFP.`,
    tagline: "Appels d'offres immobiliers commerciaux et marchés publics au Canada et aux États-Unis.",
  },
  es: {
    ps: `<strong style="color:#0C7A5A">P. D.</strong> ¿Conoce a un contratista o un proyecto?
            <a href="${BASE}/es/refer" style="color:#282B59;font-weight:600;text-decoration:underline">Recomiéndelo y gane hasta $75</a>
            cuando se registre en PMRFP.`,
    tagline: "Solicitudes de propuestas y licitaciones públicas para propiedades comerciales en Canadá y Estados Unidos.",
  },
} as const;

function layout(title: string, bodyHtml: string, footnote?: string, opts?: { referralPs?: boolean; lang?: "en" | "fr" | "es" }): string {
  const chrome = CHROME[opts?.lang ?? "en"];
  // The referral P.S. is for our members. Emails we send on a member's
  // behalf to THEIR clients (review requests) leave it off.
  const ps = opts?.referralPs ?? true;
  return `<!doctype html>
<html lang="${opts?.lang === "fr" ? "fr-CA" : opts?.lang === "es" ? "es-US" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${title}</title>
<style>
  a { color:#282B59; }
  @media only screen and (max-width:620px) {
    .card { width:100% !important; border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
    .pad { padding-left:24px !important; padding-right:24px !important; }
    .outer { padding:0 !important; }
    .btn-a { display:block !important; text-align:center !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:#F4F5F9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F5F9;">
  <tr><td class="outer" align="center" style="padding:32px 12px;">
    <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border:1px solid #E6E8F0;border-radius:16px;">
      <tr><td class="pad" style="padding:32px 40px 0 40px;">
        <a href="${BASE}" style="text-decoration:none;"><img src="${LOGO}" width="146" height="28" alt="PMRFP" style="display:block;border:0;outline:none;height:28px;width:146px;"></a>
      </td></tr>
      <tr><td class="pad" style="padding:28px 40px 12px 40px;font-family:${FONT};font-size:16px;line-height:26px;color:#475569;">
        <h1 style="margin:0 0 12px 0;font-size:24px;line-height:32px;font-weight:700;color:#1B1E45;">${title}</h1>
        ${bodyHtml}
      </td></tr>
      ${ps ? `<tr><td class="pad" style="padding:12px 40px 0 40px;font-family:${FONT};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F6F7FB;border-radius:10px;">
          <tr><td style="padding:14px 16px;font-size:13px;line-height:20px;color:#475569;">
            ${chrome.ps}
          </td></tr>
        </table>
      </td></tr>` : ""}
      <tr><td style="height:36px;line-height:36px;font-size:0;">&nbsp;</td></tr>
    </table>
    <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
      <tr><td class="pad" align="center" style="padding:20px 40px 8px 40px;font-family:${FONT};font-size:12px;line-height:18px;color:#94A3B8;">
        ${footnote ? `<p style="margin:0 0 10px">${footnote}</p>` : ""}
        ${SITE.name} · ${chrome.tagline}<br>
        <a href="${BASE}" style="color:#94A3B8;text-decoration:underline;">pmrfp.com</a> · <a href="mailto:${SITE.email}" style="color:#94A3B8;text-decoration:underline;">${SITE.email}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const btn = (href: string, label: string) =>
  `<a class="btn-a" href="${href}" style="display:inline-block;background:#282B59;color:#FFFFFF;padding:14px 26px;border-radius:10px;text-decoration:none;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600">${label}</a>`;

export type WelcomeKind = "trade" | "supplier" | "property_manager" | "general_contractor" | "landlord";

/**
 * Sent once, when onboarding completes (not at sign-up: the account isn't
 * confirmed yet, and a re-submitted sign-up form used to send it twice).
 * One clear next step per kind of member.
 */
export async function sendWelcomeEmail(
  to: string,
  opts: { name?: string | null; kind: WelcomeKind; companyName: string; profileSlug?: string | null; live?: boolean; tradeSlug?: string | null },
): Promise<void> {
  const first = opts.name?.trim().split(/\s+/)[0];
  const title = `Welcome to PMRFP${first ? `, ${first}` : ""}`;
  let body: string;
  if (opts.kind === "trade" || opts.kind === "supplier") {
    const profile = opts.profileSlug ? `${BASE}/directory/${opts.profileSlug}` : `${BASE}/dashboard`;
    body = `<p>${opts.live
        ? `<strong>${opts.companyName}</strong> is now listed in the PMRFP directory, where property managers look for trades: <a href="${profile}" style="color:#282B59">see your profile</a>.`
        : `<strong>${opts.companyName}</strong> is set up. Add the trades and areas you cover so property managers can find you.`}</p>
       <p style="margin:16px 0 4px"><strong>Your best next step:</strong> add a project. Snap before-and-after photos of a job you're proud of, type one sentence, and PMRFP writes it up for your profile.</p>
       <p>${btn(`${BASE}/dashboard/projects/new`, "Add your first project")}</p>
       <p style="margin:16px 0 0">Then see the open tenders in your trade: <a href="${BASE}/rfps${opts.tradeSlug ? `?category=${opts.tradeSlug}` : ""}" style="color:#282B59">browse open work</a>. Trade Pro ($249 a year) opens the full details and emails you every new match each morning.</p>`;
  } else if (opts.kind === "general_contractor") {
    body = `<p>Post each sub-trade package for free, for example "Roofing package, quotes due Oct 10". Matching local trades are emailed the same day it's published and send you quotes. Their profiles show photos of past work and reviews.</p>
       <p>${btn(`${BASE}/gc-packages/new`, "Post a sub-trade package")}</p>`;
  } else if (opts.kind === "landlord") {
    body = `<p>Need a roof patched, a boiler serviced, or a unit turned over? Post the job on PMRFP for free, once. Matching local trades are emailed the same day it's published and send you their price, so you're not chasing quotes one call at a time.</p>
       <p>${btn(`${BASE}/pm-dashboard/rfps/new`, "Post your first repair or maintenance job")}</p>
       <p style="margin:16px 0 0">Not sure how to describe it? The <a href="${BASE}/rfp-writer" style="color:#282B59">free RFP writer</a> drafts one for you. You can also invite the trades you already use from your dashboard.</p>`;
  } else {
    body = `<p>Posting an RFP on PMRFP is free. Describe the job once, and matching local trades are emailed the same day it's published and send you their price.</p>
       <p>${btn(`${BASE}/pm-dashboard/rfps/new`, "Post your first RFP")}</p>
       <p style="margin:16px 0 0">Not sure how to write it? The <a href="${BASE}/rfp-writer" style="color:#282B59">free RFP writer</a> drafts one for you.</p>`;
  }
  await send(to, title, layout(title, body, "PMRFP helps you find work and get found. It doesn't guarantee contracts."), undefined, { utm: "welcome" });
}

export async function sendSubscriptionActivatedEmail(to: string): Promise<void> {
  await send(
    to,
    "Your PMRFP Trade Pro Membership is Active",
    layout(
      "Your membership is active",
      `<p>Your annual Trade Pro membership is now active. You can view full RFP opportunities, save them, and express interest.</p>
       <p>${btn(`${BASE}/dashboard/rfps`, "View RFP opportunities")}</p>`,
      COPY.disclaimer,
    ),
    undefined,
    { utm: "membership-active" },
  );
}

/** The owner's inbox(es): the admin mailbox and the sign-up alert address, once each. */
async function sendToOwners(subject: string, html: string, opts?: { replyTo?: string; attachments?: { filename: string; content: Buffer }[] }): Promise<void> {
  const addrs = [...new Set([adminInbox(), SIGNUP_ALERT].map((e) => e.trim().toLowerCase()).filter(Boolean))];
  await Promise.all(addrs.map((addr) => send(addr, subject, html, undefined, opts)));
}

/**
 * Notify the admin (you) the instant a paid membership activates — the
 * "you made a sale" email. Fires from the Stripe checkout.session.completed
 * webhook. amountFormatted is the actual amount charged (after any coupon),
 * so a $1 RISHON founding-code sale shows $1 — you can spot promo usage.
 */
export async function sendAdminNewSale(params: {
  company?: string | null;
  email: string;
  plan: string;
  interval: string;
  amountFormatted: string;
  couponNote?: string;
}): Promise<void> {
  await sendToOwners(
    `💰 New PMRFP sale — ${params.plan} · ${params.amountFormatted}`,
    layout(
      "You made a sale 🎉",
      `<ul>
        ${params.company ? `<li><strong>Company:</strong> ${params.company}</li>` : ""}
        <li><strong>Customer:</strong> ${params.email}</li>
        <li><strong>Plan:</strong> ${params.plan} · ${params.interval}</li>
        <li><strong>Amount paid:</strong> ${params.amountFormatted}${params.couponNote ? ` <span style="color:#0C7A5A">(${params.couponNote})</span>` : ""}</li>
       </ul>
       <p>${btn(`${BASE}/admin/subscriptions`, "View in admin")}</p>`,
    ),
  );
}

/**
 * Daily match digest for paying members — one email per person per day with
 * every new RFP in their trades and regions (see lib/alerts/digest).
 */
export async function sendDailyMatches(
  to: string,
  params: {
    subject: string;
    items: { title: string; slug: string; trade: string | null; region: string | null; deadline: string | null; summary: string | null }[];
    unsubscribeUrl: string | null;
    mailingAddress: string | null;
    /** Optional "Recently awarded near you" lines (see lib/alerts/awards). */
    recentAwards?: { slug: string; line: string }[];
    /** Optional "Major projects near you" lines (lib/major-projects/alerts, behind MAJOR_PROJECT_ALERTS). */
    majorProjects?: { slug: string; name: string; line: string }[];
    /** One relevant sponsor row (lib/sponsors/email), or "". */
    sponsorHtml?: string;
  },
): Promise<void> {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const shown = params.items.slice(0, 15);
  const list = shown
    .map((i) => {
      const meta = [i.trade, i.region, i.deadline ? `Closes ${fmt(i.deadline)}` : "No fixed closing date"].filter(Boolean).join(" · ");
      const summary = i.summary
        ? `<br><span style="color:#3A3D4D;font-size:14px">${esc(i.summary.length > 220 ? `${i.summary.slice(0, 217)}…` : i.summary)}</span>`
        : "";
      return (
        `<li style="margin:0 0 18px;line-height:22px"><a href="${BASE}/rfps/${i.slug}" style="color:#282B59;font-weight:600;font-size:15px">${esc(i.title)}</a>` +
        `<br><span style="color:#0C7A5A;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${esc(meta)}</span>${summary}</li>`
      );
    })
    .join("");
  const more =
    params.items.length > shown.length
      ? `<p>…and ${params.items.length - shown.length} more in <a href="${BASE}/dashboard/rfps" style="color:#282B59">your feed</a>.</p>`
      : "";
  const footer = [
    `You're receiving this because your ${SITE.name} Trade Pro membership includes daily match alerts`,
    `<a href="${BASE}/dashboard/settings" style="color:#64748b">Change your trades, regions or alert settings</a>`,
    params.unsubscribeUrl ? `<a href="${params.unsubscribeUrl}" style="color:#64748b">Turn off opportunity emails</a>` : null,
    params.mailingAddress ? `${SITE.name}, ${esc(params.mailingAddress)} · ${SITE.email}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  await send(
    to,
    params.subject,
    layout(
      params.subject,
      `<p>New RFPs and public tenders in your trades and regions since yesterday, soonest deadline first:</p>
       <ul style="padding-left:18px;margin:16px 0">${list}</ul>${more}
       ${recentAwardsHtml(params.recentAwards ?? [], BASE)}
       ${majorProjectsHtml(params.majorProjects ?? [], BASE)}
       <p>${btn(`${BASE}/dashboard/rfps`, "Open your feed")}</p>
       ${params.sponsorHtml ?? ""}`,
      `${footer}.`,
    ),
    params.unsubscribeUrl
      ? {
          "List-Unsubscribe": `<${params.unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
    { utm: "daily-matches" },
  );
}

/**
 * "New leads for {trade} in {area}" (cron/lead-alerts, behind
 * LEAD_ALERTS_ENABLED): projects, permits, development applications and
 * contractors who just won public work, for Trade Pro and trial members.
 * `listHtml` comes from lib/leads/alerts (already escaped).
 */
export async function sendLeadAlert(
  to: string,
  params: {
    subject: string;
    listHtml: string;
    trial: boolean;
    unsubscribeUrl: string | null;
    mailingAddress: string | null;
    sponsorHtml?: string;
  },
): Promise<void> {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const footer = [
    `You're receiving this because your ${SITE.name} Trade Pro ${params.trial ? "trial" : "membership"} includes lead alerts`,
    `<a href="${BASE}/dashboard/company" style="color:#64748b">Change your trades or service areas</a>`,
    params.unsubscribeUrl ? `<a href="${params.unsubscribeUrl}" style="color:#64748b">Turn off opportunity emails</a>` : null,
    params.mailingAddress ? `${SITE.name}, ${esc(params.mailingAddress)} · ${SITE.email}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  await send(
    to,
    params.subject,
    layout(
      params.subject,
      `<p>New in your trades and area: projects, permits and contractors who just won public work. Trade packages usually go out through the general contractor, so this is the time to get on the bid list.</p>
       ${params.listHtml}
       <p>${btn(`${BASE}/dashboard`, "See all your leads")}</p>
       ${params.sponsorHtml ?? ""}`,
      `${footer}.`,
    ),
    params.unsubscribeUrl
      ? {
          "List-Unsubscribe": `<${params.unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
    { utm: "lead-alerts" },
  );
}

/**
 * Saved-tender alerts (cron/saved-rfp-alerts): one email per member listing
 * saved tenders that close within 3 days and saved tenders whose status
 * changed (closed / awarded / expired / archived).
 */
export async function sendSavedRfpAlerts(
  to: string,
  params: {
    subject: string;
    items: { kind: "closing" | "status"; title: string; slug: string; status: string; deadline: string | null }[];
    unsubscribeUrl: string | null;
  },
): Promise<void> {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (d: string) =>
    new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const STATUS: Record<string, string> = {
    closed: "Now closed",
    awarded: "Awarded",
    expired: "Taken off the board (expired)",
    archived: "Archived",
  };
  const row = (i: (typeof params.items)[number]) => {
    const meta =
      i.kind === "closing"
        ? `Closes ${i.deadline ? fmt(i.deadline) : "soon"}`
        : STATUS[i.status] ?? `Status: ${i.status}`;
    return (
      `<li style="margin:0 0 14px;line-height:22px"><a href="${BASE}/rfps/${i.slug}" style="color:#282B59;font-weight:600;font-size:15px">${esc(i.title)}</a>` +
      `<br><span style="color:#0C7A5A;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${esc(meta)}</span></li>`
    );
  };
  const closing = params.items.filter((i) => i.kind === "closing");
  const status = params.items.filter((i) => i.kind === "status");
  const section = (heading: string, list: typeof params.items) =>
    list.length
      ? `<p style="margin:16px 0 6px;font-weight:600;color:#1B1E45">${heading}</p><ul style="padding-left:18px;margin:0">${list.map(row).join("")}</ul>`
      : "";
  const footer = [
    `You're receiving this because you saved these tenders on ${SITE.name}`,
    `<a href="${BASE}/dashboard/saved-rfps" style="color:#64748b">Manage saved tenders</a>`,
    params.unsubscribeUrl ? `<a href="${params.unsubscribeUrl}" style="color:#64748b">Turn off opportunity emails</a>` : null,
  ]
    .filter(Boolean)
    .join(". ");
  await send(
    to,
    params.subject,
    layout(
      params.subject,
      `${section("Closing in the next 3 days", closing)}
       ${section("Status changed", status)}
       <p>${btn(`${BASE}/dashboard/saved-rfps`, "Open saved tenders")}</p>`,
      `${footer}.`,
    ),
    params.unsubscribeUrl
      ? {
          "List-Unsubscribe": `<${params.unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
    { utm: "saved-alerts" },
  );
}

/**
 * RFP deadline passed — ask the posting PM whether it's still live. The
 * one-click "keep it live" link (token-authed, no login) pushes the deadline
 * out 30 days; if there's no action within 7 days, the rfp-expiry cron flips
 * the listing to 'expired' and it drops off the public board.
 */
export async function sendRfpExpiryNotice(
  to: string,
  params: { title: string; slug: string; keepUrl: string },
): Promise<void> {
  await send(
    to,
    "Is your PMRFP listing still active?",
    layout(
      "Still looking for vendors?",
      `<p>Your RFP <strong>${params.title}</strong> has passed its deadline.</p>
       <p>If it's still live, keep it on the board with one click — we'll extend it 30 days:</p>
       <p>${btn(params.keepUrl, "Yes, keep it live")}</p>
       <p style="color:#64748b;font-size:13px">If we don't hear back, this listing automatically comes off the public board in <strong>7 days</strong>. You can re-post any time from your dashboard.</p>`,
    ),
  );
}

/** One PM-job-flow email (lib/pm-jobs/email-copy) in the shared shell, in its language. */
async function sendBuilt(to: string, e: BuiltEmail, lang: EmailLang, utm: string, headers?: Record<string, string>): Promise<void> {
  await send(to, e.subject, layout(e.title, e.bodyHtml, e.footnote, { lang }), headers, { utm });
}

/** To the trade, right after it responds: sent, what happens next, and (free accounts) the responses left this month. */
export async function sendInterestConfirmation(
  to: string,
  rfpTitle: string,
  opts: { lang?: EmailLang; posterKind?: PosterKind; allowance?: { unlimited: boolean; left: number; limit: number } } = {},
): Promise<void> {
  const lang = opts.lang ?? "en";
  await sendBuilt(to, confirmationEmail(lang, { base: BASE, rfpTitle, posterKind: opts.posterKind ?? "pm", allowance: opts.allowance }), lang, "response-sent");
}

/** Admin heads-up: a member's listing is waiting at /admin/rfps (ADMIN_NOTIFICATION_EMAIL, else info@pmrfp.com). */
export async function sendAdminNewRfp(rfp: {
  title: string;
  postedBy?: string;
  region?: string | null;
  category?: string | null;
  kind?: string | null;
  pending?: number | null;
  /** A verified town's job went live without review (lib/town-jobs): an FYI, with the unpublish link. */
  autoPublished?: boolean;
}): Promise<void> {
  const waiting = rfp.pending && rfp.pending > 1 ? ` (${rfp.pending} waiting)` : "";
  const what = rfp.kind === "gc_package" ? "GC package" : rfp.kind === "public_buyer_direct" ? "town job" : "RFP";
  await send(
    adminInbox(),
    rfp.autoPublished ? `New ${what} published (verified buyer): ${rfp.title.slice(0, 90)}` : `New ${what} to review${waiting}: ${rfp.title.slice(0, 90)}`,
    layout(
      rfp.autoPublished ? "A verified town published a job" : "New post waiting for review",
      `<ul>
        <li><strong>Title:</strong> ${esc(rfp.title)}</li>
        ${rfp.postedBy ? `<li><strong>Posted by:</strong> ${esc(rfp.postedBy)}</li>` : ""}
        ${rfp.category ? `<li><strong>Category:</strong> ${esc(rfp.category)}</li>` : ""}
        ${rfp.region ? `<li><strong>Region:</strong> ${esc(rfp.region)}</li>` : ""}
        ${rfp.pending ? `<li><strong>Waiting for review:</strong> ${rfp.pending}</li>` : ""}
       </ul>
       <p>${rfp.autoPublished ? "It's live now: the buyer manages its verified town page, so it skipped review. Unpublish it from admin if something's wrong." : "It stays hidden, and no trade hears about it, until you publish it."}</p>
       <p>${btn(`${BASE}/admin/rfps`, rfp.autoPublished ? "Open admin" : "Review in admin")}</p>`,
    ),
  );
}

/**
 * Admin heads-up: someone claimed a public-buyer page (PMRFP for Towns,
 * lib/towns/actions). Every claim: verified on the spot (FYI), waiting for
 * review (act), or turned into a join request to the page's managing
 * organization (FYI). Same inbox as new posts (ADMIN_NOTIFICATION_EMAIL,
 * else info@pmrfp.com). Built by lib/buyers/admin-notify.
 */
export async function sendAdminBuyerClaim(c: {
  status: "verified" | "pending" | "join_requested";
  buyerName: string;
  buyerKey: string;
  provinceCode: string;
  email: string;
  fullName?: string | null;
  jobTitle?: string | null;
  /** Why it waits (plain English), for a pending claim. */
  reason?: string | null;
  /** Claims and requests now waiting at /admin/buyer-sources. */
  waiting?: number | null;
}): Promise<void> {
  const waiting = c.waiting && c.waiting > 1 ? ` (${c.waiting} waiting)` : "";
  const subject =
    c.status === "pending"
      ? `Buyer page claim to check${waiting}: ${c.buyerName.slice(0, 90)} (${c.provinceCode})`
      : c.status === "verified"
        ? `Buyer page claimed and verified: ${c.buyerName.slice(0, 90)} (${c.provinceCode})`
        : `Join request for a managed buyer page: ${c.buyerName.slice(0, 90)} (${c.provinceCode})`;
  const what =
    c.status === "pending"
      ? "It waits for you: verify the claimant works there (staff page, a reply from the purchasing inbox), or reject it."
      : c.status === "verified"
        ? "Verified on the spot by the work email's domain. Nothing to do unless it looks wrong."
        : "The page already has a managing organization, so this went to them as a join request. Nothing to do unless they ask.";
  await send(
    adminInbox(),
    subject,
    layout(
      c.status === "pending" ? "A buyer page claim is waiting" : "A buyer page was claimed",
      `<ul>
        <li><strong>Page:</strong> <a href="${BASE}/buyers/${esc(c.buyerKey)}">${esc(c.buyerName)}</a> (${esc(c.provinceCode)})</li>
        <li><strong>Claimant:</strong> ${esc(c.fullName || "—")}${c.jobTitle ? `, ${esc(c.jobTitle)}` : ""}</li>
        <li><strong>Email:</strong> ${esc(c.email)}</li>
        ${c.reason ? `<li><strong>Why it waits:</strong> ${esc(c.reason)}</li>` : ""}
        ${c.waiting ? `<li><strong>Waiting for review:</strong> ${c.waiting}</li>` : ""}
       </ul>
       <p>${what}</p>
       <p>${btn(`${BASE}/admin/buyer-sources`, "Open buyer sources")}</p>`,
    ),
  );
}

/**
 * Admin heads-up: a public buyer asked to list its tenders from
 * /for-public-buyers (/api/buyer-sources). Nothing imports until an admin
 * approves it at /admin/buyer-sources. Same inbox as new posts.
 */
export async function sendAdminBuyerSourceRequest(r: {
  organization: string;
  contactName: string;
  workEmail: string;
  tendersUrl: string;
  /** Plain English ("we read their public page daily"). */
  method: string;
  provinceCode: string;
  buyerSlug?: string | null;
  waiting?: number | null;
}): Promise<void> {
  const waiting = r.waiting && r.waiting > 1 ? ` (${r.waiting} waiting)` : "";
  await send(
    adminInbox(),
    `Public buyer wants to list its tenders${waiting}: ${r.organization.slice(0, 90)} (${r.provinceCode})`,
    layout(
      "A public buyer asked to list its tenders",
      `<ul>
        <li><strong>Organization:</strong> ${esc(r.organization)} (${esc(r.provinceCode)})${r.buyerSlug ? ` · ${esc(r.buyerSlug)}` : ""}</li>
        <li><strong>Contact:</strong> ${esc(r.contactName)} · ${esc(r.workEmail)}</li>
        <li><strong>Tenders page:</strong> ${esc(r.tendersUrl)}</li>
        <li><strong>How:</strong> ${esc(r.method)}</li>
        ${r.waiting ? `<li><strong>Waiting for review:</strong> ${r.waiting}</li>` : ""}
       </ul>
       <p>Nothing is imported until you approve it. Check the email matches the organization before you do.</p>
       <p>${btn(`${BASE}/admin/buyer-sources`, "Review in admin")}</p>`,
    ),
  );
}

/**
 * To the poster (PM, landlord, GC, owner): a trade responded. Looked up and
 * sent server-side after the response row exists (lib/pm-jobs/notify). In
 * the poster's language, with the trade's quote when it gave one.
 */
export async function sendPmNewInterest(
  to: string,
  params: {
    vendorName: string;
    rfpTitle: string;
    rfpId: string;
    lang?: EmailLang;
    quote?: { amount?: number | null; kind?: "estimate" | "firm" | null; notes?: string | null; startDate?: string | null; availability?: string | null; currency?: "CAD" | "USD" };
    /** A town's job: the "Review responses" button opens the town's dashboard. */
    posterKind?: PosterKind;
  },
): Promise<void> {
  const lang = params.lang ?? "en";
  await sendBuilt(
    to,
    newInterestEmail(lang, { base: BASE, vendorName: params.vendorName, rfpTitle: params.rfpTitle, rfpId: params.rfpId, quote: params.quote, posterKind: params.posterKind }),
    lang,
    "new-response",
  );
}

/**
 * Same-day "new job" email to a matching trade (lib/pm-jobs/server, behind
 * PM_JOB_ALERTS_ENABLED). Commercial message: CASL footer with the mailing
 * address and a one-click unsubscribe (link + RFC 8058 headers). The caller
 * refuses to send without both.
 */
export async function sendPmJobAlert(
  to: string,
  params: {
    lang: EmailLang;
    title: string;
    slug: string;
    trade: string | null;
    place: string | null;
    deadline: string | null;
    summary: string | null;
    pro: boolean;
    freeLimit: number;
    unsubscribeUrl: string;
    mailingAddress: string;
    /** A public buyer's job: who posted it, and whether bids go to an official portal. */
    town?: { buyer: string | null; mirror: boolean; portal: string | null };
  },
): Promise<void> {
  const { lang, ...rest } = params;
  await sendBuilt(to, jobAlertEmail(lang, { base: BASE, ...rest }), lang, "pm-job-alert", {
    "List-Unsubscribe": `<${params.unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
}

/**
 * Same-day "New from buyers you follow" to a Trade Pro or trial member
 * (lib/follows/alerts-server, behind BUYER_FOLLOW_ALERTS_ENABLED).
 * Commercial: CASL footer with the mailing address and a one-click
 * unsubscribe (link + RFC 8058 headers). The caller refuses to send without both.
 */
export async function sendFollowAlert(
  to: string,
  params: { lang: EmailLang; items: FollowEmailItem[]; unsubscribeUrl: string; mailingAddress: string },
): Promise<void> {
  await sendBuilt(to, followAlertEmail(params.lang, { base: BASE, items: params.items, unsubscribeUrl: params.unsubscribeUrl, mailingAddress: params.mailingAddress }), params.lang, "follow-alert", {
    "List-Unsubscribe": `<${params.unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
}

type PosterKind = "pm" | "gc" | "town";

/**
 * A town's job email (lib/town-jobs/email-copy: invites, answers, addenda,
 * a question waiting) in the shared shell. With an unsubscribe link it also
 * carries the one-click List-Unsubscribe headers (RFC 8058). The callers
 * gate sending (TOWN_INVITES_ENABLED, TOWN_QA_EMAILS_ENABLED).
 */
export async function sendTownJobEmail(to: string, e: BuiltEmail, lang: EmailLang, utm: string, unsubscribeUrl?: string | null): Promise<void> {
  const headers = unsubscribeUrl
    ? { "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : undefined;
  await send(to, e.subject, layout(e.title, e.bodyHtml, e.footnote || undefined, { lang, referralPs: false }), headers, { utm });
}
type Contact = { name: string | null; company: string | null; email: string | null; phone: string | null };

/** To a trade whose response the poster declined (with their optional note). */
export async function sendTradeDeclined(to: string, p: { lang: EmailLang; rfpTitle: string; posterKind: PosterKind; note: string | null }): Promise<void> {
  await sendBuilt(to, declinedEmail(p.lang, { base: BASE, ...p }), p.lang, "response-declined");
}

/** To the picked trade: the poster's contact. */
export async function sendTradePicked(to: string, p: { lang: EmailLang; rfpTitle: string; posterKind: PosterKind; company: string; contact: Contact }): Promise<void> {
  await sendBuilt(to, pickedEmail(p.lang, { base: BASE, ...p }), p.lang, "response-picked");
}

/** To every other trade that responded: thanks, the job went to another company. */
export async function sendTradeNotSelected(to: string, p: { lang: EmailLang; rfpTitle: string; posterKind: PosterKind }): Promise<void> {
  await sendBuilt(to, notSelectedEmail(p.lang, { base: BASE, ...p }), p.lang, "response-not-selected");
}

/** To a trade the poster shared their contact with ("Share my contact"). */
export async function sendTradeContactShared(to: string, p: { lang: EmailLang; rfpTitle: string; posterKind: PosterKind; company: string; contact: Contact }): Promise<void> {
  await sendBuilt(to, contactSharedEmail(p.lang, { base: BASE, ...p }), p.lang, "contact-shared");
}

/** To the poster: the admin rejected the listing, with a short reason. */
export async function sendPmRfpRejected(to: string, p: { lang: EmailLang; title: string; reason: string | null; posterKind?: PosterKind }): Promise<void> {
  await sendBuilt(to, rejectedEmail(p.lang, { base: BASE, ...p }), p.lang, "rfp-rejected");
}

export async function sendAdminNewInterest(params: { vendor: string; rfpTitle: string; message: string }): Promise<void> {
  await send(
    adminInbox(),
    "New Vendor Interest Submitted",
    layout(
      "New vendor interest",
      `<ul>
        <li><strong>Vendor:</strong> ${params.vendor}</li>
        <li><strong>RFP:</strong> ${params.rfpTitle}</li>
       </ul>
       <p><strong>Message:</strong><br/>${params.message}</p>
       <p>${btn(`${BASE}/admin/interests`, "View in admin")}</p>`,
    ),
  );
}

/** To the poster: their listing is live. Says whether matching trades are being emailed today (PM_JOB_ALERTS_ENABLED). */
export async function sendPmRfpPublished(
  to: string,
  rfp: { title: string; slug: string; id?: string; lang?: EmailLang; alertsOn?: boolean; posterKind?: PosterKind },
): Promise<void> {
  const lang = rfp.lang ?? "en";
  await sendBuilt(
    to,
    publishedEmail(lang, { base: BASE, title: rfp.title, slug: rfp.slug, rfpId: rfp.id ?? "", alertsOn: Boolean(rfp.alertsOn), posterKind: rfp.posterKind }),
    lang,
    "rfp-published",
  );
}

/**
 * Notify admin that someone submitted a project referral via /refer-a-project.
 * Admin manually contacts the owner (with referrer permission), drafts the RFP,
 * and tracks the referral for finder's-fee payout if awarded.
 */
export async function sendAdminReferral(params: {
  projectDescription: string;
  projectCity: string;
  projectProvince: string;
  projectCategory?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  referrerName: string;
  referrerEmail: string;
  referrerPhone?: string;
  referrerAffiliation?: string;
}): Promise<void> {
  const ownerLine =
    params.ownerName || params.ownerEmail || params.ownerPhone
      ? `<li><strong>Owner / contact:</strong> ${[params.ownerName, params.ownerEmail, params.ownerPhone].filter(Boolean).join(" · ")}</li>`
      : `<li><em>Owner contact not provided — referrer will introduce.</em></li>`;
  await send(
    adminInbox(),
    `New project referral · ${params.projectCity}, ${params.projectProvince}`,
    layout(
      "New project referral",
      `<ul>
        <li><strong>Referrer:</strong> ${params.referrerName} (${params.referrerEmail}${params.referrerPhone ? ` · ${params.referrerPhone}` : ""})</li>
        ${params.referrerAffiliation ? `<li><strong>Affiliation:</strong> ${params.referrerAffiliation}</li>` : ""}
        <li><strong>Location:</strong> ${params.projectCity}, ${params.projectProvince}</li>
        ${params.projectCategory ? `<li><strong>Category:</strong> ${params.projectCategory}</li>` : ""}
        ${ownerLine}
       </ul>
       <p><strong>Project:</strong><br/>${params.projectDescription.replace(/\n/g, "<br/>")}</p>
       <p>${btn(`${BASE}/admin/contact-requests`, "View in admin")}</p>`,
    ),
  );
}

/**
 * Confirmation to a PROJECT referrer. No cash payout — recognition lane.
 * Public credit on the RFP + top-connectors leaderboard placement.
 */
export async function sendReferralConfirmation(to: string, projectCity: string): Promise<void> {
  await send(
    to,
    "Thanks for the project referral",
    layout(
      "We received your referral",
      `<p>Thanks for introducing this project in <strong>${projectCity}</strong> to ${SITE.name}.</p>
       <p><strong>What happens next:</strong></p>
       <ol>
         <li>Our team reviews the referral (usually within 1 business day).</li>
         <li>We reach out to the property contact (if you provided one) or to you (so you can introduce us).</li>
         <li>We help structure the RFP and publish it live to qualified Canadian trades.</li>
         <li>When the RFP goes live, you get <strong>public credit on the listing</strong> ("Introduced by [you]") and your name moves up the <strong>Top Connectors leaderboard</strong> on ${SITE.name}.</li>
       </ol>
       <p>You'll get a monthly summary of all your referred projects — no chasing required.</p>
       <p style="margin-top:16px;padding:12px;background:#E4FBF2;border-radius:8px;color:#0A6249">
         <strong>Want cash too?</strong> Refer a <strong>trade company</strong> instead and earn
         <strong>$75 ${`CAD`}</strong> when they activate Trade Pro.
         <a href="${BASE}/refer-a-trade" style="color:#282B59;font-weight:600">See the trade lane →</a>
       </p>
       <p>Questions? Reply to this email.</p>`,
      "Project referrals earn recognition (public credit + leaderboard placement) — not cash. The cash-paying lane is /refer-a-trade. PMRFP does not guarantee work; trades and property contacts make their own decisions.",
    ),
  );
}

/**
 * Notify admin that a trade-referral came in — the direct-revenue lane.
 */
export async function sendAdminTradeReferral(params: {
  tradeCompanyName: string;
  tradeCategory?: string;
  tradeCity: string;
  tradeProvince: string;
  tradeContactName?: string;
  tradeContactEmail?: string;
  tradeContactPhone?: string;
  tradeWebsite?: string;
  whyThemNote?: string;
  referrerName: string;
  referrerEmail: string;
  referrerPhone?: string;
  referrerAffiliation?: string;
}): Promise<void> {
  const contactLine =
    params.tradeContactName || params.tradeContactEmail || params.tradeContactPhone
      ? `<li><strong>Trade contact:</strong> ${[params.tradeContactName, params.tradeContactEmail, params.tradeContactPhone].filter(Boolean).join(" · ")}</li>`
      : `<li><em>Trade contact not provided — referrer will introduce.</em></li>`;
  await send(
    adminInbox(),
    `New TRADE referral · ${params.tradeCompanyName} · ${params.tradeCity}, ${params.tradeProvince}`,
    layout(
      "New trade referral (direct-revenue lane)",
      `<ul>
        <li><strong>Referrer:</strong> ${params.referrerName} (${params.referrerEmail}${params.referrerPhone ? ` · ${params.referrerPhone}` : ""})</li>
        ${params.referrerAffiliation ? `<li><strong>Affiliation:</strong> ${params.referrerAffiliation}</li>` : ""}
        <li><strong>Trade company:</strong> ${params.tradeCompanyName}</li>
        ${params.tradeCategory ? `<li><strong>Category:</strong> ${params.tradeCategory}</li>` : ""}
        <li><strong>Location:</strong> ${params.tradeCity}, ${params.tradeProvince}</li>
        ${params.tradeWebsite ? `<li><strong>Website:</strong> <a href="${params.tradeWebsite}">${params.tradeWebsite}</a></li>` : ""}
        ${contactLine}
       </ul>
       ${params.whyThemNote ? `<p><strong>Why this trade:</strong><br/>${params.whyThemNote.replace(/\n/g, "<br/>")}</p>` : ""}
       <p><strong>Fee:</strong> $75 CAD payable to referrer when this trade activates Trade Pro.</p>`,
    ),
  );
}

/**
 * Confirmation to a TRADE referrer. Fee triggers on Trade-Pro-activated.
 */
export async function sendTradeReferralConfirmation(to: string, tradeName: string): Promise<void> {
  await send(
    to,
    "Thanks for the trade referral",
    layout(
      "We received your referral",
      `<p>Thanks for introducing <strong>${tradeName}</strong> to ${SITE.name}.</p>
       <p><strong>What happens next:</strong></p>
       <ol>
         <li>Our team reviews the referral (usually within 1 business day).</li>
         <li>We reach out to the trade contact (if you provided one) or to you (so you can introduce us).</li>
         <li>We help them set up their company profile in the directory.</li>
         <li>About <strong>30 days</strong> after their <strong>Trade Pro</strong> payment clears (settled, with no refund or dispute), you earn a <strong>$75 CAD finder&apos;s fee</strong>, paid by e-transfer.</li>
       </ol>
       <p>You'll get a monthly summary of all your referred trades — no chasing required.</p>
       <p>Questions? Reply to this email.</p>`,
      "Finder's fees are paid ~30 days after the referred trade's Trade Pro payment clears (settled, no refund or dispute). PMRFP does not guarantee subscription or revenue outcomes.",
    ),
  );
}

const SIGNUP_ALERT = process.env.SIGNUP_ALERT_EMAIL || "hi@talkerstein.ca";
const SIGNUP_ROLE: Record<string, string> = {
  trade: "Trade company",
  supplier: "Supplier",
  property_manager: "Property manager",
  real_estate_agent: "Real estate agent",
  talent: "Tradesperson (jobs)",
  visitor: "Browsing only",
};
const escHtml = (s: string) =>
  s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/** One email per new account (email or Google) so no sign-up goes unnoticed. */
export async function sendAdminNewSignup(p: {
  email: string;
  name?: string | null;
  role: string;
  method: "email" | "google";
  gc?: boolean;
  landlord?: boolean;
}): Promise<void> {
  const role = p.gc ? "General contractor" : p.landlord ? "Landlord" : SIGNUP_ROLE[p.role] ?? p.role;
  await send(
    SIGNUP_ALERT,
    `New PMRFP sign-up: ${role}`,
    layout(
      "New sign-up",
      `<ul>
        <li><strong>Name:</strong> ${p.name ? escHtml(p.name) : "(not given)"}</li>
        <li><strong>Email:</strong> ${escHtml(p.email)}</li>
        <li><strong>Signed up as:</strong> ${role}</li>
        <li><strong>Method:</strong> ${p.method === "google" ? "Google" : "Email and password (confirmation pending)"}</li>
       </ul>
       <p>${btn(`${BASE}/admin/users`, "Open users in admin")}</p>`,
    ),
  );
}

/**
 * The spam check rejected a listing outright (score 6+ or a blocked domain).
 * Held listings (score 3 to 5) only show in /admin/organizations?view=held.
 */
export async function sendAdminListingRejected(p: {
  name: string;
  website?: string | null;
  email?: string | null;
  score: number;
  reasons: string[];
}): Promise<void> {
  await send(
    SIGNUP_ALERT,
    `PMRFP spam check rejected a listing: ${p.name}`,
    layout(
      "Listing rejected by the spam check",
      `<ul>
        <li><strong>Company:</strong> ${escHtml(p.name)}</li>
        <li><strong>Website:</strong> ${escHtml(p.website || "(none)")}</li>
        <li><strong>Email:</strong> ${escHtml(p.email || "(none)")}</li>
        <li><strong>Score:</strong> ${p.score}</li>
        <li><strong>Why:</strong> ${p.reasons.map(escHtml).join("; ") || "(none)"}</li>
       </ul>
       <p>The sign-up itself still works; only the listing page is off. Nothing was deleted.</p>
       <p>${btn(`${BASE}/admin/organizations?view=held`, "Open the spam-check queue")}</p>`,
    ),
  );
}

export async function sendAdminContactEmail(params: { name: string; email: string; requestType: string; message: string }): Promise<void> {
  await send(
    adminInbox(),
    `New contact request (${params.requestType})`,
    layout(
      "New contact request",
      `<ul>
        <li><strong>From:</strong> ${params.name} (${params.email})</li>
        <li><strong>Type:</strong> ${params.requestType}</li>
       </ul>
       <p><strong>Message:</strong><br/>${params.message}</p>`,
    ),
  );
}

/**
 * Weekly "new tenders for your trade" digest to FREE trades — the upgrade
 * nudge. Commercial message under CASL, so it carries sender identity, a
 * mailing address and a working one-click unsubscribe (link + RFC 8058
 * List-Unsubscribe headers). The caller refuses to send without an address.
 */
export async function sendTenderDigest(
  to: string,
  params: {
    count: number;
    tradeLabel: string;
    items: { title: string; slug: string; deadline: string | null }[];
    /** How many of this week's matches close within 7 days. */
    closingSoon?: number;
    /** Monthly Trade Pro: the low-commitment first step. */
    upgradeUrl: string;
    annualUrl?: string;
    unsubscribeUrl: string;
    mailingAddress: string;
    /** One relevant sponsor row (lib/sponsors/email), or "". */
    sponsorHtml?: string;
    /** "From buyers you follow" (lib/follows/email-copy weeklyFollowSectionHtml), or "". */
    followedHtml?: string;
    /** "Bids you may have missed" (lib/entitlement/missed-bids-email), behind MISSED_BIDS_BLOCK_ENABLED, or "". */
    missedHtml?: string;
  },
): Promise<void> {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
  const list = params.items
    .map(
      (i) =>
        `<li style="margin:0 0 14px;line-height:22px"><a href="${BASE}/rfps/${i.slug}" style="color:#282B59;font-weight:600">${esc(i.title)}</a>` +
        `<br><span style="color:#64748b;font-size:13px">${i.deadline ? `Closes ${fmt(i.deadline)}` : "Ongoing, no fixed closing date"} · full scope and buyer contact with Trade Pro</span></li>`,
    )
    .join("");
  const more = params.count > params.items.length ? `<p>…and ${params.count - params.items.length} more on the board.</p>` : "";
  const noun = params.count === 1 ? "tender" : "tenders";
  const urgency =
    params.closingSoon && params.closingSoon > 0
      ? ` <strong style="color:#1B1E45">${params.closingSoon} ${params.closingSoon === 1 ? "closes" : "close"} in the next 7 days.</strong>`
      : "";
  const check = (t: string) =>
    `<tr><td valign="top" style="padding:0 10px 8px 0;color:#0C7A5A;font-weight:700">&#10003;</td><td style="padding:0 0 8px 0;font-size:15px;line-height:22px;color:#1B1E45">${t}</td></tr>`;
  // A week with nothing in their trades but news from buyers they follow: just that section.
  const headline = params.count > 0 ? `${params.count} new ${params.tradeLabel} ${noun} this week` : "New bids from buyers you follow";
  const matches =
    params.count > 0
      ? `<p>Public tenders matching your trade and area, posted in the last 7 days.${urgency}</p>
       <ul style="padding-left:18px;margin:16px 0">${list}</ul>${more}`
      : "";
  await send(
    to,
    headline,
    layout(
      headline,
      `${matches}
       ${params.followedHtml ?? ""}
       ${params.missedHtml ?? ""}
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px;background:#F6F7FB;border:1px solid #E6E8F0;border-radius:12px;">
         <tr><td style="padding:20px 20px 12px 20px;">
           <p style="margin:0 0 12px;font-weight:700;color:#1B1E45;font-size:16px">What Trade Pro adds</p>
           <table role="presentation" cellpadding="0" cellspacing="0" border="0">
             ${check("The full scope, documents and the buyer's contact on every notice")}
             ${check("An email the morning each new match posts, not once a week")}
             ${check("Express interest on property-manager RFPs in one click")}
           </table>
           <p style="margin:12px 0 16px">${btn(params.upgradeUrl, "Start Trade Pro, $29/month")}</p>
           <p style="margin:0;font-size:13px;line-height:20px;color:#64748b">Cancel anytime.${
             params.annualUrl ? ` Or <a href="${params.annualUrl}" style="color:#282B59">pay $249 a year</a> and save $99.` : ""
           }</p>
         </td></tr>
       </table>
       ${params.sponsorHtml ?? ""}`,
      `You're receiving this because you have a free ${SITE.name} company profile. ` +
        `<a href="${params.unsubscribeUrl}" style="color:#64748b">Unsubscribe from opportunity emails</a>. ` +
        `${SITE.name}, ${esc(params.mailingAddress)} · ${SITE.email}`,
    ),
    {
      "List-Unsubscribe": `<${params.unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    { utm: "tender-digest" },
  );
}

/** "Email me this RFP" from the RFP Writer — the draft, plus a one-click path to post it. */
const RFP_DRAFT = {
  en: {
    subject: "Your RFP: {title}",
    scope: "Scope",
    requirements: "Requirements",
    submission: "Submission instructions",
    evaluation: "How bids will be evaluated",
    questions: "Questions for bidders",
    cta: "Ready to get bids? Post it on PMRFP free — qualified trades in your region see it, and you stay anonymous until you choose to engage.",
    button: "Post this RFP free",
    path: "/rfp-writer?post=1",
    footnote: "You're getting this because you asked the PMRFP RFP Writer to email you a copy. Review it before sending to bidders — it's a starting draft, not legal advice.",
  },
  fr: {
    subject: "Votre appel d'offres : {title}",
    scope: "Portée des travaux",
    requirements: "Exigences",
    submission: "Instructions de soumission",
    evaluation: "Évaluation des soumissions",
    questions: "Questions aux soumissionnaires",
    cta: "Prêt à recevoir des soumissions? Publiez-le gratuitement sur PMRFP : les entrepreneurs qualifiés de votre région le voient, et vous restez anonyme jusqu'à ce que vous décidiez d'aller plus loin.",
    button: "Publier cet appel d'offres gratuitement",
    path: "/fr/rfp-writer?post=1",
    footnote: "Vous recevez ce courriel parce que vous avez demandé au rédacteur d'appels d'offres de PMRFP de vous en envoyer une copie. Relisez-le avant de l'envoyer aux soumissionnaires : c'est une première version, pas un avis juridique.",
  },
  es: {
    subject: "Su RFP: {title}",
    scope: "Alcance del trabajo",
    requirements: "Requisitos",
    submission: "Instrucciones para presentar ofertas",
    evaluation: "Cómo se evaluarán las ofertas",
    questions: "Preguntas para los oferentes",
    cta: "¿Listo para recibir ofertas? Publíquela gratis en PMRFP: los contratistas calificados de su región la ven, y usted se mantiene anónimo hasta que decida avanzar.",
    button: "Publicar esta RFP gratis",
    path: "/es/rfp-writer?post=1",
    footnote: "Recibe este correo porque le pidió al Redactor de RFP de PMRFP que le enviara una copia. Revísela antes de enviarla a los oferentes: es un primer borrador, no asesoría legal.",
  },
} as const;

export async function sendRfpDraftEmail(
  to: string,
  rfp: {
    title: string;
    summary: string;
    scope: string;
    requirements: string;
    submissionInstructions: string;
    evaluationCriteria: string[];
    questionsForBidders: string[];
  },
  lang: "en" | "fr" | "es" = "en",
): Promise<void> {
  const t = RFP_DRAFT[lang];
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const para = (s: string) => `<p style="white-space:pre-wrap;margin:0 0 16px;line-height:1.5">${esc(s)}</p>`;
  const list = (items: string[]) =>
    `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.5">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  const h = (s: string) => `<h2 style="font-size:15px;margin:20px 0 8px;color:#282B59">${s}</h2>`;
  await send(
    to,
    t.subject.replace("{title}", rfp.title),
    layout(
      esc(rfp.title),
      `${para(rfp.summary)}
       ${h(t.scope)}${para(rfp.scope)}
       ${h(t.requirements)}${para(rfp.requirements)}
       ${h(t.submission)}${para(rfp.submissionInstructions)}
       ${h(t.evaluation)}${list(rfp.evaluationCriteria)}
       ${h(t.questions)}${list(rfp.questionsForBidders)}
       <p style="margin:24px 0 8px">${t.cta}</p>
       ${btn(`${BASE}${t.path}`, t.button)}`,
      t.footnote,
      { lang },
    ),
    undefined,
    { utm: "rfp-writer" },
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Monday numbers email to the admin inbox (cron: /api/cron/admin-weekly). */
export async function sendAdminWeeklyReport(r: WeeklyReport): Promise<void> {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#64748b">${label}</td><td style="padding:6px 0;font-weight:600">${value}</td></tr>`;
  const list = (items: string[]) => (items.length ? `<ul style="margin:6px 0 16px;padding-left:18px">${items.join("")}</ul>` : `<p style="margin:6px 0 16px;color:#64748b">None this week.</p>`);

  const s = r.stripe;
  const body = `
    <table style="border-collapse:collapse;margin-bottom:16px">
      ${row("Signups", withDelta(r.signups.count, r.signups.prev))}
      ${
        s
          ? row("Money in (Stripe)", `${fmtByCurrency(s.moneyIn7d)} this week · ${fmtByCurrency(s.moneyIn30d)} last 30 days`) +
            row("Active subscriptions (Stripe)", `${s.active.length} · MRR ${fmtByCurrency(s.mrr)}`) +
            (s.pastDue.length ? row("Failed payments (Stripe)", `${s.pastDue.length}: ${esc(s.pastDue.join(", "))}`) : "") +
            (s.canceled7d.length ? row("Canceled this week (Stripe)", esc(s.canceled7d.join(", "))) : "")
          : row("Revenue", "Stripe unavailable — check the Stripe dashboard")
      }
      ${row("Members with RFP access", `${r.access.payingCount}${r.access.comped ? ` (+${r.access.comped} comped)` : ""} <span style="color:#64748b;font-weight:400">(database; includes manual grants)</span>`)}
      ${row("RFPs posted by PMs", String(r.activity.pmRfps.length))}
      ${row("Interest expressed", withDelta(r.activity.interests, r.activity.interestsPrev))}
      ${row("Contact requests", String(r.activity.contactRequests))}
      ${row("Tenders imported", `${r.activity.tendersImported} (${r.activity.usTendersImported} U.S.)`)}
    </table>

    <h2 style="font-size:16px;margin:16px 0 4px">Signups by type</h2>
    ${list(r.signups.byRole.map(([label, n]) => `<li>${esc(label)}: <strong>${n}</strong></li>`))}

    <h2 style="font-size:16px;margin:16px 0 4px">Visitors, sign-ups by source and funnel (first-party)</h2>
    ${
      r.traffic
        ? `<p style="margin:6px 0 2px;font-weight:600">Canada</p>${list(r.traffic.canada.map((l) => `<li>${esc(l)}</li>`))}<p style="margin:6px 0 2px;font-weight:600">United States</p>${list(r.traffic.us.map((l) => `<li>${esc(l)}</li>`))}<p style="margin:0 0 16px">${btn(`${BASE}/admin/analytics?days=7`, "Open site analytics")}</p>`
        : `<p style="margin:6px 0 16px;color:#64748b">Not available yet (site tracking tables not set up).</p>`
    }

    <h2 style="font-size:16px;margin:16px 0 4px">Payments received this week (Stripe)</h2>
    ${s ? list(s.payments7d.map((p) => `<li>${esc(p.who)} — $${p.amount.toLocaleString("en-CA")} ${p.currency} · ${p.date}</li>`)) : "<p>Stripe unavailable.</p>"}

    <h2 style="font-size:16px;margin:16px 0 4px">Active subscriptions (Stripe)</h2>
    ${s ? list(s.active.map((a) => `<li>${esc(a.who)} — $${a.amount.toLocaleString("en-CA")} ${a.currency}/${a.interval}</li>`)) : "<p>Stripe unavailable.</p>"}

    <h2 style="font-size:16px;margin:16px 0 4px">RFPs posted by property managers</h2>
    ${list(r.activity.pmRfps.map((p) => `<li><a href="${BASE}/rfps/${encodeURIComponent(p.slug)}" style="color:#282B59">${esc(p.title)}</a></li>`))}

    <h2 style="font-size:16px;margin:16px 0 4px">Newest signups</h2>
    ${list(r.signups.latest.map((u) => `<li>${esc(u.email)} · ${esc(ROLE_LABEL[u.primary_role] ?? u.primary_role)} · ${u.created_at.slice(0, 10)}</li>`))}

    <p>${btn(`${BASE}/admin`, "Open admin")}</p>`;

  await send(
    adminInbox(),
    `PMRFP weekly: ${r.signups.count} signups, ${s ? `${fmtByCurrency(s.moneyIn7d)} in` : "revenue: check Stripe"}`,
    layout(`Your week: ${r.period.from} → ${r.period.to}`, body),
  );
}

/**
 * Review request, sent on a trade's behalf to their client for one
 * published project. Plain and short: who's asking, which job, one button.
 * The link is single-use and opens /review/[token] (no account needed).
 */
export async function sendReviewRequest(
  to: string,
  params: { clientName: string; tradeName: string; projectTitle: string; url: string },
): Promise<void> {
  const first = params.clientName.trim().split(/\s+/)[0] ?? "";
  await send(
    to,
    `${params.tradeName} asked for your review`,
    layout(
      `How did ${esc(params.tradeName)} do?`,
      `<p>Hi${first ? ` ${esc(first)}` : ""},</p>
       <p>${esc(params.tradeName)} asked us to get your honest review of this job:</p>
       <p style="font-weight:600;font-size:16px;margin:8px 0 16px">${esc(params.projectTitle)}</p>
       <p>It takes about two minutes. No account needed.</p>
       <p>${btn(params.url, "Write a review")}</p>
       <p style="color:#64748b;font-size:13px">The ${SITE.name} team checks every review before it shows on their profile, good or bad. We show your first name and last initial unless you tell us we can show your company.</p>`,
      `You're getting this one email because ${esc(params.tradeName)} named you as the client for this project on ${SITE.name}. We won't add you to any mailing list. The link works once.`,
      { referralPs: false },
    ),
    undefined,
    { utm: "review-request" },
  );
}

/** Admin heads-up: a project review is waiting for moderation. */
export async function sendAdminNewReview(params: { tradeName: string; projectTitle: string; rating: number }): Promise<void> {
  await send(
    adminInbox(),
    `New review to check (${params.rating}/5) · ${params.tradeName}`,
    layout(
      "New review waiting",
      `<ul>
        <li><strong>Trade:</strong> ${esc(params.tradeName)}</li>
        <li><strong>Project:</strong> ${esc(params.projectTitle)}</li>
        <li><strong>Rating:</strong> ${params.rating}/5</li>
       </ul>
       <p>${btn(`${BASE}/admin/reviews`, "Review in admin")}</p>`,
    ),
  );
}

/**
 * A quote request from a realtor's trusted-trades page, straight to the
 * trade (Reply-To the client) with the realtor copied. Falls back to the
 * PMRFP inbox when the trade has no email on file.
 */
export async function sendTrustedQuoteRequest(params: {
  to: string | null;
  tradeName: string;
  recommender: string;
  pageUrl: string;
  requester: { name: string; email: string; phone: string | null };
  message: string;
  cc: string[];
}): Promise<void> {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const to = params.to ?? adminInbox();
  const who = `${esc(params.requester.name)} &lt;${esc(params.requester.email)}&gt;${params.requester.phone ? ` · ${esc(params.requester.phone)}` : ""}`;
  await send(
    to,
    `Quote request from ${params.requester.name} (via ${params.recommender})`,
    layout(
      `A quote request for ${esc(params.tradeName)}`,
      `<p>${esc(params.recommender)} lists ${esc(params.tradeName)} on their <a href="${params.pageUrl}" style="color:#282B59">trusted-trades page</a>, and one of their clients would like a quote.</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;background:#F6F7FB;border-radius:10px;">
         <tr><td style="padding:14px 16px;font-size:15px;line-height:23px;color:#1B1E45;">
           <strong>From:</strong> ${who}<br><br>${esc(params.message).replace(/\n/g, "<br>")}
         </td></tr>
       </table>
       <p>Reply to this email to answer them directly.${params.to ? "" : " (This company has no email on file with PMRFP: please pass it along.)"}</p>`,
      `You're getting this because ${esc(params.tradeName)} is listed on PMRFP. ${esc(params.recommender)} is copied.`,
      { referralPs: false },
    ),
    undefined,
    { replyTo: params.requester.email, cc: params.cc },
  );
}

/** A job application, to the employer (Reply-To the applicant). */
export async function sendJobApplication(params: {
  to: string;
  jobTitle: string;
  jobUrl: string;
  /** The applicant's PMRFP Talent profile, when they have a published one. */
  talentUrl?: string | null;
  applicant: {
    name: string;
    email: string;
    phone: string | null;
    experienceYears: number | null;
    certifications: string | null;
    message: string | null;
  };
}): Promise<void> {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const a = params.applicant;
  const rows = [
    ["Name", esc(a.name)],
    ["Email", `<a href="mailto:${esc(a.email)}" style="color:#282B59">${esc(a.email)}</a>`],
    a.phone ? ["Phone", `<a href="tel:${esc(a.phone)}" style="color:#282B59">${esc(a.phone)}</a>`] : null,
    a.experienceYears != null ? ["Experience", `${a.experienceYears} year${a.experienceYears === 1 ? "" : "s"}`] : null,
    a.certifications ? ["Tickets and certifications", esc(a.certifications)] : null,
    params.talentUrl ? ["PMRFP profile", `<a href="${params.talentUrl}" style="color:#282B59">See their profile</a>`] : null,
  ].filter((r): r is string[] => Boolean(r));
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:14px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0;font-size:15px;color:#1B1E45">${v}</td></tr>`)
    .join("");
  await send(
    params.to,
    `New applicant: ${a.name} for ${params.jobTitle}`,
    layout(
      `${esc(a.name)} applied for ${esc(params.jobTitle)}`,
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px">${table}</table>
       ${a.message ? `<p style="margin:0 0 16px;padding:12px 14px;background:#F6F7FB;border-radius:10px;color:#1B1E45">${esc(a.message).replace(/\n/g, "<br>")}</p>` : ""}
       <p>Reply to this email to answer ${esc(a.name.split(/\s+/)[0])} directly.</p>
       <p>${btn(`${BASE}/jobs/manage`, "See all applicants")}</p>`,
      `Sent because your company posted <a href="${params.jobUrl}" style="color:#64748b">${esc(params.jobTitle)}</a> on PMRFP. Close the job from your Hiring page to stop applications.`,
      { referralPs: false },
    ),
    undefined,
    { replyTo: a.email },
  );
}

/** An employer's message to a worker, sent through PMRFP (Reply-To the employer; the worker's email stays private). */
export async function sendTalentContact(params: {
  to: string;
  workerName: string;
  profileUrl: string;
  company: string;
  sender: { name: string; email: string };
  message: string;
}): Promise<void> {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  await send(
    params.to,
    `${params.company} wants to talk about work`,
    layout(
      `${esc(params.company)} found your PMRFP profile`,
      `<p>${esc(params.sender.name)} from ${esc(params.company)} sent you this message:</p>
       <p style="margin:0 0 16px;padding:12px 14px;background:#F6F7FB;border-radius:10px;color:#1B1E45">${esc(params.message).replace(/\n/g, "<br>")}</p>
       <p>Reply to this email to answer them directly. They don't see your email address unless you reply.</p>`,
      `Sent because your <a href="${params.profileUrl}" style="color:#64748b">PMRFP profile</a> is public. You can hide it or set "Not looking" any time.`,
      { referralPs: false },
    ),
    undefined,
    { replyTo: params.sender.email },
  );
}

// ── Project Spotlight ────────────────────────────────────────────────────

const NOT_PROMISED =
  "A Spotlight is a permanent, labelled \"Sponsored Spotlight\" page about one finished project. We don't promise rankings, traffic, leads or mentions in AI answers. If we can't publish your article, you get a full refund.";

const paragraphs = (s: string) =>
  escHtml(s)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

/** To the buyer, right after payment: what to do next. */
export async function sendSpotlightPaid(to: string, sessionId: string): Promise<void> {
  const link = `${BASE}/spotlight/submit?session_id=${encodeURIComponent(sessionId)}`;
  await send(
    to,
    "Your Project Spotlight is paid. Send us your article",
    layout(
      "Thanks, your Project Spotlight is booked",
      `<p>Next step: send us your article and photos (about 5 minutes). We review every article, make light edits for clarity, and publish within 2 business days.</p>
       <p>${btn(link, "Submit your article")}</p>
       <p style="font-size:14px">What you'll need: a 400 to 800 word write-up of one finished project (the challenge, what you did, the result), 1 to 4 photos, and your client's OK to feature the project.</p>
       <p style="font-size:14px">${NOT_PROMISED}</p>
       <p style="font-size:14px">Questions? Just reply to this email.</p>`,
      undefined,
      { referralPs: false },
    ),
    undefined,
    { replyTo: SIGNUP_ALERT },
  );
}

/** To the owner: someone paid. (The generic sale email also fires; this one says what to expect.) */
export async function sendAdminSpotlightSubmission(p: {
  company: string;
  contactName: string;
  email: string;
  website: string;
  title: string;
  trade: string;
  city: string;
  province: string;
  article: string;
  sessionId: string;
  attachments: { filename: string; content: Buffer }[];
}): Promise<void> {
  await sendToOwners(
    `📝 Spotlight article to review: ${p.company}`,
    layout(
      "A Spotlight article is ready to review",
      `<ul>
        <li><strong>Company:</strong> ${escHtml(p.company)}</li>
        <li><strong>Contact:</strong> ${escHtml(p.contactName)} (${escHtml(p.email)})</li>
        <li><strong>Website:</strong> ${escHtml(p.website || "(none)")}</li>
        <li><strong>Title:</strong> ${escHtml(p.title)}</li>
        <li><strong>Trade / place:</strong> ${escHtml(p.trade)} · ${escHtml(p.city)}${p.province ? ", " + escHtml(p.province) : ""}</li>
        <li><strong>Stripe session:</strong> ${escHtml(p.sessionId)} (paid)</li>
        <li><strong>Photos attached:</strong> ${p.attachments.length}</li>
       </ul>
       <h2 style="font-size:18px;margin:16px 0 8px;color:#1B1E45">Article</h2>
       ${paragraphs(p.article)}
       <p style="font-size:14px">To publish: tell Claude "publish the ${escHtml(p.company)} spotlight". Check: real project, no unverifiable claims, photos are theirs. To refuse: refund the Stripe payment and reply to the buyer.</p>`,
      undefined,
      { referralPs: false },
    ),
    { replyTo: p.email, attachments: p.attachments },
  );
}

/** To the buyer: we got it. */
export async function sendSpotlightReceived(to: string, title: string): Promise<void> {
  await send(
    to,
    "We received your Spotlight article",
    layout(
      "We've got your article",
      `<p>Thanks. We received <strong>${escHtml(title)}</strong> and will review it within 2 business days. We'll email you the link when it's live, or tell you if we need anything changed.</p>
       <p style="font-size:14px">${NOT_PROMISED}</p>`,
      undefined,
      { referralPs: false },
    ),
    undefined,
    { replyTo: SIGNUP_ALERT },
  );
}

// ── Marketplace ──────────────────────────────────────────────────────────

/** A buyer's message to a marketplace seller (Reply-To the buyer; the seller's email stays private). */
export async function sendMarketplaceContact(params: {
  to: string;
  listingTitle: string;
  listingUrl: string;
  buyer: { name: string; email: string };
  message: string;
}): Promise<void> {
  await send(
    params.to,
    `Question about your listing: ${params.listingTitle}`,
    layout(
      "Someone is interested in your listing",
      `<p>${escHtml(params.buyer.name)} sent a message about <a href="${params.listingUrl}">${escHtml(params.listingTitle)}</a>:</p>
       <p style="margin:0 0 16px;padding:12px 14px;background:#F6F7FB;border-radius:10px;color:#1B1E45">${escHtml(params.message).replace(/\n/g, "<br>")}</p>
       <p>Reply to this email to answer them directly. They don't see your email address unless you reply.</p>
       <p style="font-size:13px;color:#64748b">PMRFP doesn't handle payment or delivery. Meet in a safe place, inspect before you pay, and never send a deposit to someone you haven't met.</p>`,
      `Sent because you listed an item on the <a href="${BASE}/marketplace" style="color:#64748b">PMRFP Marketplace</a>. Mark it sold from your dashboard to stop messages.`,
      { referralPs: false },
    ),
    undefined,
    { replyTo: params.buyer.email },
  );
}

/** Someone reported a marketplace listing. */
export async function sendAdminMarketplaceReport(params: {
  listingTitle: string;
  listingUrl: string;
  reason: string;
  reporterEmail?: string | null;
}): Promise<void> {
  await sendToOwners(
    `⚠️ Marketplace listing reported: ${params.listingTitle}`,
    layout(
      "A marketplace listing was reported",
      `<ul>
        <li><strong>Listing:</strong> <a href="${params.listingUrl}">${escHtml(params.listingTitle)}</a></li>
        <li><strong>Reported by:</strong> ${params.reporterEmail ? escHtml(params.reporterEmail) : "(anonymous)"}</li>
       </ul>
       <p style="margin:0 0 16px;padding:12px 14px;background:#F6F7FB;border-radius:10px;color:#1B1E45">${escHtml(params.reason).replace(/\n/g, "<br>")}</p>
       <p>${btn(`${BASE}/admin/marketplace`, "Review in admin")}</p>`,
    ),
    params.reporterEmail ? { replyTo: params.reporterEmail } : undefined,
  );
}

/** Admin heads-up: a forum post is waiting in the mod queue (held link or auto-hidden by reports). */
export async function sendAdminForumQueue(params: { reason: "held" | "reported"; title: string; author: string }): Promise<void> {
  await send(
    adminInbox(),
    `Forum ${params.reason === "held" ? "post held for review" : "post auto-hidden by reports"} · ${params.title.slice(0, 80)}`,
    layout(
      params.reason === "held" ? "Forum post held" : "Forum post auto-hidden",
      `<ul>
        <li><strong>Thread:</strong> ${esc(params.title)}</li>
        <li><strong>Author:</strong> ${esc(params.author)}</li>
       </ul>
       <p>${btn(`${BASE}/admin/forum`, "Open the mod queue")}</p>`,
    ),
  );
}

/**
 * Forum: someone replied to your thread (lib/forum/notify). Only sent when
 * the member's forum_replies preference allows it; carries a one-click
 * unsubscribe for these emails only.
 */
export async function sendForumReplyEmail(
  to: string,
  p: { threadTitle: string; replierName: string; excerpt: string; url: string; unsubscribeUrl: string | null; lang: "en" | "fr" },
): Promise<void> {
  const fr = p.lang === "fr";
  const subject = fr ? `Nouvelle réponse : ${p.threadTitle.slice(0, 90)}` : `New reply: ${p.threadTitle.slice(0, 90)}`;
  const footer = [
    fr
      ? `Vous recevez ce courriel parce que vous avez lancé cette discussion sur le forum ${SITE.name}. Au plus un courriel par discussion toutes les 6 heures`
      : `You're getting this because you started this thread on the ${SITE.name} forum. At most one email per thread every 6 hours`,
    p.unsubscribeUrl ? `<a href="${p.unsubscribeUrl}" style="color:#64748b">${fr ? "Ne plus recevoir ces courriels" : "Turn off forum reply emails"}</a>` : null,
  ]
    .filter(Boolean)
    .join(". ");
  await send(
    to,
    subject,
    layout(
      fr ? "Nouvelle réponse à votre discussion" : "New reply to your thread",
      `<p>${fr ? `${esc(p.replierName)} a répondu à <strong>${esc(p.threadTitle)}</strong> :` : `${esc(p.replierName)} replied to <strong>${esc(p.threadTitle)}</strong>:`}</p>
       <blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #91F2CF;background:#F6F7FB;color:#334155">${esc(p.excerpt)}</blockquote>
       <p>${btn(p.url, fr ? "Lire et répondre" : "Read and reply")}</p>`,
      `${footer}.`,
      { lang: p.lang },
    ),
    p.unsubscribeUrl
      ? { "List-Unsubscribe": `<${p.unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined,
    { utm: "forum-replies" },
  );
}

/** Founding 500: the buyer's confirmation (Stripe sends the actual receipt). */
export async function sendFoundingLifetimeEmail(to: string): Promise<void> {
  await send(
    to,
    "You're a PMRFP Founding member: lifetime Trade Pro is active",
    layout(
      "Welcome, Founding member",
      `<p>Your one-time payment went through and your organization now has lifetime Trade Pro (for as long as PMRFP operates Trade Pro): full RFP access, matching alerts and saved opportunities. There is nothing to renew and no card on file to charge.</p>
       <p>${btn(`${BASE}/dashboard/rfps`, "Open the RFP board")}</p>
       <p style="font-size:14px">Not happy? Email us within 30 days for a full refund. The Founding 500 terms are at <a href="${BASE}/terms#founding-500">${BASE}/terms#founding-500</a>.</p>`,
      undefined,
      { referralPs: false },
    ),
    undefined,
    { utm: "founding" },
  );
}

/** Founding 500 problems that need a human: an oversold race, a double purchase, a failed grant. */
export async function sendAdminFoundingAlert(p: { reason: string; organizationId: string; email: string; sessionId: string }): Promise<void> {
  await sendToOwners(
    `Founding 500 needs a look: ${p.reason}`,
    layout(
      "Founding 500 alert",
      `<ul>
        <li><strong>Reason:</strong> ${esc(p.reason)}</li>
        <li><strong>Organization:</strong> ${esc(p.organizationId)}</li>
        <li><strong>Customer:</strong> ${esc(p.email)}</li>
        <li><strong>Checkout session:</strong> ${esc(p.sessionId)}</li>
       </ul>
       <p>Money taken means access granted, so act on refunds or follow-up by hand.</p>
       <p>${btn(`${BASE}/admin/subscriptions`, "View in admin")}</p>`,
    ),
  );
}

/**
 * The free weekly email and its double opt-in confirmation (lib/digest).
 * Subject, body and the CASL/CAN-SPAM footer are built (and tested) in
 * lib/digest/build; this only wraps them in the shared shell. No referral
 * P.S. (the reader may not be a member). The weekly email carries RFC 8058
 * one-click List-Unsubscribe headers.
 */
export async function sendDigestEmail(
  to: string,
  email: { subject: string; title: string; bodyHtml: string; footnoteHtml: string },
  lang: "en" | "fr" | "es",
  unsubscribeUrl?: string,
): Promise<void> {
  await send(
    to,
    email.subject,
    layout(email.title, email.bodyHtml, email.footnoteHtml, { referralPs: false, lang }),
    unsubscribeUrl
      ? { "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined,
    { utm: unsubscribeUrl ? "weekly-digest" : "digest-confirm" },
  );
}

/**
 * The weekly insights brief (lib/insights/email, cron/insights-brief behind
 * INSIGHTS_EMAIL_ENABLED) in the shared shell. Body and footer are built
 * and escaped in lib/insights/email; exported for the admin preview.
 */
export function insightsBriefHtml(email: { title: string; bodyHtml: string; footnoteHtml: string }, lang: "en" | "fr" | "es"): string {
  return layout(email.title, email.bodyHtml, email.footnoteHtml, { referralPs: false, lang });
}

export async function sendInsightsBrief(
  to: string,
  email: { subject: string; title: string; bodyHtml: string; footnoteHtml: string },
  lang: "en" | "fr" | "es",
  unsubscribeUrl: string | null,
): Promise<void> {
  await send(
    to,
    email.subject,
    insightsBriefHtml(email, lang),
    unsubscribeUrl
      ? { "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined,
    { utm: "insights-brief" },
  );
}

/** Is Resend configured (an email can actually go out)? */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * One lifecycle email (lib/lifecycle): plain text plus the simple HTML
 * wrapper, both already built and utm-tagged by lib/lifecycle/copy. Its own
 * sender ("R. Talkar · PMRFP"), replies to info@, RFC 8058 one-click
 * unsubscribe headers, and Resend tags so delivery events can be matched
 * back to the step. Returns Resend's email id (for opens / clicks, if
 * tracking is on in Resend) or the error; never throws.
 */
export async function sendLifecycleEmail(p: {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl: string | null;
  step: string;
}): Promise<{ ok: boolean; id: string | null; error?: string }> {
  const resend = client();
  if (!resend) {
    console.info(`[email:noop] lifecycle to=${p.to} subject="${p.subject}"`);
    return { ok: false, id: null, error: "RESEND_API_KEY not set" };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: p.from,
      to: p.to,
      replyTo: p.replyTo,
      subject: p.subject,
      text: p.text,
      html: p.html,
      ...(p.unsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${p.unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
      tags: [
        { name: "category", value: "lifecycle" },
        { name: "step", value: p.step.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) },
      ],
    });
    if (error) return { ok: false, id: null, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    console.error("[email] lifecycle send failed", err);
    return { ok: false, id: null, error: err instanceof Error ? err.message : "send failed" };
  }
}
