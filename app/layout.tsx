import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://mcpindex.ai'),
  title: {
    default: 'mcpindex.ai — the agent-native index of MCP servers',
    template: '%s · mcpindex.ai',
  },
  description:
    'Built for IDEs and agents that find the right MCP server at inference time, not the developer browsing a sidebar.',
  openGraph: {
    title: 'mcpindex.ai — the agent-native index of MCP servers',
    description:
      'Recommendation engine and drop-in MCP server for finding the right MCP at inference time.',
    url: 'https://mcpindex.ai',
    siteName: 'mcpindex.ai',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'mcpindex.ai',
    description: 'The agent-native index of MCP servers.',
  },
  alternates: {
    types: {
      'application/rss+xml': 'https://mcpindex.ai/changelog.rss',
    },
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-white text-zinc-900 selection:bg-amber-200/60 flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
