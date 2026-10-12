/**
 * The one sponsor unit for a page or email, ready to render: a PAID sponsor
 * that holds the slot (lib/sponsors/model), else a relevant house sponsor
 * (registry), else nothing. Pure, so the page components, emails and tests
 * share it.
 */
import { normalizeRegion, tradeSlug, type PaidSponsor, type Placement } from "./model";
import { pickSponsor, sponsorHref, type SponsorContext } from "./registry";

export interface SponsorUnit {
  /** /go/<id> slug. */
  id: string;
  name: string;
  logo: string | null;
  /** The label key (common.sponsor): every paid unit is "Sponsored". */
  label: "Sponsored" | "From our sister company";
  headline: string;
  body: string;
  cta: string;
  /** Tracked link (/go/<id>?p=…&t=…&r=…), relative unless a base was given. */
  href: string;
  paid: boolean;
  placement: Placement;
  /** Trade slug and province/state slug the unit counts under ("" when none). */
  trade: string;
  region: string;
}

export function pickSponsorUnit(ctx: SponsorContext, paid: readonly PaidSponsor[], lang = "en", base = ""): SponsorUnit | null {
  const picked = pickSponsor({ ...ctx, paid, lang });
  if (!picked) return null;
  const province = normalizeRegion(ctx.province);
  const region = province ? tradeSlug(province) : "";
  const { sponsor, creative, trade } = picked;
  return {
    id: sponsor.id,
    name: sponsor.name,
    logo: sponsor.logo,
    label: sponsor.label,
    headline: creative.headline,
    body: creative.body,
    cta: creative.cta,
    href: sponsorHref(sponsor.id, ctx.placement, trade || null, base, region || null),
    paid: sponsor.paid,
    placement: ctx.placement,
    trade,
    region,
  };
}
