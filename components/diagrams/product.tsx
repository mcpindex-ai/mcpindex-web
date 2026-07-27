import { PACKAGES } from '@/lib/install/manifest';
import {
  Canvas,
  Box,
  M,
  S,
  ArrowD,
  HoldGlyph,
  Rule,
  FootNote,
  INK,
  RULE,
  FAINT,
  GHOST,
  MUTE,
  CITE,
  ACCENT,
  ACCENT_TEXT,
  ACCENT_SOFT,
  ON_INK,
} from './primitives';

/* D-08 - Two jobs, two packages ---------------------------------------------- */

export function DTwoJobsTwoPackages() {
  const row = (x: number, y: number, k: string, v: string, emphasise = false) => (
    <g key={`${x}-${k}`}>
      <M x={x} y={y} caps size={10} fill={MUTE}>
        {k}
      </M>
      {emphasise ? (
        <>
          <HoldGlyph x={x + 82} y={y - 4} stroke={ACCENT_TEXT} scale={0.85} />
          <S x={x + 108} y={y} size={13.5} weight="600">
            {v}
          </S>
        </>
      ) : (
        <S x={x + 82} y={y} size={13.5}>
          {v}
        </S>
      )}
    </g>
  );

  return (
    <Canvas id="two-jobs-two-packages" w={1000} h={340}>
      <line x1={500} y1={16} x2={500} y2={212} stroke={RULE} strokeWidth={1} />

      <M x={20} y={34} caps size={10.5} fill={ACCENT_TEXT}>
        JOB 1 &middot; THE GATE
      </M>
      <Rule x1={20} x2={470} y={46} stroke={INK} />
      <rect x={20} y={64} width={216} height={32} fill={INK} />
      <M x={34} y={86} size={12.5} fill={ON_INK}>
        {PACKAGES.gateBinary}
      </M>
      <M x={250} y={86} caps size={10}>
        PYPI &middot; UV / PIP
      </M>
      {row(20, 130, 'RUNS', 'in your call path')}
      {row(20, 160, 'CAN', 'HOLD a call', true)}
      {row(20, 190, 'CANNOT', 'tell you what to install')}

      <M x={530} y={34} caps size={10.5} fill={MUTE}>
        JOB 2 &middot; THE DIRECTORY CLIENT
      </M>
      <Rule x1={530} x2={980} y={46} stroke={INK} />
      <rect x={530} y={64} width={276} height={32} fill={INK} />
      <M x={544} y={86} size={12.5} fill={ON_INK}>
        {PACKAGES.directoryServer}
      </M>
      <M x={820} y={86} caps size={10}>
        NPM &middot; OR REMOTE
      </M>
      {row(530, 130, 'RUNS', 'beside your agent, as an MCP server')}
      {row(530, 160, 'CAN', 'search · recommend · look up a verdict')}
      {row(530, 190, 'CANNOT', 'stop a call')}

      <rect x={20} y={228} width={960} height={42} fill={ACCENT_SOFT} stroke={ACCENT} strokeWidth={1.5} />
      <M x={500} y={254} anchor="middle" size={12} fill={ACCENT_TEXT} caps>
        INSTALLING JOB 2 DOES NOT INSTALL JOB 1. DIFFERENT PACKAGE, DIFFERENT JOB.
      </M>

      <Rule x1={20} x2={980} y={300} />
      <M x={20} y={324} size={12} fill={INK}>
        {PACKAGES.sdkTs} &middot; {PACKAGES.mastra}
      </M>
      <S x={980} y={324} anchor="end" size={12.5} fill={MUTE}>
        embed either job in your own code
      </S>
    </Canvas>
  );
}

/* D-11 - Blast radius -------------------------------------------------------- */

const GRADE_ROWS: [string, string, string][] = [
  ['ACTION', 'read', 'delete'],
  ['TOUCHES', 'documents', 'a repository'],
  ['REVERSIBLE', 'nothing to undo', 'not reversible'],
  ['EGRESS', 'stays on this machine', 'stays on this machine'],
];

export function DBlastRadius() {
  return (
    <Canvas id="blast-radius" w={1000} h={372}>
      <M x={20} y={30} caps size={10}>
        TO YOUR AGENT, BOTH OF THESE ARE JUST &ldquo;A TOOL CALL&rdquo;
      </M>

      <Box x={220} y={46} w={300} h={44} tone="shade" />
      <M x={240} y={74} size={13} fill={INK}>
        search_docs(query)
      </M>
      <Box x={600} y={46} w={300} h={44} tone="shade" />
      <M x={620} y={74} size={13} fill={INK}>
        delete_repo(name)
      </M>

      <ArrowD x={370} y1={90} y2={112} stroke={FAINT} />
      <ArrowD x={750} y1={90} y2={112} stroke={FAINT} />

      {GRADE_ROWS.map(([k, a, b], i) => {
        const y = 138 + i * 30;
        return (
          <g key={k}>
            <Rule x1={20} x2={980} y={y - 18} />
            <M x={20} y={y} caps size={9.5} fill={MUTE}>
              {k}
            </M>
            <S x={240} y={y} size={12.5} fill={CITE}>
              {a}
            </S>
            <S x={620} y={y} size={12.5} fill={i === 2 ? ACCENT_TEXT : CITE} weight={i === 2 ? '600' : undefined}>
              {b}
            </S>
          </g>
        );
      })}

      <Rule x1={20} x2={980} y={244} stroke={INK} />
      <M x={20} y={268} caps size={9.5} fill={ACCENT_TEXT}>
        AUTONOMY CEILING
      </M>
      <Box x={220} y={250} w={300} h={38} tone="shade" />
      <S x={240} y={274} size={13} weight="600">
        autonomous
      </S>
      <Box x={600} y={250} w={300} h={38} tone="accent" />
      <S x={620} y={274} size={13} weight="600">
        ask a human
      </S>

      <Rule x1={20} x2={980} y={306} />
      <S x={20} y={324} size={11.5} fill={MUTE}>
        Deterministic and static, read from the tool&rsquo;s own declared contract &mdash; it does not run the tool.
      </S>
      <S x={20} y={341} size={11.5} fill={MUTE}>
        Ambiguous contracts grade toward the more dangerous class, never down. Advisory: mcpindex
      </S>
      <S x={20} y={358} size={11.5} fill={MUTE}>
        labels the blast radius, your agent or IDE decides.
      </S>
    </Canvas>
  );
}

/* D-13 - Category map -------------------------------------------------------- */

const CATEGORIES: { x: number; y: number; label: string; sub: string; us?: boolean }[] = [
  { x: 252, y: 268, label: 'static scanner', sub: 'reads the server once' },
  { x: 430, y: 196, label: 'allow-list / auth', sub: 'gates identity, not the contract' },
  { x: 648, y: 196, label: 'API gateway', sub: 'gates the network, contract-blind' },
  { x: 838, y: 268, label: 'audit log', sub: 'tells you after' },
  { x: 648, y: 108, label: 'in-path trust gate', sub: 'contract-aware, can HOLD', us: true },
];

export function DCategoryMap() {
  return (
    <Canvas id="category-map" w={1000} h={380}>
      <rect x={236} y={70} width={734} height={240} fill="#ffffff" stroke={RULE} strokeWidth={1} />

      {/* y axis: capability */}
      {(
        [
          [108, 'HOLD', 'stops the call before it runs'],
          [196, 'BLOCK', 'stops traffic, not the contract'],
          [284, 'ADVISE', 'tells you, cannot intervene'],
        ] as [number, string, string][]
      ).map(([y, label, sub]) => (
        <g key={label}>
          <Rule x1={236} x2={970} y={y + 26} />
          <M x={224} y={y} anchor="end" caps size={10} fill={label === 'HOLD' ? ACCENT_TEXT : MUTE}>
            {label}
          </M>
          <S x={224} y={y + 15} anchor="end" size={10} fill={GHOST}>
            {sub}
          </S>
        </g>
      ))}
      <M x={20} y={44} caps size={10} fill={INK}>
        WHAT IT CAN DO
      </M>

      {/* x axis: timing */}
      {(
        [
          [328, 'BEFORE INSTALL'],
          [512, 'AT INSTALL'],
          [696, 'IN THE CALL PATH'],
          [880, 'AFTER'],
        ] as [number, string][]
      ).map(([x, label]) => (
        <M key={label} x={x} y={332} anchor="middle" caps size={9.5}>
          {label}
        </M>
      ))}
      <M x={603} y={356} anchor="middle" caps size={10} fill={INK}>
        WHEN IT ACTS
      </M>

      {CATEGORIES.map((c) => (
        <g key={c.label}>
          <circle cx={c.x} cy={c.y - 4} r={c.us ? 6 : 4} fill={c.us ? ACCENT : MUTE} />
          <S
            x={c.x + 14}
            y={c.y}
            size={c.us ? 13 : 12}
            weight={c.us ? '600' : undefined}
            fill={c.us ? INK : CITE}
          >
            {c.label}
          </S>
          <S x={c.x + 14} y={c.y + 16} size={10.5} fill={MUTE}>
            {c.sub}
          </S>
        </g>
      ))}

      <FootNote x={20} y={376} w={960}>
        CATEGORIES, NOT VENDORS. THE AXES ARE FACTUAL: WHEN A CONTROL RUNS, AND WHAT IT IS ABLE TO DO
        WHEN IT RUNS.
      </FootNote>
    </Canvas>
  );
}

/* D-14 - Where the numbers come from ----------------------------------------- */

export function DCorpusPipeline({
  servers,
  categories,
}: {
  servers: string;
  categories: string;
}) {
  const stages: {
    label: string;
    rule: string;
    value?: string;
    valueLabel?: string;
    note?: string;
  }[] = [
    {
      label: 'registry.modelcontextprotocol.io',
      rule: 'exclude delisted + superseded versions',
      note: 'the canonical upstream',
    },
    {
      label: 'active latest-version entries',
      rule: 'reachability probe',
      value: servers,
      note: 'the number we publish',
    },
    {
      label: 'reachable remote servers',
      rule: 'quality scoring + semantic index',
      note: 'the drift-ledger population',
    },
    {
      label: 'ranked + searchable corpus',
      rule: 'screen queue, adversarial cases first',
      value: categories,
      valueLabel: 'categories',
      note: '/servers · /search · /leaderboard',
    },
    {
      label: 'advisory screen verdicts',
      rule: '',
      note: 'REVIEW / UNVERIFIED at v1',
    },
  ];

  return (
    <Canvas id="corpus-pipeline" w={1000} h={370}>
      {stages.map((s, i) => {
        const y = 20 + i * 68;
        const inset = i * 26;
        const w = 620 - inset * 2;
        return (
          <g key={s.label}>
            <Box x={40 + inset} y={y} w={w} h={44} tone={s.valueLabel ? 'shade' : s.value ? 'accent' : 'shade'} />
            <S x={56 + inset} y={y + 28} size={12.5} weight={s.value ? '600' : undefined}>
              {s.label}
            </S>
            {s.value && (
              <>
                <M x={700} y={y + 22} size={16} fill={INK} weight="600">
                  {s.value}
                </M>
                {s.valueLabel && (
                  <M x={706 + s.value.length * 10} y={y + 22} size={10.5} fill={MUTE}>
                    {s.valueLabel}
                  </M>
                )}
              </>
            )}
            {s.note && (
              <M x={700} y={s.value ? y + 40 : y + 28} size={10.5} fill={MUTE}>
                {s.note}
              </M>
            )}
            {s.rule && (
              <>
                <ArrowD x={60 + inset} y1={y + 44} y2={y + 66} stroke={FAINT} />
                <M x={78 + inset} y={y + 62} size={10.5} fill={MUTE}>
                  {s.rule}
                </M>
              </>
            )}
          </g>
        );
      })}

      <FootNote x={40} y={364} w={940}>
        DELISTED AND SUPERSEDED VERSIONS ARE EXCLUDED SO THE SAME SERVER NEVER COUNTS TWICE. A DEFINED
        POPULATION, NOT A SCRAPE.
      </FootNote>
    </Canvas>
  );
}

/* D-17 - MCP needs a lockfile ------------------------------------------------ */

const LOCK_ROWS: [string, string, string, string][] = [
  ['you declare', 'package.json', 'requirements.txt', 'mcp.json'],
  ['you pin', 'package-lock.json', 'a lock file', 'nothing in the protocol'],
  ['integrity', 'sha512 per package', 'hash per wheel', 'nothing in the protocol'],
  ['drift caught', 'npm ci fails', 'pip check fails', 'silently accepted'],
];

export function DMcpNeedsALockfile() {
  const COLS = [280, 500, 720];
  return (
    <Canvas id="mcp-needs-a-lockfile" w={1000} h={300}>
      {['npm', 'pip', 'MCP'].map((c, i) => (
        <M
          key={c}
          x={COLS[i]}
          y={38}
          caps
          size={11}
          fill={i === 2 ? ACCENT_TEXT : INK}
          weight="600"
        >
          {c}
        </M>
      ))}
      <Rule x1={20} x2={980} y={50} stroke={INK} />

      {LOCK_ROWS.map(([k, a, b, c], i) => {
        const y = 82 + i * 44;
        const missing = c.startsWith('nothing') || c === 'silently accepted';
        return (
          <g key={k}>
            {i > 0 && <Rule x1={20} x2={980} y={y - 26} />}
            <M x={20} y={y} caps size={10} fill={MUTE}>
              {k}
            </M>
            <S x={COLS[0]} y={y} size={12.5} fill={CITE}>
              {a}
            </S>
            <S x={COLS[1]} y={y} size={12.5} fill={CITE}>
              {b}
            </S>
            {missing ? (
              <>
                <line x1={COLS[2]} y1={y - 9} x2={COLS[2] + 11} y2={y + 2} stroke={ACCENT_TEXT} strokeWidth={1.5} />
                <line x1={COLS[2] + 11} y1={y - 9} x2={COLS[2]} y2={y + 2} stroke={ACCENT_TEXT} strokeWidth={1.5} />
                <S x={COLS[2] + 24} y={y} size={12.5} fill={ACCENT_TEXT}>
                  {c}
                </S>
              </>
            ) : (
              <S x={COLS[2]} y={y} size={12.5} fill={CITE}>
                {c}
              </S>
            )}
          </g>
        );
      })}

      <Rule x1={20} x2={980} y={264} stroke={INK} />
      <S x={20} y={288} size={12.5}>
        <tspan fontWeight="600">mcp.lock is the missing row.</tspan> The gate&rsquo;s trust-on-first-use
        pin is that row &mdash; written per tool by observation, instead of by hand.
      </S>
    </Canvas>
  );
}
