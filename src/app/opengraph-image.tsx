/**
 * Default Open Graph image for any PMRFP page that doesn't override one
 * (home, /pricing, /for-trades, etc.). Brand intro card.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";

export const runtime = "edge";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;
export const alt = "PMRFP — Commercial & residential property RFPs + trade directory";

export default function OG() {
  return renderOgImage({
    eyebrow: "Now live in the GTA · Property RFPs",
    title: "Commercial & residential property RFPs + a focused trade directory.",
    subline:
      "Property managers post RFPs free. Qualified trades get listed, see opportunities, and express interest.",
    caption: "pmrfp.com",
  });
}
