// LAUNCH CONTENT - this tree is launch-state copy (everything BUILT = LIVE),
// published in lockstep with the deploy per the PUBLISH-COUPLING rule. It ships
// only on GB's explicit go-live. See /LAUNCH-CONTENT.md at the repo root and
// ~/mcpindex-launch/value-prop-bible.md for the (A) deploy-held / (B) maturity-
// held framing the copy and the honesty guard conform to.
import type { Metadata, Viewport } from 'next';
// Self-hosted Geist (bundled woff2) - NOT next/font/google. next/font/google fetches the font
// files from Google AT BUILD; a transient socket drop there fails the whole Vercel build with
// UND_ERR_SOCKET (errorStep direct:build). The woff2 files come from the `geist` package so the
// build has zero outbound font dependency, but we declare them ourselves instead of importing
// `geist/font/*`: the package hardcodes font-display: swap (and adjustFontFallback: false for
// mono), which cost 0.232 CLS on the hero h1 when the fonts swapped in (Lighthouse 2026-08-02).
// display: 'optional' removes the swap - same-origin + preload means the real font is ready at
// first paint on effectively every visit; on the rare cold slow load the fallback just stays.
// Variable names ('--font-geist-sans'/'-mono') match globals.css, so no CSS change is needed.
import localFont from 'next/font/local';

const GeistSans = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'optional',
});

const GeistMono = localFont({
  src: '../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'optional',
  // No preload: preload + display:optional makes Chrome hold first render
  // while the file is in flight, so this 71KB woff2 sat on the first-paint
  // critical path of every page even though mono only sets small labels.
  // Measured on the live site 2026-08-17 (Lighthouse 13, slow-4G simulation):
  // homepage scored 93 with LCP 2.8s / Speed Index 3.6s; the same run with
  // the mono request blocked scored 98 with LCP 2.4s / Speed Index 1.0s, and
  // with both fonts blocked scored 100 (LCP 1.4s). Sans keeps its preload -
  // it is the hero face. Cold visits render mono in the fallback stack below
  // (which slow connections already got under display:optional); warm visits
  // hit the HTTP cache and paint real GeistMono as before.
  preload: false,
  adjustFontFallback: false,
  fallback: [
    'ui-monospace',
    'SFMono-Regular',
    'Roboto Mono',
    'Menlo',
    'Monaco',
    'Liberation Mono',
    'DejaVu Sans Mono',
    'Courier New',
    'monospace',
  ],
});
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

// SERP coverage note (2026-07-29): the title carries the literal category phrase
// "MCP servers" and the description carries the "MCP server index" bigram - GSC
// showed we matched neither the two-token "mcp index" query nor the category term.
// Title stays gate-led (gate-first positioning); the index claim lives in the
// description. Keep title <=~60 chars, description <=~160.
const SITE_DESCRIPTION =
  'The drift-monitored MCP server index with an in-path trust gate: pins each tool contract and HOLDs when it silently changes - before your agent acts.';

export const metadata: Metadata = {
  metadataBase: new URL('https://mcpindex.ai'),
  title: {
    default: 'mcpindex - the trust gate for MCP servers and agent tool calls',
    template: '%s · mcpindex.ai',
  },
  description: SITE_DESCRIPTION,
  // Root openGraph/twitter carry ONLY site-wide defaults (siteName, card, site).
  // Next.js merges metadata shallowly and does NOT derive og:title/description from a
  // page's own title/description, so putting the homepage's og:title/description/url
  // here made EVERY subpage that omits openGraph inherit them verbatim - shares of
  // /install, /docs, /trust rendered and attributed as the homepage. The homepage's own
  // OG now lives in app/page.tsx; other pages set theirs via lib/seo.ts `pageMetadata`,
  // and pages that set none fall back to their own <title>/<meta description> (correct).
  openGraph: {
    siteName: 'mcpindex.ai',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@mcpindex',
  },
  alternates: {
    canonical: 'https://mcpindex.ai',
    languages: {
      en: 'https://mcpindex.ai',
      'x-default': 'https://mcpindex.ai',
    },
    types: {
      'application/rss+xml': 'https://mcpindex.ai/changelog.rss',
    },
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#ea580c',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-white text-zinc-900 flex flex-col">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
