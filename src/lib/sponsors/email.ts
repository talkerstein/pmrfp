import type { PaidSponsor } from "./model";
import { pickSponsorUnit, type SponsorUnit } from "./pick";
import type { SponsorContext } from "./registry";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The email version of the sponsor slot: one labelled row under the matches,
 * or "" when no sponsor fits this reader's trade and province. The paid
 * sponsor holding the trade × province email slot wins; else a relevant
 * house sponsor. Links are tracked via /go. `onShown` is told about the unit
 * that went into the email (the crons count it as one impression).
 */
export function sponsorEmailBlock(
  ctx: SponsorContext,
  base: string,
  paid: readonly PaidSponsor[] = [],
  onShown?: (unit: SponsorUnit) => void,
): string {
  const unit = pickSponsorUnit(ctx, paid, "en", base);
  if (!unit) return "";
  onShown?.(unit);
  const logo = unit.logo ? (unit.logo.startsWith("http") ? unit.logo : `https://pmrfp.com${unit.logo}`) : null;
  const logoCell = logo
    ? `<td valign="top" style="padding:0 12px 0 0;"><a href="${esc(unit.href)}" rel="sponsored noopener"><img src="${esc(logo)}" width="40" height="40" alt="${esc(unit.name)}" style="display:block;border:1px solid #E6E8F0;border-radius:8px;"></a></td>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;border-top:1px solid #E6E8F0;">
  <tr><td style="padding:14px 0 0 0;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#94A3B8;">${esc(unit.label)}</td></tr>
  <tr><td style="padding:8px 0 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      ${logoCell}
      <td valign="top" style="font-size:14px;line-height:21px;color:#475569;">
        <a href="${esc(unit.href)}" rel="sponsored noopener" style="color:#1B1E45;font-weight:600;text-decoration:none;">${esc(unit.headline)}</a><br>
        ${esc(unit.body)} <a href="${esc(unit.href)}" rel="sponsored noopener" style="color:#0C7A5A;font-weight:600;">${esc(unit.cta)}</a>
      </td>
    </tr></table>
  </td></tr>
</table>`;
}
