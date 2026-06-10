/**
 * Share card for /sign-up — the link Rishon blasts to trades over WhatsApp.
 * Bold, audience-neutral (image routes can't read query params), with the
 * free/no-card promise front and centre. Reuses the brand OG template.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";

export const runtime = "nodejs";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;
export const alt = "Join PMRFP — free, no credit card";

export default async function OG() {
  return renderOgImage({
    eyebrow: "Founding members · Free to join",
    title: "Get found. Win building work.",
    subline: "Property managers post projects. Vetted trades bid. No credit card.",
    caption: "pmrfp.com/sign-up",
  });
}
