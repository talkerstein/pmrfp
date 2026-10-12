import { getSponsorSnapshot } from "@/lib/sponsors/data";
import { pickSponsorUnit } from "@/lib/sponsors/pick";
import type { SponsorContext } from "@/lib/sponsors/registry";
import { getLang, getT } from "@/i18n/server";
import { SponsorCard } from "./sponsor-card";
import { SponsorSeen } from "./sponsor-seen";

/**
 * One labelled sponsor card, or nothing: the paid sponsor that holds this
 * trade × province slot, else a relevant house sponsor. Reads the shared
 * cached sponsor snapshot (no per-request query). Clicks go through
 * /go/<id>; impressions are counted when the card is on screen.
 * Never render it on dashboards, auth, pricing, billing or checkout pages
 * (lib/sponsors/model EXCLUDED_ROUTES).
 */
export async function SponsorSlot({ ctx, className }: { ctx: SponsorContext; className?: string }) {
  const lang = getLang();
  const unit = pickSponsorUnit(ctx, ctx.paid ?? (await getSponsorSnapshot()), lang);
  if (!unit) return null;
  const label = getT("common").sponsor[unit.label];
  return (
    <SponsorCard unit={unit} label={label} className={className}>
      <SponsorSeen s={unit.id} p={unit.placement} t={unit.trade} r={unit.region} />
    </SponsorCard>
  );
}
