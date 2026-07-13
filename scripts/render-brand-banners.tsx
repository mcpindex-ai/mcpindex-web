/**
 * Regenerate static brand banners under public/brand/ to match the live gate wedge.
 * Run: npx tsx scripts/render-brand-banners.tsx
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { ImageResponse } from 'next/og';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'brand');

const INK = '#0a0a0a';
const MUTE = '#78716c';
const CITE = '#57534e';
const AMBER = '#ea580c';
const RULE = '#e7e5e4';

const TAGLINE =
  'The in-path trust gate for agent tool calls. Pins each contract and HOLDs the call when it drifts.';
const TOKENS = 'HOLD · FAIL-CLOSED · ZERO EGRESS';

type BannerOpts = {
  width: number;
  height: number;
  padX: number;
  padY: number;
  mark: number;
  nameSize: number;
  tagSize: number;
  tokenSize: number;
  tagMax: number;
};

function banner(opts: BannerOpts) {
  const { width, height, padX, padY, mark, nameSize, tagSize, tokenSize, tagMax } = opts;
  return new ImageResponse(
    h(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#ffffff',
          padding: `${padY}px ${padX}px`,
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: Math.round(mark * 0.35),
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: Math.round(mark * 0.42),
            },
          },
          h(
            'svg',
            { width: mark, height: mark, viewBox: '0 0 40 40', fill: 'none' },
            h('path', {
              d: 'M15 8 H10 V32 H15',
              stroke: INK,
              strokeWidth: '3.6',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }),
            h('path', {
              d: 'M25 8 H30 V32 H25',
              stroke: INK,
              strokeWidth: '3.6',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }),
            h('rect', { x: '15', y: '18', width: '10', height: '4', rx: '1.8', fill: AMBER }),
          ),
          h(
            'div',
            {
              style: {
                display: 'flex',
                fontSize: nameSize,
                color: INK,
                fontWeight: 600,
                letterSpacing: '-0.02em',
              },
            },
            'mcpindex',
            h('span', { style: { color: MUTE } }, '.ai'),
          ),
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: tagSize,
              color: CITE,
              lineHeight: 1.35,
              maxWidth: tagMax,
              fontWeight: 400,
            },
          },
          TAGLINE,
        ),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            borderTop: `1px solid ${RULE}`,
            paddingTop: 22,
          },
        },
        h('div', {
          style: { width: 18, height: 3, background: AMBER, borderRadius: 2 },
        }),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: tokenSize,
              color: MUTE,
              letterSpacing: '0.18em',
              fontWeight: 500,
              textTransform: 'uppercase',
            },
          },
          TOKENS,
        ),
      ),
    ),
    { width, height },
  );
}

const targets: Array<BannerOpts & { file: string }> = [
  {
    file: 'github-readme.png',
    width: 1280,
    height: 400,
    padX: 72,
    padY: 56,
    mark: 56,
    nameSize: 44,
    tagSize: 26,
    tokenSize: 18,
    tagMax: 980,
  },
  {
    file: 'x-header.png',
    width: 1500,
    height: 500,
    padX: 88,
    padY: 72,
    mark: 64,
    nameSize: 50,
    tagSize: 28,
    tokenSize: 20,
    tagMax: 1120,
  },
  {
    file: 'linkedin-banner.png',
    width: 1584,
    height: 396,
    padX: 88,
    padY: 52,
    mark: 52,
    nameSize: 42,
    tagSize: 24,
    tokenSize: 17,
    tagMax: 1180,
  },
];

async function main() {
  for (const t of targets) {
    const { file, ...opts } = t;
    const res = banner(opts);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(OUT, file), buf);
    console.log(`wrote ${file} (${buf.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
