import type { NextConfig } from "next";

// Security headers applied site-wide. CSP is intentionally compatible with
// Next.js App Router + Vercel Analytics/Speed Insights (inline bootstraps +
// va.vercel-scripts.com / vitals.vercel-insights.com).
//
// /embed.html AND /embed/<slug> are the public iframe surfaces (see app/demo and
// app/embed/[slug]) — they must remain frameable, so they are excluded from the
// site-wide source (overlapping sources merge; you cannot unset X-Frame-Options
// once set) and get their own CSP without frame-ancestors 'none' /
// X-Frame-Options.
//
// The /embed/ arm is load-bearing: this exclusion was written when the static
// /embed.html was the only embed surface. app/embed/[slug] arrived later (one
// player page per film) and is what every VideoObject names as its `embedUrl`,
// but it kept inheriting the site-wide frame-ancestors 'none' — so the one page
// whose entire job is to be embedded was the one page nobody could embed, and
// the structured data pointed at a URL that refuses to frame.
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
        // Everything except the public iframe embed surfaces. The `embed/`
        // alternative needs its trailing slash: without it this would also
        // exempt unrelated paths like /embedded-anything.
        source: "/((?!embed\\.html$|embed/).*)",
        headers: siteSecurityHeaders,
      },
      {
        source: "/embed.html",
        headers: embedSecurityHeaders,
      },
      {
        // One player page per film, declared as `embedUrl` in every VideoObject.
        // Same job as /embed.html, so the same exemption. Safe to frame: the page
        // is an unauthenticated <video> with no form, no state and no action a
        // clickjack could steal.
        source: "/embed/:slug*",
        headers: embedSecurityHeaders,
      },
      {
        // API surfaces (JSON, badges, the MCP endpoint) are for machines, not
        // the search index. Google was crawling ~15 of them into the
        // "Crawled - currently not indexed" bucket; an explicit noindex moves
        // them to "Excluded by noindex" so that report only shows real pages.
        // Headers-level (not robots.txt) on purpose: the URLs stay fetchable
        // by every consumer (GitHub badge proxy, MCP clients) - they just
        // never enter the index.
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        // The PDF and /whitepaper are one asset on two URLs, and Google was
        // indexing them separately: the PDF earned 292 impressions at avg
        // position 26.9 with zero clicks while the HTML page sat at 8.6 (GSC,
        // 3 months to 2026-08-01). A rel=canonical HTTP header is the only way
        // to state the relationship for a non-HTML file, and it CONSOLIDATES
        // the signal onto the page - X-Robots-Tag: noindex would have thrown
        // those impressions away instead.
        source: "/whitepaper.pdf",
        headers: [
          {
            key: "Link",
            value: '<https://mcpindex.ai/whitepaper>; rel="canonical"',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
