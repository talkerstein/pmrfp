import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

// Derive the Supabase storage hostname from the public URL for next/image
// remotePatterns. Falls back to a permissive `*.supabase.co` if unset.
const SUPABASE_HOSTNAME = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
})();

// Legacy WordPress URLs still sitting in Google's index from the pre-Next.js
// pmrfp.com. Every one of them currently 404s, so the crawler keeps spending
// budget on dead paths and any equity they held is dropped on the floor.
// Map each to its closest live equivalent — topical match where we know the
// old listing's trade, hub page otherwise.
//
// Deliberately NOT redirected: the 2019-era spam paths on this domain
// (/goatmilk/*, /Dairy/*, /milk/*, and the random alphanumeric /a1b234/*.html
// pattern) from a prior owner. Those should stay 404 — funnelling known spam
// URLs into real pages passes exactly the association we don't want.
const legacyWordPressRedirects = [
  // WP Directory Kit RFP listings → the trade hub that matches the old job.
  { source: "/wdk-listing/hvac-system-replacement", destination: "/trades/hvac" },
  {
    source: "/wdk-listing/kitchen-and-bathroom-renovations",
    destination: "/trades/general-contracting",
  },
  // Everything else falls back to the relevant hub.
  { source: "/wdk-listing/:slug", destination: "/rfps" },
  { source: "/listing/:slug", destination: "/directory" },
  { source: "/listing-locations/:slug", destination: "/regions" },
  { source: "/listing-category/:slug", destination: "/trades" },
  // WP author archives and the old dashboard page have no equivalent.
  { source: "/author-public-:n", destination: "/" },
  { source: "/project-management-dashboard-2", destination: "/" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return legacyWordPressRedirects.map((r) => ({ ...r, permanent: true }));
  },
  images: {
    // Allow next/image to optimize Supabase-hosted assets (logos, RFP photos,
    // future trade portfolio images). Vercel's image optimizer fronts these
    // with long-cache WebP variants — solves Supabase's `Cache-Control: no-cache`
    // default at the edge.
    remotePatterns: SUPABASE_HOSTNAME
      ? [{ protocol: "https", hostname: SUPABASE_HOSTNAME, pathname: "/storage/v1/object/public/**" }]
      : [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
    // Optimized output cached for 1 year at Vercel's edge.
    minimumCacheTTL: 31536000,
  },
  async headers() {
    return [
      {
        // Apply to every route.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
