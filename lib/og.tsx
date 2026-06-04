// Shared social-card (OG) template so every route's share image is consistent.
// Returns a JSX element for next/og ImageResponse. Satori constraints: every
// multi-child node sets display:flex; colors are explicit hex (no CSS vars).
const INK = '#0a0a0a';
const AMBER = '#ea580c';
const ZINC = '#a8a29e';
const RULE = '#e7e5e4';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

// Per-server verdict card for share images. decision = null renders the
// fail-closed "not yet screened" state (never a fake green).
const DECISION_OG: Record<string, { bg: string; fg: string; bd: string }> = {
  ALLOW: { bg: '#ecfdf5', fg: '#047857', bd: '#6ee7b7' },
  DENY: { bg: '#fef2f2', fg: '#b91c1c', bd: '#fca5a5' },
  REVIEW: { bg: '#fffbeb', fg: '#b45309', bd: '#fcd34d' },
};

export function VerdictOg({
  title,
  name,
  decision,
  rationale,
}: {
  title: string;
  name: string;
  decision: 'ALLOW' | 'DENY' | 'REVIEW' | null;
  rationale: string;
}) {
  const screened = decision !== null;
  const d = screened ? DECISION_OG[decision] : { bg: '#fafaf9', fg: '#57534e', bd: RULE };
  const chip = screened ? decision : 'NOT YET SCREENED';
  const body = screened
    ? rationale
    : 'No verdict on file yet. An agent should treat this tool as not-yet-cleared and fall back to its own checks. Coverage rolls out adversarial-first.';
  const clipped = body.length > 150 ? body.slice(0, 147) + '...' : body;

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff', padding: '72px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <svg width="44" height="44" viewBox="0 0 40 40" fill="none">
          <path d="M15 8 H10 V32 H15" stroke={INK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M25 8 H30 V32 H25" stroke={INK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="15" y="18" width="10" height="4" rx="1.8" fill={AMBER} />
        </svg>
        <div style={{ display: 'flex', fontSize: '27px', color: INK, fontWeight: 600 }}>
          mcpindex<span style={{ color: ZINC }}>.ai</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: '20px', color: ZINC, marginBottom: '14px' }}>{name}</div>
        <div style={{ display: 'flex', fontSize: '52px', color: INK, fontWeight: 600, lineHeight: 1.1, maxWidth: '1000px' }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: d.bg, color: d.fg, border: `2px solid ${d.bd}`, padding: '8px 22px', fontSize: '30px', fontWeight: 700, letterSpacing: '2px' }}>
            {chip}
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: '23px', color: '#57534e', marginTop: '22px', lineHeight: 1.4, maxWidth: '980px' }}>{clipped}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', borderTop: `1px solid ${RULE}`, paddingTop: '20px' }}>
        <div style={{ display: 'flex', width: '34px', height: '8px', borderRadius: '3px', background: AMBER }} />
        <div style={{ display: 'flex', fontSize: '18px', color: ZINC }}>A verdict before your agent acts · mcpindex.ai</div>
      </div>
    </div>
  );
}

export function BrandOg({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
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
          mcpindex<span style={{ color: ZINC }}>.ai</span>
        </div>
      </div>

      {/* the message */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: '20px', color: AMBER, letterSpacing: '4px', marginBottom: '20px' }}>
          {eyebrow.toUpperCase()}
        </div>
        <div style={{ display: 'flex', fontSize: '60px', color: INK, fontWeight: 600, lineHeight: 1.1, maxWidth: '1000px' }}>
          {title}
        </div>
        <div style={{ display: 'flex', fontSize: '27px', color: '#57534e', marginTop: '24px', lineHeight: 1.35, maxWidth: '940px' }}>
          {sub}
        </div>
      </div>

      {/* footer rule */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', borderTop: `1px solid ${RULE}`, paddingTop: '22px' }}>
        <div style={{ display: 'flex', width: '34px', height: '8px', borderRadius: '3px', background: AMBER }} />
        <div style={{ display: 'flex', fontSize: '19px', color: ZINC }}>
          The in-path trust gate that holds a call before your agent acts on a silent change.
        </div>
      </div>
    </div>
  );
}
