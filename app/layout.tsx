// LAUNCH CONTENT - this tree is launch-state copy (everything BUILT = LIVE),
// published in lockstep with the deploy per the PUBLISH-COUPLING rule. It ships
// only on GB's explicit go-live. See /LAUNCH-CONTENT.md at the repo root and
// ~/mcpindex-launch/value-prop-bible.md for the (A) deploy-held / (B) maturity-
// held framing the copy and the honesty guard conform to.
import type { Metadata, Viewport } from 'next';
// Self-hosted Geist (bundled woff2) - NOT next/font/google. next/font/google fetches the font
// files from Google AT BUILD; a transient socket drop there fails the whole Vercel build with
// UND_ERR_SOCKET (errorStep direct:build). The `geist` package ships the same fonts locally, so
// the build has zero outbound font dependency. Variable names ('--font-geist-sans'/'-mono') are
// the package defaults and match globals.css, so no CSS change is needed.
// next/font/local (used by geist) defaults to font-display: swap - do not add next/font/google.
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

const SITE_DESCRIPTION =
  'In-path trust gate for MCP tool calls. Pins each contract and HOLDs when it silently changes-before your agent acts. Zero credentials.';

export const metadata: Metadata = {
  metadataBase: new URL('https://mcpindex.ai'),
  title: {
    default: 'mcpindex - the in-path trust gate for agent tool calls',
    template: '%s · mcpindex.ai',
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: 'mcpindex - the in-path trust gate for agent tool calls',
    description:
      'The tool your agent trusted on Monday can change on Tuesday - silently. mcpindex holds the call before your agent acts on the change.',
    url: 'https://mcpindex.ai',
    siteName: 'mcpindex.ai',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@mcpindex',
    title: 'mcpindex - the in-path trust gate for agent tool calls',
    description:
      'The tool your agent trusted on Monday can change on Tuesday - silently. mcpindex holds the call before your agent acts on the change.',
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
