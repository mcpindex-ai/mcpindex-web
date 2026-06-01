import { ImageResponse } from 'next/og';

// The social card IS a Verdict Card - the brand object propagated to the OG
// surface (replaces the prior generic text card). A real DENY example, stated
// honestly. Satori constraints: every multi-child node sets display:flex.
export const alt = 'mcpindex - a verdict on whether a tool does what it claims, before your agent acts';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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
        {/* wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              display: 'flex',
              width: '44px',
              height: '44px',
              border: '3px solid #0a0a0a',
              borderRadius: '9px',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                width: '18px',
                height: '9px',
                background: '#ea580c',
                borderRadius: '2px',
              }}
            />
          </div>
          <div style={{ display: 'flex', fontSize: '30px', color: '#0a0a0a', fontWeight: 600 }}>
            mcpindex.ai
          </div>
        </div>

        {/* the verdict card */}
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
                background: '#fef2f2',
                color: '#b91c1c',
                border: '2px solid #fca5a5',
                padding: '8px 24px',
                fontSize: '36px',
                fontWeight: 700,
                letterSpacing: '2px',
              }}
            >
              DENY
            </div>
            <div style={{ display: 'flex', fontSize: '22px', color: '#78716c', letterSpacing: '2px' }}>
              STATUS EVALUATED
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: '30px', color: '#0f172a', marginTop: '30px', lineHeight: 1.35 }}>
            Hidden instruction to read ~/.ssh/id_rsa and exfiltrate it. The agent should not invoke.
          </div>
        </div>

        {/* tagline */}
        <div style={{ display: 'flex', fontSize: '30px', color: '#0a0a0a', lineHeight: 1.3 }}>
          A verdict on whether a tool does what it claims, before your agent acts.
        </div>
      </div>
    ),
    size,
  );
}
