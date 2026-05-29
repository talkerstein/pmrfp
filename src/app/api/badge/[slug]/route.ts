import { getBadgeInfo, type BadgeTier } from "@/lib/badge/data";

export const revalidate = 86400;

const C = {
  navy: "#0B1220",
  gold: "#B7791F",
  border: "#E2E8F0",
  white: "#FFFFFF",
  slate: "#64748B",
  light: "#CBD5E1",
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

function renderBadge(tier: BadgeTier, theme: "light" | "dark", variant: "standard" | "compact"): string {
  const dark = theme === "dark";
  const bg = dark ? C.navy : C.white;
  const stroke = dark ? "#1E293B" : C.border;
  const primary = dark ? C.white : C.navy;
  const sub = dark ? C.light : C.slate;
  const tile = dark ? C.gold : C.navy;
  const tileText = dark ? C.navy : C.gold;
  const font = "Inter, -apple-system, Segoe UI, Arial, sans-serif";
  const check = tier.verified ? "✓ " : "";
  const sublabel = `${check}${tier.label}${tier.insured ? " · Insured" : ""}`;

  if (variant === "compact") {
    const w = 188, h = 32;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="PMRFP ${escapeXml(tier.label)}">
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="6" fill="${bg}" stroke="${stroke}"/>
<rect x="6" y="6" width="20" height="20" rx="4" fill="${tile}"/>
<text x="16" y="20" font-family="${font}" font-size="9" font-weight="700" fill="${tileText}" text-anchor="middle">PM</text>
<text x="32" y="14" font-family="${font}" font-size="10.5" font-weight="700" fill="${primary}">PMRFP</text>
<text x="32" y="25" font-family="${font}" font-size="8.5" fill="${sub}">${escapeXml(sublabel)}</text>
</svg>`;
  }

  const w = 214, h = 54;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="PMRFP ${escapeXml(tier.label)}">
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="9" fill="${bg}" stroke="${stroke}"/>
<rect x="11" y="11" width="32" height="32" rx="7" fill="${tile}"/>
<text x="27" y="32" font-family="${font}" font-size="13" font-weight="700" fill="${tileText}" text-anchor="middle">PM</text>
<text x="53" y="25" font-family="${font}" font-size="13.5" font-weight="700" fill="${primary}">PMRFP</text>
<text x="53" y="41" font-family="${font}" font-size="10" font-weight="500" fill="${tier.verified ? C.gold : sub}">${escapeXml(sublabel)}</text>
</svg>`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const variant = url.searchParams.get("variant") === "compact" ? "compact" : "standard";

  const info = await getBadgeInfo(slug);
  const svg = renderBadge(info.tier, theme, variant);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
