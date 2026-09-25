import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
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

// Seeded demo companies removed from the live directory (2026-09-23). Each
// old profile URL goes to its trade's page, which has real vendors and live
// RFPs. Kept as config redirects so they answer with a real 301/308 before
// any page code runs.
// The page-level retiredVendorRedirect() stays as a fallback for future
// retirements until they're added here.
const retiredListingRedirects: { source: string; destination: string }[] = [
  ["northline-electrical", "/trades/electrical"],
  ["summit-mechanical-hvac", "/trades/hvac"],
  ["ironclad-roofing", "/trades/roofing"],
  ["pureclean-facility", "/trades/cleaning-janitorial"],
  ["gta-snowpro", "/trades/snow-removal"],
  ["apex-asphalt-concrete", "/trades/concrete-and-asphalt"],
  ["guardian-fire-safety", "/trades/fire-safety"],
  ["vista-glass-windows", "/trades/glass-and-windows"],
  ["toronto-painters", "/trades/painting"],
  ["northview-windows-doors", "/trades/glass-and-windows"],
].map(([slug, destination]) => ({ source: `/directory/${slug}`, destination }));

const nextConfig: NextConfig = {
  async redirects() {
    return [...legacyWordPressRedirects, ...retiredListingRedirects].map((r) => ({ ...r, permanent: true }));
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
      {
        // No framing by other sites, except the website widgets below.
        source: "/:path((?!embed/).*)",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // Website widgets (/embed/*) are made to be framed by any site. They're
        // read-only and never use the visitor's session, so there's nothing to
        // clickjack.
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        // The service worker must never be served stale (see Next's PWA guide).
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        // The widget loader other sites include: short cache so fixes reach them.
        source: "/embed.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
