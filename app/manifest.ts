import type { MetadataRoute } from 'next';

// PWA manifest (served at /manifest.webmanifest, auto-linked by Next). Maskable
// icons are the seal on a dark tile; see public/brand/icon-*.png.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'mcpindex.ai',
    short_name: 'mcpindex',
    description:
      'In-path trust gate for MCP tool calls. Pins each contract and HOLDs when it silently changes—before your agent acts.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
