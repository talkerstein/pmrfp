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
export function renderOgImage({ eyebrow, title, subline, caption }: OGTemplateProps): ImageResponse {
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
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                background: COLORS.teal,
                color: COLORS.indigo,
                fontWeight: 800,
                fontSize: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
              }}
            >
              P
            </div>
            <div
              style={{
                color: COLORS.paper,
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: -0.4,
              }}
            >
              PMRFP.com
            </div>
          </div>
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
