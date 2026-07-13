import { ImageResponse } from 'next/og';

// Shareable scan card. Carries AGGREGATE COUNTS ONLY (?tools&irrev&egress&unpinned),
// never tool names or schemas, so it is safe to make public. Satori constraint:
// every multi-child node sets display:flex; the mark is inline SVG (no glyph fonts).
// (This is a route handler, not the opengraph-image file convention, so `alt`/
// `contentType` exports would be inert; ImageResponse sets the content type itself.)

const INK = '#0a0a0a';
const AMBER = '#ea580c';
const MUTE = '#78716c';
const RULE = '#e7e5e4';

function clampInt(raw: string | null): number {
  const n = parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n >= 0 && n <= 9999 ? n : 0;
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: '28px 30px',
        borderLeft: `2px solid ${RULE}`,
        background: accent ? '#fff7ed' : '#ffffff',
      }}
    >
      <div style={{ display: 'flex', fontSize: '92px', fontWeight: 600, color: accent ? AMBER : INK, lineHeight: 1 }}>
        {n}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: '14px',
          fontSize: '20px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: MUTE,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tools = clampInt(searchParams.get('tools'));
  const irrev = clampInt(searchParams.get('irrev'));
  const egress = clampInt(searchParams.get('egress'));
  const unpinned = clampInt(searchParams.get('unpinned'));

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#ffffff',
          padding: '70px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <svg width="46" height="46" viewBox="0 0 40 40" fill="none">
            <path d="M15 8 H10 V32 H15" stroke={INK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M25 8 H30 V32 H25" stroke={INK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="15" y="18" width="10" height="4" rx="1.8" fill={AMBER} />
          </svg>
          <div style={{ display: 'flex', fontSize: '30px', color: INK, fontWeight: 600 }}>
            mcpindex<span style={{ color: MUTE }}>.ai</span>
            <span style={{ color: MUTE, fontWeight: 400 }}>/scan</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: '34px', color: INK, marginBottom: '22px', maxWidth: '900px' }}>
            What my agent can actually do
          </div>
          <div style={{ display: 'flex', border: `2px solid ${RULE}` }}>
            <Stat n={tools} label="tools" />
            <Stat n={irrev} label="can’t be undone" />
            <Stat n={egress} label="off-machine" />
            <Stat n={unpinned} label="unpinned" accent />
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: '22px', color: MUTE, letterSpacing: '1px' }}>
          deterministic contract-diff · scan yours free at mcpindex.ai/scan
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // Output is a pure function of 4 clamped ints -> safe to cache hard so unfurlers
      // and the inline sample card don't re-render Satori on every hit.
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    },
  );
}
