import { ImageResponse } from 'next/og';

// The root social card leads with the WEDGE: the in-path gate holding a silent
// contract change. The verdict token is the amber HELD chip + the hexagon (⬡)
// banner motif - amber #ea580c is reserved for the verdict token by brand rule.
// (Per-server share cards keep red/green in lib/og VerdictOg; the root hero does
// not - it sells the gate, not a directory verdict.)
// Satori constraints: every multi-child node sets display:flex.
export const alt =
  'mcpindex - the in-path trust gate that holds a tool call before your agent acts on a silent contract change';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#0a0a0a';
const AMBER = '#ea580c';
const MUTE = '#78716c';

export default function OpengraphImage() {
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
          padding: '76px',
        }}
      >
        {/* wordmark: bracket mark + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <svg width="46" height="46" viewBox="0 0 40 40" fill="none">
            <path d="M15 8 H10 V32 H15" stroke={INK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M25 8 H30 V32 H25" stroke={INK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="15" y="18" width="10" height="4" rx="1.8" fill={AMBER} />
          </svg>
          <div style={{ display: 'flex', fontSize: '30px', color: INK, fontWeight: 600 }}>
            mcpindex<span style={{ color: MUTE }}>.ai</span>
          </div>
        </div>

        {/* the HOLD card - the ⬡ banner + the amber HELD verdict token */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            border: '2px solid #e7e5e4',
            padding: '40px',
            boxShadow: '0 24px 60px -24px rgba(10,10,10,0.22)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: '#fff7ed',
                color: AMBER,
                border: `2px solid ${AMBER}`,
                padding: '8px 24px',
                fontSize: '36px',
                fontWeight: 700,
                letterSpacing: '2px',
              }}
            >
              {/* ⬡ as inline SVG — the glyph font is not fetchable in next/og */}
              <svg width="30" height="34" viewBox="0 0 30 34" fill="none">
                <path
                  d="M15 2 L27 9 V25 L15 32 L3 25 V9 Z"
                  stroke={AMBER}
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                />
              </svg>
              HELD
            </div>
            <div style={{ display: 'flex', fontSize: '22px', color: MUTE, letterSpacing: '2px' }}>
              CONTRACT CHANGED VS YOUR PIN
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: '30px', color: '#0f172a', marginTop: '30px', lineHeight: 1.35 }}>
            A tool silently added a required <span style={{ color: AMBER }}>&nbsp;owner&nbsp;</span> param. The gate held the call before the agent ran it.
          </div>
        </div>

        {/* headline */}
        <div style={{ display: 'flex', fontSize: '30px', color: INK, lineHeight: 1.3, maxWidth: '1010px' }}>
          The tool your agent trusted on Monday can change on Tuesday - silently. mcpindex holds the call before your agent acts.
        </div>
      </div>
    ),
    size,
  );
}
