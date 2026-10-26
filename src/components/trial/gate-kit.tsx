import type { ReactNode } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { SessionContext } from "@/lib/access/access";
import { gateOffer, whoFromSession, type GateOffer } from "@/lib/entitlement/gate";
import { trialsOpen } from "@/lib/entitlement/server";
import type { TrialSource } from "@/lib/entitlement/trial";
import { ProGateCta } from "./pro-gate-cta";

/**
 * One call per page that has Pro gates: resolve once whether trials are on
 * and who is looking, then ask for a button wherever the page used to link
 * straight to paid billing.
 *
 *   const gate = await gateKit(session, { returnPath: "/benchmarks/roofing/ontario", paidHref });
 *   {gate.btn("benchmark", t.lockedCta, "btn mint lg")}
 */
export async function gateKit(
  session: SessionContext | null,
  opts: { returnPath: string; paidHref: string; plansHref?: string },
): Promise<{
  offer: (source: TrialSource) => GateOffer;
  btn: (source: TrialSource, paidLabel: string, className?: string, extra?: { showPlans?: boolean; plansClassName?: string; stacked?: boolean }) => ReactNode;
}> {
  const open = isSupabaseConfigured() ? await trialsOpen().catch(() => false) : false;
  const who = whoFromSession(session, open);
  const offer = (source: TrialSource) => gateOffer(who, { source, returnPath: opts.returnPath, paidHref: opts.paidHref, plansHref: opts.plansHref });
  return {
    offer,
    btn: (source, paidLabel, className, extra = {}) => (
      <ProGateCta offer={offer(source)} source={source} returnTo={opts.returnPath} paidLabel={paidLabel} className={className} {...extra} />
    ),
  };
}
