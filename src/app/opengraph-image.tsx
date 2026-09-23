/**
 * Default Open Graph image for any PMRFP page that doesn't override one
 * (home, /pricing, /for-trades, etc.). Brand intro card.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";

export const runtime = "edge";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;
export const alt = "PMRFP — commercial property RFPs and public tenders across Canada and the U.S.";

export default function OG() {
  return renderOgImage({
    eyebrow: "Canada & U.S. · Updated daily",
    title: "Property RFPs & public tenders on one board.",
    subline: "Snow, HVAC, roofing, cleaning, electrical and more. Trades get listed free. Property managers post free.",
    caption: "RFP board + trade directory",
  });
}
