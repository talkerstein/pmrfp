/**
 * Default Open Graph image for any PMRFP page that doesn't override one
 * (home, /pricing, /for-trades, etc.). Brand intro card.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";

export const runtime = "edge";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;
export const alt = "PMRFP — Commercial property RFPs + trade directory, Canada-first";

export default function OG() {
  return renderOgImage({
    eyebrow: "Canada-first · Property RFPs",
    title: "Commercial property RFPs + trade directory, built for Canadian trades.",
    subline:
      "Property managers post RFPs free. Qualified trades get listed, see opportunities, and express interest.",
    caption: "pmrfp.com",
  });
}
