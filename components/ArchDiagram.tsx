// Inline SVG architecture diagram for /docs.
// Server component — no JS, no external assets, scales responsively.
// Editorial restraint: hairline borders, single accent color for arrows,
// mono labels for technical strings, sans for prose.

const FONT_MONO = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT_SANS = '"Geist Sans", ui-sans-serif, system-ui, sans-serif';

type Layer = {
  num: string;
  title: string;
  titleMono?: boolean;
  sub: string;
  arrowOutLabel?: string;
};

const REQUEST_FLOW: Layer[] = [
  { num: '01', title: 'Your IDE', sub: 'Claude Desktop · Cursor · Cline · Zed', arrowOutLabel: 'stdio' },
  { num: '02', title: 'mcp-server-mcpindex', titleMono: true, sub: 'npm package · MIT · 4 tools', arrowOutLabel: 'HTTPS' },
  { num: '03', title: '/api/v1/recommend', titleMono: true, sub: 'edge-cached · 60 req/min/IP · no key', arrowOutLabel: 'reads' },
  { num: '04', title: 'Recommendation engine', sub: 'search score × MCP Quality Score composite', arrowOutLabel: 'reads' },
  { num: '05', title: 'data/snapshot.json', titleMono: true, sub: '3,500+ servers, refreshed daily' },
];

// Geometry — picked to balance scannability and density
const VB_W = 1040;
const BOX_W = 440;
const BOX_H = 64;
const ARROW_H = 28;
const STRIDE = BOX_H + ARROW_H;
const COL_X = 120; // left edge of request column
const REFRESH_X = 600; // left edge of refresh box (right of column)
const REFRESH_W = 420;
const VB_H = REQUEST_FLOW.length * BOX_H + (REQUEST_FLOW.length - 1) * ARROW_H + 24;

export function ArchDiagram() {
  return (
    <figure className="my-8 overflow-x-auto">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label="mcpindex.ai architecture: request flow from IDE through MCP server to API to recommendation engine to snapshot, with daily refresh from registry.modelcontextprotocol.io via GitHub Actions"
        className="block w-full max-w-[860px] mx-auto"
        style={{ height: 'auto' }}
      >
        {/* Subtle dotted background grid in the empty top-right area to add texture */}
        <defs>
          <pattern id="dots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="0.6" fill="#e7e5e4" />
          </pattern>
        </defs>
        <rect x={REFRESH_X} y={0} width={VB_W - REFRESH_X} height={REFRESH_X / 2} fill="url(#dots)" opacity="0.6" />

        {/* Request-flow boxes + arrows */}
        {REQUEST_FLOW.map((layer, i) => {
          const y = i * STRIDE;
          return (
            <g key={layer.num}>
              <Box
                x={COL_X}
                y={y}
                w={BOX_W}
                num={layer.num}
                title={layer.title}
                titleMono={layer.titleMono}
                sub={layer.sub}
              />
              {layer.arrowOutLabel && (
                <Arrow
                  x={COL_X + BOX_W / 2}
                  y={y + BOX_H}
                  length={ARROW_H}
                  label={layer.arrowOutLabel}
                />
              )}
            </g>
          );
        })}

        {/* Refresh box — sits on same row as Snapshot (last box, index 4) */}
        <Box
          x={REFRESH_X}
          y={(REQUEST_FLOW.length - 1) * STRIDE}
          w={REFRESH_W}
          num="06"
          title="GitHub Actions @ 06:00 UTC"
          sub="pulls registry.modelcontextprotocol.io · healthcheck-gated · auto-commit"
        />

        {/* Horizontal "writes" arrow from box 06 (left edge) to box 05 (right edge) */}
        <HorizontalArrow
          fromX={REFRESH_X}
          toX={COL_X + BOX_W}
          y={(REQUEST_FLOW.length - 1) * STRIDE + BOX_H / 2}
          label="writes"
        />

        {/* Annotation under refresh box: registry source */}
        <text
          x={REFRESH_X + REFRESH_W / 2}
          y={(REQUEST_FLOW.length - 1) * STRIDE + BOX_H + 22}
          textAnchor="middle"
          fontFamily={FONT_MONO}
          fontSize={9.5}
          letterSpacing="0.16em"
          fill="#78716c"
        >
          ← ANTHROPIC + COMMUNITY
        </text>

        {/* Side-of-stack zone label */}
        <text
          x={COL_X + BOX_W + 18}
          y={20}
          fontFamily={FONT_MONO}
          fontSize={9}
          letterSpacing="0.18em"
          fill="#78716c"
        >
          REQUEST FLOW
        </text>
        <line
          x1={COL_X + BOX_W + 18}
          y1={28}
          x2={COL_X + BOX_W + 100}
          y2={28}
          stroke="#e7e5e4"
          strokeWidth={1}
        />
      </svg>
      <figcaption className="mt-3 text-center text-[11px] text-[--color-mute] font-mono uppercase tracking-[0.16em]">
        Fig. 01 · Architecture, top-down. Request flow synchronous; refresh async, daily.
      </figcaption>
    </figure>
  );
}

function Box({
  x,
  y,
  w,
  num,
  title,
  titleMono,
  sub,
}: {
  x: number;
  y: number;
  w: number;
  num: string;
  title: string;
  titleMono?: boolean;
  sub: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={BOX_H}
        fill="#ffffff"
        stroke="#0a0a0a"
        strokeWidth={1}
      />
      {/* Number marker — accent color, mono caps */}
      <text
        x={x + 14}
        y={y + 22}
        fontFamily={FONT_MONO}
        fontSize={10}
        letterSpacing="0.14em"
        fill="#ea580c"
        fontWeight="600"
      >
        {num}
      </text>
      {/* Title */}
      <text
        x={x + 14}
        y={y + 38}
        fontFamily={titleMono ? FONT_MONO : FONT_SANS}
        fontSize={titleMono ? 13 : 14}
        fontWeight={titleMono ? '500' : '600'}
        fill="#0a0a0a"
      >
        {title}
      </text>
      {/* Subtitle */}
      <text
        x={x + 14}
        y={y + 54}
        fontFamily={FONT_SANS}
        fontSize={11}
        fill="#78716c"
      >
        {sub}
      </text>
    </g>
  );
}

function Arrow({
  x,
  y,
  length,
  label,
}: {
  x: number;
  y: number;
  length: number;
  label: string;
}) {
  const tipY = y + length;
  return (
    <g>
      <line x1={x} y1={y + 2} x2={x} y2={tipY - 6} stroke="#ea580c" strokeWidth={1} />
      <polyline
        points={`${x - 4},${tipY - 6} ${x},${tipY - 1} ${x + 4},${tipY - 6}`}
        fill="none"
        stroke="#ea580c"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x={x + 12}
        y={y + length / 2 + 4}
        fontFamily={FONT_MONO}
        fontSize={9.5}
        letterSpacing="0.14em"
        fill="#78716c"
      >
        {label.toUpperCase()}
      </text>
    </g>
  );
}

function HorizontalArrow({
  fromX,
  toX,
  y,
  label,
}: {
  fromX: number;
  toX: number;
  y: number;
  label: string;
}) {
  // arrow points from fromX (right edge of refresh box) to toX (right edge of snapshot)
  // direction: writes flows from refresh INTO snapshot, so arrow tip is at the SNAPSHOT side (toX)
  const tipX = toX + 4;
  return (
    <g>
      <line x1={fromX - 1} y1={y} x2={tipX + 4} y2={y} stroke="#ea580c" strokeWidth={1} />
      <polyline
        points={`${tipX + 4},${y - 4} ${tipX - 1},${y} ${tipX + 4},${y + 4}`}
        fill="none"
        stroke="#ea580c"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x={(fromX + toX) / 2}
        y={y - 6}
        textAnchor="middle"
        fontFamily={FONT_MONO}
        fontSize={9.5}
        letterSpacing="0.14em"
        fill="#78716c"
      >
        {label.toUpperCase()}
      </text>
    </g>
  );
}
