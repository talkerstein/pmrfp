import { Resend } from "resend";
import { COPY, SITE } from "@/lib/site";

/**
 * Transactional email via Resend. No-ops (logs) when RESEND_API_KEY is unset
 * so the app runs without email configured. All member-facing emails carry
 * the no-guarantee disclaimer where relevant (§14, §18).
 */

const FROM = process.env.RESEND_FROM_EMAIL || "PMRFP <info@pmrfp.com>";
const ADMIN = process.env.ADMIN_NOTIFICATION_EMAIL || "info@pmrfp.com";
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
): Promise<void> {
  const resend = client();
  if (!resend) {
    console.info(`[email:noop] to=${to} subject="${subject}"`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html, ...(headers ? { headers } : {}) });
  } catch (err) {
    console.error("[email] send failed", err);
  }
}

function layout(title: string, bodyHtml: string, footnote?: string): string {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#282B59">
    <div style="padding:20px 0;border-bottom:1px solid #e2e8f0">
      <span style="font-weight:700;font-size:18px;color:#282B59">PMRFP</span>
    </div>
    <div style="padding:24px 0">
      <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:16px 0;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
      ${footnote ? `<p style="margin:0 0 8px">${footnote}</p>` : ""}
      <p style="margin:0 0 8px">
        <strong style="color:#0C7A5A">P.S.</strong> Know a trade or a project?
        <a href="${BASE}/refer" style="color:#282B59;font-weight:600;text-decoration:underline">Refer them — earn up to $75</a>
        when they list on PMRFP.
      </p>
      <p style="margin:0">${SITE.name} · Commercial &amp; residential property RFPs, by region · ${BASE}</p>
    </div>
  </div>`;
}

const btn = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#282B59;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${label}</a>`;

export async function sendWelcomeEmail(to: string, name?: string): Promise<void> {
  await send(
    to,
    "Welcome to PMRFP",
    layout(
      `Welcome${name ? `, ${name}` : ""}`,
      `<p>Thanks for joining PMRFP. Two quick next steps:</p>
       <ol><li>Complete your company profile so property decision-makers can find you.</li>
       <li>Activate your Trade Pro membership to view full RFP opportunities.</li></ol>
       <p>${btn(`${BASE}/dashboard`, "Go to your dashboard")}</p>`,
      "PMRFP provides visibility and opportunity access — not guaranteed work.",
    ),
  );
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
  );
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
  await send(
    ADMIN,
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

export async function sendMatchingRfpAlert(
  to: string,
  rfp: { title: string; slug: string; region?: string | null; category?: string | null; deadline?: string | null },
): Promise<void> {
  await send(
    to,
    `New PMRFP Opportunity: ${rfp.title}`,
    layout(
      rfp.title,
      `<p>A new opportunity matching your profile was posted:</p>
       <ul>
         ${rfp.category ? `<li><strong>Category:</strong> ${rfp.category}</li>` : ""}
         ${rfp.region ? `<li><strong>Region:</strong> ${rfp.region}</li>` : ""}
         ${rfp.deadline ? `<li><strong>Closes:</strong> ${rfp.deadline}</li>` : ""}
       </ul>
       <p>${btn(`${BASE}/rfps/${rfp.slug}`, "View opportunity")}</p>`,
      COPY.disclaimer,
    ),
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

export async function sendInterestConfirmation(to: string, rfpTitle: string): Promise<void> {
  await send(
    to,
    `Interest Submitted: ${rfpTitle}`,
    layout(
      "Your interest was submitted",
      `<p>We received your interest in <strong>${rfpTitle}</strong>. PMRFP and the property manager (if attached) will receive your submission.</p>`,
      COPY.interestDisclaimer,
    ),
  );
}

export async function sendAdminNewRfp(rfp: { title: string; postedBy?: string; region?: string | null; category?: string | null }): Promise<void> {
  await send(
    ADMIN,
    "New RFP Pending Review",
    layout(
      "New RFP pending review",
      `<ul>
        <li><strong>Title:</strong> ${rfp.title}</li>
        ${rfp.postedBy ? `<li><strong>Posted by:</strong> ${rfp.postedBy}</li>` : ""}
        ${rfp.category ? `<li><strong>Category:</strong> ${rfp.category}</li>` : ""}
        ${rfp.region ? `<li><strong>Region:</strong> ${rfp.region}</li>` : ""}
       </ul>
       <p>${btn(`${BASE}/admin/rfps`, "Review in admin")}</p>`,
    ),
  );
}

/**
 * Notify the PM who posted the RFP that a new vendor expressed interest.
 * (Quest 1.7) Without this, vendors express interest and the PM never knows —
 * deal dies in silence. This is the single highest-leverage notification on
 * the platform.
 */
export async function sendPmNewInterest(
  to: string,
  params: { vendorName: string; rfpTitle: string; rfpId: string },
): Promise<void> {
  await send(
    to,
    `New vendor interested: ${params.rfpTitle}`,
    layout(
      "A vendor expressed interest",
      `<p><strong>${params.vendorName}</strong> is interested in your RFP:</p>
       <p style="font-weight:600;font-size:16px;margin:8px 0 16px">${params.rfpTitle}</p>
       <p>Review their full message + capability statement, and contact them directly if it's a fit.</p>
       <p>${btn(`${BASE}/pm-dashboard/rfps/${params.rfpId}/interests`, "View vendor interest")}</p>`,
      COPY.interestDisclaimer,
    ),
  );
}

export async function sendAdminNewInterest(params: { vendor: string; rfpTitle: string; message: string }): Promise<void> {
  await send(
    ADMIN,
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

export async function sendPmRfpPublished(to: string, rfp: { title: string; slug: string }): Promise<void> {
  await send(
    to,
    "Your PMRFP Listing is Published",
    layout(
      "Your RFP is published",
      `<p>Your RFP <strong>${rfp.title}</strong> is now live on PMRFP. Interested vendors can express interest, and you'll be able to review them.</p>
       <p>${btn(`${BASE}/rfps/${rfp.slug}`, "View your listing")}</p>`,
      COPY.disclaimer,
    ),
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
    ADMIN,
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
    ADMIN,
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

export async function sendAdminContactEmail(params: { name: string; email: string; requestType: string; message: string }): Promise<void> {
  await send(
    ADMIN,
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
    upgradeUrl: string;
    unsubscribeUrl: string;
    mailingAddress: string;
  },
): Promise<void> {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const list = params.items
    .map(
      (i) =>
        `<li style="margin:0 0 10px"><a href="${BASE}/rfps/${i.slug}" style="color:#282B59;font-weight:600">${esc(i.title)}</a>` +
        `<br><span style="color:#64748b;font-size:13px">${i.deadline ? `Closes ${i.deadline}` : "Ongoing — no fixed closing date"}</span></li>`,
    )
    .join("");
  const more = params.count > params.items.length ? `<p>…and ${params.count - params.items.length} more on the board.</p>` : "";
  const noun = params.count === 1 ? "tender" : "tenders";
  await send(
    to,
    `${params.count} new ${params.tradeLabel} ${noun} this week`,
    layout(
      `${params.count} new ${params.tradeLabel} ${noun} this week`,
      `<p>These public tenders matching your trade were posted in the last 7 days:</p>
       <ul style="padding-left:18px">${list}</ul>${more}
       <p>Trade Pro gets you the direct link to each official notice, the full scope and buyer contact,
       and an email the day a new one lands in your trade — instead of checking government portals yourself.</p>
       <p>${btn(params.upgradeUrl, "See Trade Pro")}</p>`,
      `You're receiving this because you have a free ${SITE.name} company profile. ` +
        `<a href="${params.unsubscribeUrl}" style="color:#64748b">Unsubscribe from opportunity emails</a>. ` +
        `${SITE.name}, ${esc(params.mailingAddress)} · ${SITE.email}`,
    ),
    {
      "List-Unsubscribe": `<${params.unsubscribeUrl}>, <mailto:${SITE.email}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  );
}

/** "Email me this RFP" from the RFP Writer — the draft, plus a one-click path to post it. */
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
): Promise<void> {
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const para = (s: string) => `<p style="white-space:pre-wrap;margin:0 0 16px;line-height:1.5">${esc(s)}</p>`;
  const list = (items: string[]) =>
    `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.5">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  const h = (s: string) => `<h2 style="font-size:15px;margin:20px 0 8px;color:#282B59">${s}</h2>`;
  await send(
    to,
    `Your RFP: ${rfp.title}`,
    layout(
      esc(rfp.title),
      `${para(rfp.summary)}
       ${h("Scope")}${para(rfp.scope)}
       ${h("Requirements")}${para(rfp.requirements)}
       ${h("Submission instructions")}${para(rfp.submissionInstructions)}
       ${h("How bids will be evaluated")}${list(rfp.evaluationCriteria)}
       ${h("Questions for bidders")}${list(rfp.questionsForBidders)}
       <p style="margin:24px 0 8px">Ready to get bids? Post it on PMRFP free — qualified trades in your region see it, and you stay anonymous until you choose to engage.</p>
       ${btn(`${BASE}/rfp-writer?post=1`, "Post this RFP free")}`,
      "You're getting this because you asked the PMRFP RFP Writer to email you a copy. Review it before sending to bidders — it's a starting draft, not legal advice.",
    ),
  );
}
