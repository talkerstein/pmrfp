import { getCategories } from "@/lib/data/taxonomy";
import { bidAlertPlace } from "@/lib/digest/config";
import { getLang, getT } from "@/i18n/server";
import { localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { BidAlertForm } from "./bid-alert-form";

export type BidAlertSource = "rfp" | "winner" | "insights" | "benchmark";

/**
 * The one-field "Email me bids like this, free" box for RFP, contract-winner,
 * insights and benchmark pages. The visitor types only an email; the trade(s)
 * and province/state come from the page. It is a double opt-in weekly-email
 * sign-up (digest_subscribers, pending until confirmed) that links to the
 * account once the same address signs up (lib/digest/link).
 *
 * Why a subscriber record, not a magic-link account: it reuses the CASL
 * consent record and the one confirmation email we already have, and never
 * creates auth users for unconfirmed addresses. The box's success state and
 * the sign-up page (magic link or Google) carry them to a full account.
 *
 * Renders nothing when the page's place isn't a province/state we serve.
 * Reads only the cached taxonomy (safe on cached pages).
 */
export async function BidAlertBox({
  source,
  province,
  trades = [],
  signedIn = false,
  className,
}: {
  source: BidAlertSource;
  /** The page's province/state (full name or Canadian code). */
  province: string | null | undefined;
  /** English trade names (as stored on listings) or slugs. */
  trades?: string[];
  signedIn?: boolean;
  className?: string;
}) {
  const place = bidAlertPlace(province);
  if (!place) return null;
  const lang = getLang();
  const t = getT("growth");
  const categories = await getCategories().catch(() => []);
  const picked = categories.filter((c) => trades.includes(c.name) || trades.includes(c.slug)).slice(0, 3);
  const placeName = regionName(place.province, lang);
  const lead = picked[0]
    ? fmt(t.bidAlert.lead, { trade: tradeName(picked[0].name, lang).toLocaleLowerCase(lang), place: placeName })
    : fmt(t.bidAlert.leadPlace, { place: placeName });
  return (
    <div className={className ?? "dg-wrap"} data-section="bid-alert">
      <BidAlertForm
        source={`bid-alert-${source}`}
        lang={lang}
        country={place.country}
        province={place.province}
        trades={picked.map((c) => c.slug)}
        title={t.bidAlert.title}
        lead={lead}
        privacy={t.digest.privacy}
        accountHref={signedIn ? null : localizePath("/sign-up?role=trade", lang)}
        accountLabel={t.bidAlert.account}
      />
    </div>
  );
}
