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
  // Inline the (small, Tailwind-atomic) stylesheet into <head> instead of a
  // render-blocking <link>. The CSS chunk was the whole critical-request chain
  // after the document (~11.7 KiB, +1 RTT before first paint). CSP already
  // permits style-src 'unsafe-inline', so this needs no header change.
  experimental: {
    inlineCss: true,
  },
  // Ghost paths seen in Analytics (bots/typos) — send humans to real surfaces.
  async redirects() {
    return [
      { source: "/products", destination: "/", permanent: true },
      { source: "/method", destination: "/methodology", permanent: true },
      // Pricing page retired while we are not charging — keep old links alive.
      // The :path* rule matters: the bare rule matches "/pricing" EXACTLY, so
      // /pricing/opengraph-image (which Google has indexed, with its cache-busting
      // query) fell through to a 404 and landed in Search Console's Redirect error
      // bucket. Keep both — a catch-all alone does not match the bare path.
      { source: "/pricing", destination: "/", permanent: true },
      { source: "/pricing/:path*", destination: "/", permanent: true },
      // The hosted MCP endpoint is served at /api/mcp (mcp-handler's basePath must match
      // the served path, which is why the /mcp REWRITE was dropped — see
      // app/api/[transport]/route.ts). A REDIRECT is a different mechanism and is safe
      // here: `permanent` emits 308, which preserves method AND body, so a client that
      // POSTs JSON-RPC to /mcp follows through to /api/mcp intact. Before this, /mcp —
      // the URL people actually guess and that external directories link — was a 404.
      { source: "/mcp", destination: "/api/mcp", permanent: true },
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
