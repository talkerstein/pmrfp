import { getSession, type SessionContext } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import type { CountryCode } from "@/lib/visitor-geo";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import type { CtaState, IntelCtx } from "@/components/intel/views";
import { INTEL_LAUNCH_PRICING, intelPayable, intelPrice } from "./pricing";
import { intelMoney } from "./format";

export interface IntelViewer {
  ctx: IntelCtx;
  /** Has Award Intelligence: may see the full data. */
  intel: boolean;
  /** The country this page shows (country-first; ?country= switches). */
  country: CountryCode;
  province: string | null;
  session: SessionContext | null;
}

/**
 * Who is looking at an /intel page and what they may see. The ONE gate is
 * session.hasIntelAccess (lib/entitlement/intel via loadSessionContext).
 * Demo mode (no Supabase) shows the full view unless ?view=locked or
 * ?view=signed-out, like the benchmark pages.
 */
export async function loadIntelViewer(opts: { lang: Locale; countryParam?: string | null; view?: string | null; next: string }): Promise<IntelViewer> {
  const configured = isSupabaseConfigured();
  const session = configured ? await getSession() : null;
  const intel = configured ? Boolean(session?.hasIntelAccess) : opts.view !== "locked" && opts.view !== "signed-out";
  const signedIn = configured ? Boolean(session) : opts.view !== "signed-out";
  const visitor = await getVisitorCountry({ param: opts.countryParam, session });
  // Prices are always in the visitor's own currency, even while viewing the other country.
  const billing = opts.countryParam ? (await getVisitorCountry({ session })).country : visitor.country;
  const plan = (iv: "monthly" | "annual") => {
    const p = intelPrice(iv, billing);
    return { price: intelMoney(p.amount, p.currency, opts.lang), payable: intelPayable(iv, billing) };
  };
  const cta: CtaState = {
    signedIn,
    hasOrg: configured ? Boolean(session?.organization) : true,
    intel,
    country: visitor.country,
    monthly: plan("monthly"),
    annual: plan("annual"),
    launch: INTEL_LAUNCH_PRICING,
    next: opts.next,
  };
  return {
    ctx: { lang: opts.lang, t: getDictionary(opts.lang).intel, cta },
    intel,
    country: visitor.country,
    province: visitor.province ?? null,
    session,
  };
}
