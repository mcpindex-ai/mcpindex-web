import type { NextConfig } from "next";

// Security headers applied site-wide. CSP is intentionally compatible with
// Next.js App Router + Vercel Analytics/Speed Insights (inline bootstraps +
// va.vercel-scripts.com / vitals.vercel-insights.com).
//
// /embed.html is the public iframe surface (see app/demo) — it must remain
// frameable, so it gets CSP without frame-ancestors 'none' and without
// X-Frame-Options. Everything else is DENY / frame-ancestors 'none'.
const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "upgrade-insecure-requests",
];

const siteCsp = [...cspDirectives, "frame-ancestors 'none'"].join("; ");
const embedCsp = cspDirectives.join("; ");

const siteSecurityHeaders = [
  { key: "Content-Security-Policy", value: siteCsp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const embedSecurityHeaders = [
  { key: "Content-Security-Policy", value: embedCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/embed.html",
        headers: embedSecurityHeaders,
      },
      {
        source: "/:path*",
        headers: siteSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
