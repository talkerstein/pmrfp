/**
 * Shared brand-styled Open Graph image template.
 *
 * Renders a 1200×630 image used by /opengraph-image, /rfps/[slug]/opengraph-image,
 * /rfp-templates/[slug]/opengraph-image, /cost-guides/[slug]/opengraph-image.
 *
 * Visual: indigo background (PMRFP brand), large title in white, eyebrow tag in
 * teal small caps, optional region/meta line in muted indigo, PMRFP wordmark
 * bottom-left, hairline teal accent rule bottom-right.
 *
 * No external fonts to keep the OG endpoint cold-start fast — uses Vercel's
 * built-in fallback sans-serif. The visual identity carries via color + layout.
 */

import { ImageResponse } from "next/og";
import { WORDMARK_WHITE_URI } from "./wordmark";
import type { OgLogo } from "./logo";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;

const COLORS = {
  indigo: "#282B59",
  indigoDeep: "#1E2147",
  teal: "#91F2CF",
  tealInk: "#0C7A5A",
  paper: "#FFFFFF",
  paperDim: "rgba(255,255,255,0.72)",
  paperFaint: "rgba(255,255,255,0.4)",
} as const;

export interface OGTemplateProps {
  /** Small-caps tag above the title, e.g. "RFP · Toronto". */
  eyebrow: string;
  /** Main headline. Auto-truncated visually via two-line clamp. */
  title: string;
  /** Optional sub-line below title (e.g. "Closes Jul 15, 2026"). */
  subline?: string;
  /** Optional bottom-right caption (e.g. trade name or region). */
  caption?: string;
}

/**
 * Render the JSX → PNG via ImageResponse. Caller passes the props for their
 * specific page; the visual treatment stays consistent across all OG images.
 */
export function renderOgImage({ eyebrow, title: rawTitle, subline, caption }: OGTemplateProps): ImageResponse {
  // A U+FFFD from a broken feed makes the renderer fetch a font for it, which
  // 400s and takes the whole image down.
  const title = rawTitle.replace(/�/g, "");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `linear-gradient(135deg, ${COLORS.indigo} 0%, ${COLORS.indigoDeep} 100%)`,
          color: COLORS.paper,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        {/* Top: eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            color: COLORS.teal,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          <div style={{ width: 36, height: 2, background: COLORS.teal }} />
          {eyebrow.length > 60 ? eyebrow.slice(0, 57) + "…" : eyebrow}
        </div>

        {/* Middle: title + subline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 1040 }}>
          <div
            style={{
              fontSize: title.length > 80 ? 64 : title.length > 50 ? 76 : 88,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
              color: COLORS.paper,
              display: "block",
            }}
          >
            {title.length > 140 ? title.slice(0, 137) + "…" : title}
          </div>
          {subline && (
            <div
              style={{
                fontSize: 28,
                fontWeight: 400,
                lineHeight: 1.35,
                color: COLORS.paperDim,
              }}
            >
              {subline.length > 120 ? subline.slice(0, 117) + "…" : subline}
            </div>
          )}
        </div>

        {/* Bottom: PMRFP wordmark left, optional caption right */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            color: COLORS.paperDim,
            fontSize: 22,
            fontWeight: 600,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WORDMARK_WHITE_URI} height={42} alt="PMRFP" />
          {caption && (
            <div
              style={{
                color: COLORS.paperFaint,
                fontSize: 22,
                fontWeight: 500,
                maxWidth: 540,
                textAlign: "right",
              }}
            >
              {caption.length > 80 ? caption.slice(0, 77) + "…" : caption}
            </div>
          )}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

export interface CompanyOGProps {
  name: string;
  /** From loadOgLogo. Null shows `initials` on a teal tile instead. */
  logo: OgLogo | null;
  initials: string;
  /** Small-caps line under the name, e.g. "Supplier · Concord, Ontario". */
  eyebrow: string;
  /** Optional line under the eyebrow, e.g. the company's trades. */
  subline?: string;
  /** Optional bottom-right caption, e.g. years in business. */
  caption?: string;
}

/**
 * Share card for one company, built around its logo. Slack shows only the
 * middle square of the image as a small thumbnail, so the logo and name stay
 * inside the central 630px. The wordmark and caption sit just outside it: they
 * show on full-size previews and never get cut in half on a cropped one.
 */
export function renderCompanyOgImage({ name: rawName, logo, initials, eyebrow, subline, caption }: CompanyOGProps): ImageResponse {
  const clean = (text: string, max: number) => {
    const t = text.replace(/�/g, "");
    return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : t;
  };
  const name = clean(rawName, 70);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${COLORS.indigo} 0%, ${COLORS.indigoDeep} 100%)`,
          color: COLORS.paper,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        {logo ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 264,
              minWidth: 264,
              padding: 24,
              borderRadius: 28,
              background: COLORS.paper,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} width={logo.width} height={logo.height} alt="" />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 216,
              height: 216,
              borderRadius: 28,
              background: COLORS.teal,
              color: COLORS.indigo,
              fontSize: 96,
              fontWeight: 700,
            }}
          >
            {initials}
          </div>
        )}

        <div
          style={{
            display: "block",
            maxWidth: 620,
            marginTop: 26,
            fontSize: name.length > 44 ? 40 : name.length > 26 ? 48 : 60,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1,
            textAlign: "center",
          }}
        >
          {name}
        </div>
        <div
          style={{
            display: "flex",
            maxWidth: 620,
            marginTop: 16,
            color: COLORS.teal,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {clean(eyebrow, 40)}
        </div>
        {subline && (
          <div style={{ display: "flex", maxWidth: 620, marginTop: 10, color: COLORS.paperDim, fontSize: 24, textAlign: "center" }}>
            {clean(subline, 46)}
          </div>
        )}

        <div style={{ display: "flex", position: "absolute", left: 48, bottom: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WORDMARK_WHITE_URI} height={34} alt="PMRFP" />
        </div>
        {caption && (
          <div
            style={{
              display: "flex",
              position: "absolute",
              right: 48,
              bottom: 44,
              maxWidth: 236,
              color: COLORS.paperFaint,
              fontSize: 20,
              fontWeight: 500,
              textAlign: "right",
            }}
          >
            {clean(caption, 30)}
          </div>
        )}
      </div>
    ),
    OG_SIZE,
  );
}
