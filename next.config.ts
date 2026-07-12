import type { NextConfig } from "next";

// Security headers applied site-wide. CSP is intentionally compatible with
// Next.js App Router + Vercel Analytics/Speed Insights (inline bootstraps +
// va.vercel-scripts.com / vitals.vercel-insights.com).
//
// /embed.html is the public iframe surface (see app/demo) — it must remain
// frameable, so it is excluded from the site-wide source (overlapping sources
// merge; you cannot unset X-Frame-Options once set) and gets its own CSP
// without frame-ancestors 'none' / X-Frame-Options.
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
  // Ghost paths seen in Analytics (bots/typos) — send humans to real surfaces.
  async redirects() {
    return [
      { source: "/products", destination: "/", permanent: true },
      { source: "/method", destination: "/methodology", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // Everything except the public iframe embed surface.
        source: "/((?!embed\\.html$).*)",
        headers: siteSecurityHeaders,
      },
      {
        source: "/embed.html",
        headers: embedSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
