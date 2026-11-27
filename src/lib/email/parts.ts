/** Small pieces shared by email builders (same look as lib/email/send.ts). */

export const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";

/** Escape member-typed text for an HTML email. */
export function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const LINK =
  /\b(?:https?:\/\/|www\.)\S+|(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|ca|net|org|info|biz|co|io|us|app|site|online|xyz|top|click|link|shop|store)\b(?:\/\S*)?/gi;

/** For text a stranger can have us send to any address. Email addresses stay. */
export function removeLinks(s: string): string {
  return s.replace(LINK, "[link removed]");
}

export function emailButton(href: string, label: string): string {
  return `<a class="btn-a" href="${href}" style="display:inline-block;background:#282B59;color:#FFFFFF;padding:14px 26px;border-radius:10px;text-decoration:none;font-family:${EMAIL_FONT};font-size:16px;line-height:20px;font-weight:600">${label}</a>`;
}

/** A grey box (quotes, notes, contact cards). */
export function emailBox(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 16px;background:#F6F7FB;border-radius:10px;"><tr><td style="padding:14px 16px;font-size:15px;line-height:23px;color:#1B1E45;">${inner}</td></tr></table>`;
}
