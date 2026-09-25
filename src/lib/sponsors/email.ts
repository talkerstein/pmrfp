import { pickSponsor, sponsorHref, type SponsorContext } from "./registry";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The email version of the sponsor slot: one labelled row under the matches,
 * or "" when no sponsor fits this reader's trade. Links are tracked via /go.
 */
export function sponsorEmailBlock(ctx: SponsorContext, base: string): string {
  const picked = pickSponsor(ctx);
  if (!picked) return "";
  const { sponsor, creative } = picked;
  const href = sponsorHref(sponsor.id, ctx.placement, ctx.categories?.[0], base);
  const logo = `https://pmrfp.com${sponsor.logo}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;border-top:1px solid #E6E8F0;">
  <tr><td style="padding:14px 0 0 0;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#94A3B8;">${esc(sponsor.label)}</td></tr>
  <tr><td style="padding:8px 0 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" style="padding:0 12px 0 0;"><a href="${href}" rel="sponsored noopener"><img src="${logo}" width="40" height="40" alt="${esc(sponsor.name)}" style="display:block;border:1px solid #E6E8F0;border-radius:8px;"></a></td>
      <td valign="top" style="font-size:14px;line-height:21px;color:#475569;">
        <a href="${href}" rel="sponsored noopener" style="color:#1B1E45;font-weight:600;text-decoration:none;">${esc(creative.headline)}</a><br>
        ${esc(creative.body)} <a href="${href}" rel="sponsored noopener" style="color:#0C7A5A;font-weight:600;">${esc(creative.cta)}</a>
      </td>
    </tr></table>
  </td></tr>
</table>`;
}
