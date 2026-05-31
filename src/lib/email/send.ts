import { Resend } from "resend";
import { COPY, SITE } from "@/lib/site";

/**
 * Transactional email via Resend. No-ops (logs) when RESEND_API_KEY is unset
 * so the app runs without email configured. All member-facing emails carry
 * the no-guarantee disclaimer where relevant (§14, §18).
 */

const FROM = process.env.RESEND_FROM_EMAIL || "PMRFP <hello@pmrfp.com>";
const ADMIN = process.env.ADMIN_NOTIFICATION_EMAIL || "admin@pmrfp.com";
const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com";

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const resend = client();
  if (!resend) {
    console.info(`[email:noop] to=${to} subject="${subject}"`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
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
      <p style="margin:0">${SITE.name} · ${SITE.country}-first commercial property RFP network · ${BASE}</p>
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
         <li>When they activate <strong>Trade Pro</strong> and stay active for <strong>90 days</strong>, you earn a <strong>$75 CAD finder&apos;s fee</strong>, paid by e-transfer within 7 days. The 90-day window keeps the program sustainable on both sides.</li>
       </ol>
       <p>You'll get a monthly summary of all your referred trades — no chasing required.</p>
       <p>Questions? Reply to this email.</p>`,
      "Finder's fees are paid after the referred trade activates Trade Pro and remains active for 90 days. PMRFP does not guarantee subscription or revenue outcomes.",
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
