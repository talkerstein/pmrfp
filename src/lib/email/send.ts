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
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0b1220">
    <div style="padding:20px 0;border-bottom:1px solid #e2e8f0">
      <span style="font-weight:700;font-size:18px;color:#0b1220">PMRFP</span>
    </div>
    <div style="padding:24px 0">
      <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:16px 0;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
      ${footnote ? `<p style="margin:0 0 8px">${footnote}</p>` : ""}
      <p style="margin:0">${SITE.name} · ${SITE.country}-first commercial property RFP network · ${BASE}</p>
    </div>
  </div>`;
}

const btn = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#0b1220;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${label}</a>`;

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
