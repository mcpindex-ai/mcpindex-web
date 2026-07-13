import { ImageResponse } from 'next/og';

// Static OG card for the /scan PAGE (distinct from the dynamic per-scan share card
// at /scan/card, which carries counts). Generic + user-data-free by design: sharing
// the page URL must never leak anyone's scan. Satori: every multi-child node flexes.

export const alt = 'Scan your MCP setup - see your agent’s blast radius, free and in your browser';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#0a0a0a';
const AMBER = '#ea580c';
const MUTE = '#78716c';
const RULE = '#e7e5e4';

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
          <div style={{ display: 'flex', fontSize: '62px', fontWeight: 600, color: INK, lineHeight: 1.05 }}>
            See your agent’s blast radius.
          </div>
          <div style={{ display: 'flex', fontSize: '28px', color: MUTE, marginTop: '22px', maxWidth: '940px' }}>
            Paste your mcp.json. See which tools can take irreversible actions and which send data
            off your machine. Runs in your browser.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', border: `2px solid ${RULE}`, padding: '8px 18px', fontSize: '22px', color: MUTE }}>
            free
          </div>
          <div style={{ display: 'flex', fontSize: '22px', color: MUTE }}>
            deterministic contract-diff · nothing uploaded
          </div>
        </div>
      </div>
    ),
    size,
  );
}
