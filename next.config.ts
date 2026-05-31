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

const nextConfig: NextConfig = {
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
