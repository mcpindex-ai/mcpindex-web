import { ImageResponse } from 'next/og';

// The /demo social card, on the brand system (R2-M7). The prior static
// /promo/og.jpg was off-system: a near-black/ink background while every other
// card is white/paper, and "90 seconds." rendered entirely in amber as generic
// emphasis (amber is reserved for the verdict token ONLY). This dynamic card
// matches the root opengraph-image: white paper, ink type, the amber #ea580c
// reserved for the ⬡ HELD verdict token, the bracket Mark wordmark.
// Satori constraints: every multi-child node sets display:flex.
export const alt =
  'mcpindex - watch the in-path gate hold a silent tool-contract change, in 90 seconds';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#0a0a0a';
const AMBER = '#ea580c';
const MUTE = '#78716c';
const RULE = '#e7e5e4';

export default function DemoOpengraphImage() {
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
              {/* ⬡ as inline SVG - the glyph font is not fetchable in next/og */}
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
            Pin a tool, apply a silent change, watch the in-path gate hold the call before your agent acts.
          </div>
        </div>

        {/* headline */}
        <div style={{ display: 'flex', fontSize: '30px', color: INK, lineHeight: 1.3, maxWidth: '1010px' }}>
          Watch the gate hold a silent change, in 90 seconds.
        </div>
      </div>
    ),
    size,
  );
}
