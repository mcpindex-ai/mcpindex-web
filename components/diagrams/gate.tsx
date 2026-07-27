import { POSTURE_ROWS } from '@/lib/diagrams';
import {
  Canvas,
  Box,
  M,
  S,
  ArrowR,
  HoldGlyph,
  Rule,
  FootNote,
  FONT_MONO,
  INK,
  RULE,
  FAINT,
  GHOST,
  MUTE,
  CITE,
  ACCENT,
  ACCENT_TEXT,
  ON_INK,
  ON_INK_ACCENT,
  ON_INK_MUTE,
} from './primitives';

/* D-01 - Where the gate sits ------------------------------------------------- */

export function DWhereTheGateSits() {
  return (
    <Canvas id="where-the-gate-sits" w={1000} h={300}>
      {/* the ghost lane: what an unguarded session looks like */}
      <M x={0} y={34} caps fill={GHOST}>
        TODAY
      </M>
      <Box x={120} y={16} w={170} h={44} tone="ghost" dashed />
      <S x={205} y={43} anchor="middle" size={13} fill={GHOST}>
        your agent
      </S>
      <ArrowR x1={290} x2={777} y={38} stroke={FAINT} dashed />
      <M x={532} y={28} anchor="middle" caps fill={GHOST} size={9.5}>
        NOTHING BETWEEN THEM
      </M>
      <Box x={780} y={16} w={170} h={44} tone="ghost" dashed />
      <S x={865} y={43} anchor="middle" size={13} fill={GHOST}>
        MCP server
      </S>

      <Rule x1={0} x2={1000} y={88} />

      <M x={0} y={128} caps fill={ACCENT_TEXT}>
        WITH THE GATE
      </M>

      <Box x={120} y={126} w={170} h={56} tone="ink" />
      <S x={205} y={159} anchor="middle" size={14} weight="600">
        your agent
      </S>

      <ArrowR x1={290} x2={397} y={154} stroke={ACCENT} />
      <M x={342} y={144} anchor="middle" caps size={9.5}>
        TOOLS/CALL
      </M>

      <Box x={400} y={120} w={200} h={68} tone="accent" />
      <S x={500} y={149} anchor="middle" size={14.5} weight="600">
        mcpindex gate
      </S>
      <M x={500} y={169} anchor="middle" caps size={10} fill={ACCENT_TEXT}>
        PIN &middot; DIFF &middot; DECIDE
      </M>

      {/* proceed leg */}
      <ArrowR x1={600} x2={777} y={140} stroke={INK} />
      <M x={612} y={130} caps size={9.5} fill={INK}>
        PROCEED
      </M>
      <S x={612} y={160} size={11} fill={MUTE}>
        live contract matches your pin
      </S>
      <Box x={780} y={112} w={170} h={56} tone="ink" />
      <S x={865} y={145} anchor="middle" size={14} weight="600">
        MCP server
      </S>

      {/* hold leg: the call turns around before it leaves */}
      <polyline
        points="500,188 500,232 205,232 205,190"
        fill="none"
        stroke={ACCENT}
        strokeWidth={1}
      />
      <polyline
        points="200,196 205,187 210,196"
        fill="none"
        stroke={ACCENT}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <HoldGlyph x={484} y={206} />
      <M x={530} y={203} caps size={10} fill={ACCENT_TEXT}>
        HELD
      </M>
      <S x={530} y={221} size={11.5} fill={MUTE}>
        the contract changed since you pinned it.
      </S>
      <S x={530} y={238} size={11.5} fill={MUTE}>
        the call never leaves your machine.
      </S>

      <FootNote x={120} y={284} w={880}>
        RUNS ON YOUR HOST &middot; ZERO CREDENTIAL CUSTODY &middot; DEFAULT BUILD EGRESSES NOTHING
      </FootNote>
    </Canvas>
  );
}

/* D-02 - Monday / Tuesday ---------------------------------------------------- */

export function DSilentDriftTimeline() {
  const beats: [number, string][] = [
    [185, 'MON'],
    [505, 'TUE'],
    [825, 'WED'],
  ];
  return (
    <Canvas id="silent-contract-drift-timeline" w={1000} h={330}>
      <Rule x1={60} x2={950} y={58} />
      {beats.map(([x, label]) => (
        <g key={label}>
          <line
            x1={x}
            y1={52}
            x2={x}
            y2={64}
            stroke={label === 'TUE' ? ACCENT : INK}
            strokeWidth={label === 'TUE' ? 1.5 : 1}
          />
          <M x={x} y={40} anchor="middle" caps size={11} fill={label === 'TUE' ? ACCENT_TEXT : INK}>
            {label}
          </M>
        </g>
      ))}

      <S x={60} y={92} size={13.5} weight="600">
        you pin the contract
      </S>
      <Box x={60} y={104} w={250} h={76} tone="shade" />
      <M x={76} y={128} size={11.5} fill={CITE}>
        search_docs(
      </M>
      <M x={76} y={148} size={11.5} fill={CITE}>
        &#160;&#160;query: string
      </M>
      <M x={76} y={168} size={11.5} fill={CITE}>
        )
      </M>

      <S x={380} y={92} size={13.5} weight="600">
        the server changes it
      </S>
      <Box x={380} y={104} w={250} h={76} tone="accent" />
      <M x={396} y={128} size={11.5} fill={CITE}>
        search_docs(
      </M>
      <M x={396} y={148} size={11.5} fill={CITE}>
        &#160;&#160;query: string,
      </M>
      <M x={396} y={168} size={11.5} fill={ACCENT_TEXT}>
        &#160;&#160;webhook: string *
      </M>
      <M x={380} y={202} caps size={10}>
        * NEWLY REQUIRED
      </M>
      <M x={380} y={222} caps size={10}>
        NO VERSION BUMP &middot; NO NOTIFICATION &middot; NO EMAIL
      </M>

      <S x={700} y={92} size={13.5} weight="600">
        your agent calls it
      </S>
      <Box x={700} y={104} w={250} h={72} tone="ghost" dashed />
      <M x={716} y={126} caps size={9.5} fill={GHOST}>
        WITHOUT A PIN
      </M>
      <S x={716} y={146} size={12} fill={MUTE}>
        the agent fills the new required
      </S>
      <S x={716} y={163} size={12} fill={MUTE}>
        param and calls. nothing tells you.
      </S>

      <Box x={700} y={192} w={250} h={72} tone="accent" />
      <M x={716} y={214} caps size={9.5} fill={ACCENT_TEXT}>
        WITH MCPINDEX
      </M>
      <HoldGlyph x={716} y={234} stroke={ACCENT_TEXT} scale={0.9} />
      <M x={748} y={238} size={11.5} fill={INK}>
        added-required-param
      </M>
      <S x={716} y={256} size={12} fill={MUTE}>
        held before the call goes out.
      </S>

      <FootNote x={60} y={314} w={890}>
        THE TOOL YOUR AGENT TRUSTED ON MONDAY CHANGED ON TUESDAY. NOTHING IN MCP TOLD YOU.
      </FootNote>
    </Canvas>
  );
}

/* D-04 - The tier ladder ----------------------------------------------------- */

const TIERS: {
  n: string;
  title: string;
  sub: string;
  answers: string;
  state: string;
  cost: string;
  live: boolean;
}[] = [
  {
    n: 'TIER 3',
    title: 'behavioural verifier',
    sub: 'exercises the changed tool',
    answers: 'clears or refutes a change',
    state: 'HELD OFF · OPT-IN',
    cost: 'executes the tool',
    live: false,
  },
  {
    n: 'TIER 2',
    title: 'LLM consult',
    sub: 'reads the ambiguous case',
    answers: 'judges what the diff cannot',
    state: 'HELD OFF · OPT-IN',
    cost: 'an LLM call',
    live: false,
  },
  {
    n: 'TIER 1',
    title: 'cloud corpus lookup',
    sub: 'one judgement, shared',
    answers: 'judged once, known everywhere',
    state: 'HELD OFF · OPT-IN',
    cost: 'a contract hash leaves',
    live: false,
  },
];

export function DTierLadder() {
  const ROW_H = 50;
  return (
    <Canvas id="tier-ladder" w={1000} h={340}>
      {TIERS.map((t, i) => {
        const y = 16 + i * (ROW_H + 6);
        return (
          <g key={t.n}>
            <Box x={20} y={y} w={960} h={ROW_H} tone="shade" />
            <rect x={34} y={y + 19} width={11} height={11} fill="none" stroke={FAINT} strokeWidth={1.2} />
            <M x={60} y={y + 22} caps size={10} fill={MUTE}>
              {t.n}
            </M>
            <S x={140} y={y + 22} size={13} weight="600" fill={MUTE}>
              {t.title}
            </S>
            <S x={140} y={y + 39} size={11} fill={GHOST}>
              {t.sub}
            </S>
            <S x={430} y={y + 22} size={12.5} fill={MUTE}>
              {t.answers}
            </S>
            <M x={966} y={y + 22} anchor="end" caps size={9.5} fill={MUTE}>
              {t.state}
            </M>
            <M x={966} y={y + 39} anchor="end" size={9.5} fill={GHOST}>
              {t.cost}
            </M>
          </g>
        );
      })}

      <Rule x1={20} x2={980} y={196} stroke={INK} />

      <Box x={20} y={208} w={960} h={72} tone="accent" />
      <rect x={34} y={236} width={11} height={11} fill={ACCENT} />
      <M x={60} y={239} caps size={10} fill={ACCENT_TEXT}>
        TIER 0
      </M>
      <S x={140} y={232} size={13.5} weight="600">
        deterministic contract-diff
      </S>
      <S x={140} y={250} size={11} fill={MUTE}>
        ChangeKind taxonomy + injection / exfil marker scan
      </S>
      <S x={430} y={232} size={12.5}>
        did this contract change versus what you pinned?
      </S>
      <S x={430} y={250} size={11} fill={MUTE}>
        no LLM, no scoring you cannot trace
      </S>
      <M x={966} y={232} anchor="end" caps size={9.5} fill={ACCENT_TEXT}>
        LIVE &middot; RUNS FIRST
      </M>
      <M x={966} y={250} anchor="end" size={9.5} fill={MUTE}>
        local &middot; no egress &middot; fail-closed
      </M>

      <FootNote x={20} y={318} w={960}>
        THE DEFAULT BUILD IS TIER-0 ONLY. THE BEHAVIOURAL TIER CLEARS OR REFUTES; IT NEVER PROVES A TOOL SAFE.
      </FootNote>
    </Canvas>
  );
}

/* D-05 - Anatomy of a hold --------------------------------------------------- */

const CALLOUTS: [number, number, string[]][] = [
  [86, 50, ['A fixed taxonomy. One of twelve', 'surfaced kinds. Never free prose.']],
  [114, 105, ['Your baseline. What you saw first.']],
  [142, 151, ['What the server sends now.']],
  [184, 188, ['Why it held here. Monitor would', 'notify and let it through.']],
  [208, 243, ['What the call would have done.']],
  [266, 280, ['Three exits. All reversible.']],
];

export function DAnatomyOfAHold() {
  return (
    <Canvas id="anatomy-of-a-hold" w={1000} h={340}>
      <rect x={0} y={16} width={580} height={284} fill={INK} />
      <HoldGlyph x={24} y={46} stroke={ON_INK_ACCENT} />
      <M x={54} y={50} size={12.5} fill={ON_INK_ACCENT} caps>
        HELD
      </M>
      <M x={112} y={50} size={12.5} fill={ON_INK}>
        filesystem &middot; write_file
      </M>

      {(
        [
          [90, 'ChangeKind', 'added-required-param'],
          [114, 'pinned', 'write_file(path, content)'],
          [138, 'live', 'write_file(path, content, mode*)'],
          [184, 'posture', 'guard'],
          [208, 'blast radius', 'WRITE · not reversible · local'],
        ] as [number, string, string][]
      ).map(([y, k, v]) => (
        <g key={k}>
          <M x={42} y={y} size={12} fill={ON_INK_MUTE}>
            {k}
          </M>
          <M x={180} y={y} size={12} fill={ON_INK}>
            {v}
          </M>
        </g>
      ))}
      <M x={180} y={156} size={11} fill={ON_INK_ACCENT}>
        * newly required
      </M>

      <Rule x1={42} x2={540} y={240} stroke="#3f3f46" />
      <M x={42} y={270} size={12} fill={ON_INK_ACCENT}>
        &#8594; re-pin
      </M>
      <M x={180} y={270} size={12} fill={ON_INK_ACCENT}>
        &#8594; reject
      </M>
      <M x={320} y={270} size={12} fill={ON_INK_ACCENT}>
        &#8594; tune posture
      </M>

      {CALLOUTS.map(([srcY, dstY, lines], i) => (
        <g key={srcY}>
          <circle cx={556} cy={srcY} r={9} fill="none" stroke={ON_INK_ACCENT} strokeWidth={1} />
          <text
            x={556}
            y={srcY + 4}
            fontFamily={FONT_MONO}
            fontSize={10}
            fill={ON_INK_ACCENT}
            textAnchor="middle"
          >
            {i + 1}
          </text>
          <polyline
            points={`565,${srcY} 596,${srcY} 596,${dstY - 4} 620,${dstY - 4}`}
            fill="none"
            stroke={RULE}
            strokeWidth={1}
          />
          {lines.map((l, j) => (
            <S key={l} x={632} y={dstY + j * 17} size={12.5}>
              {l}
            </S>
          ))}
        </g>
      ))}

      <FootNote x={0} y={334} w={1000}>
        THE GATE SAYS &ldquo;THIS CHANGED&rdquo;, NEVER &ldquo;THIS IS UNSAFE&rdquo;.
      </FootNote>
    </Canvas>
  );
}

/* D-06 - It held. Now what? -------------------------------------------------- */

export function DItHeldNowWhat() {
  return (
    <Canvas id="it-held-now-what" w={1000} h={340}>
      <HoldGlyph x={20} y={32} />
      <M x={52} y={36} caps size={11.5} fill={ACCENT_TEXT}>
        HELD
      </M>

      <line x1={30} y1={48} x2={30} y2={216} stroke={RULE} strokeWidth={1} />

      <line x1={30} y1={80} x2={56} y2={80} stroke={RULE} strokeWidth={1} />
      <S x={66} y={84} size={13.5} weight="600">
        did you expect this change?
      </S>

      <line x1={80} y1={92} x2={80} y2={186} stroke={RULE} strokeWidth={1} />

      <line x1={80} y1={114} x2={106} y2={114} stroke={RULE} strokeWidth={1} />
      <M x={116} y={118} size={11} caps fill={ACCENT_TEXT}>
        YES
      </M>
      <S x={160} y={118} size={12.5}>
        re-pin. the new contract becomes your baseline. done.
      </S>

      <line x1={80} y1={146} x2={106} y2={146} stroke={RULE} strokeWidth={1} />
      <M x={116} y={150} size={11} caps fill={MUTE}>
        NO
      </M>
      <S x={160} y={150} size={12.5}>
        is the change breaking or destructive?
      </S>

      <line x1={176} y1={158} x2={176} y2={214} stroke={RULE} strokeWidth={1} />
      <line x1={176} y1={182} x2={202} y2={182} stroke={RULE} strokeWidth={1} />
      <M x={212} y={186} size={11} caps fill={ACCENT_TEXT}>
        YES
      </M>
      <S x={256} y={186} size={12.5}>
        reject the call. check the server&rsquo;s changelog, and check /ledger to
      </S>
      <S x={256} y={203} size={12.5}>
        see whether the crawler caught the same drift.
      </S>

      <line x1={176} y1={230} x2={202} y2={230} stroke={RULE} strokeWidth={1} />
      <M x={212} y={234} size={11} caps fill={MUTE}>
        NO
      </M>
      <S x={256} y={234} size={12.5}>
        re-pin, or move that one server to the monitor posture.
      </S>

      <Rule x1={20} x2={980} y={258} />

      <S x={20} y={282} size={13.5} weight="600">
        holding too often?
      </S>
      <M x={190} y={282} size={11.5} fill={CITE}>
        guard &#8594; monitor
      </M>
      <S x={330} y={282} size={12.5} fill={MUTE}>
        notify and proceed. you still see every change.
      </S>
      <M x={190} y={304} size={11.5} fill={CITE}>
        guard &#8594; strict
      </M>
      <S x={330} y={304} size={12.5} fill={MUTE}>
        hold on any drift, including benign.
      </S>

      <FootNote x={20} y={336} w={960}>
        EVERY EXIT IS REVERSIBLE. A RE-PIN CAN BE RE-PINNED.
      </FootNote>
    </Canvas>
  );
}

/* D-07 - Posture x ChangeKind ------------------------------------------------ */

export function DPostureMatrix() {
  const ROW_H = 25;
  const top = 84;
  const h = top + POSTURE_ROWS.length * ROW_H + 140;
  const holds = POSTURE_ROWS.filter((r) => r.guard === 'HOLD').length;
  const incon = POSTURE_ROWS.filter((r) => r.guard === 'INCONCLUSIVE').length;
  const benign = POSTURE_ROWS.filter((r) => r.guard === 'PROCEED').length;
  const COL = { monitor: 560, guard: 700, strict: 858 };

  // One cell. Meaning never rides on colour alone: HOLD gets the stop-bar, INCONCLUSIVE a
  // ring, PROCEED an arrow - each with its own word.
  const cell = (x: number, y: number, outcome: string) => {
    if (outcome === 'HOLD') {
      return (
        <>
          <HoldGlyph x={x} y={y - 4} stroke={ACCENT_TEXT} scale={0.7} />
          <M x={x + 20} y={y} size={11} fill={ACCENT_TEXT} caps>
            HOLD
          </M>
        </>
      );
    }
    if (outcome === 'INCONCLUSIVE') {
      return (
        <>
          <circle cx={x + 5} cy={y - 4} r={4.5} fill="none" stroke={ACCENT_TEXT} strokeWidth={1.4} />
          <M x={x + 18} y={y} size={11} fill={ACCENT_TEXT} caps>
            INCONCLUSIVE
          </M>
        </>
      );
    }
    return (
      <M x={x} y={y} size={11} fill={MUTE}>
        &#8594; {outcome === 'PROCEED' ? 'proceed' : 'notify'}
      </M>
    );
  };

  return (
    <Canvas id="posture-matrix" w={1000} h={h}>
      <M x={20} y={28} caps size={10} fill={ACCENT_TEXT}>
        GENERATED FROM THE GATE SOURCE &mdash; VERIFIED BY DRIVING IT AT ALL THREE POSTURES
      </M>

      <M x={20} y={62} caps size={9.5}>
        CHANGEKIND
      </M>
      <M x={330} y={62} caps size={9.5}>
        WHY IT LANDS HERE
      </M>
      <M x={COL.monitor} y={62} caps size={9.5}>
        MONITOR
      </M>
      <M x={COL.guard} y={62} caps size={9.5} fill={ACCENT_TEXT}>
        GUARD (DEFAULT)
      </M>
      <M x={COL.strict} y={62} caps size={9.5}>
        STRICT
      </M>
      <Rule x1={20} x2={980} y={72} stroke={INK} />

      {POSTURE_ROWS.map((r, i) => {
        const y = top + i * ROW_H;
        const blocking = r.guard !== 'PROCEED';
        return (
          <g key={r.kind}>
            {i > 0 && <Rule x1={20} x2={980} y={y - 17} />}
            {blocking && <rect x={12} y={y - 12} width={2} height={15} fill={ACCENT} />}
            <M x={20} y={y} size={11.5} fill={INK}>
              {r.kind}
            </M>
            <S x={330} y={y} size={10.5} fill={MUTE}>
              {r.because}
            </S>
            {cell(COL.monitor, y, r.monitor)}
            {cell(COL.guard, y, r.guard)}
            {cell(COL.strict, y, r.strict)}
          </g>
        );
      })}

      <Rule x1={20} x2={980} y={top + POSTURE_ROWS.length * ROW_H - 8} stroke={INK} />
      <S x={20} y={top + POSTURE_ROWS.length * ROW_H + 18} size={12} fill={CITE}>
        Of {POSTURE_ROWS.length} surfaced kinds: {holds} HOLD under guard, {incon} resolve to
        INCONCLUSIVE (behaviour is the gate, not a block), {benign} proceed as proven-benign.
      </S>
      {/* SVG does not wrap: every visual line is its own node. */}
      <S x={20} y={top + POSTURE_ROWS.length * ROW_H + 42} size={12} fill={CITE} weight="600">
        Strict does not hold every drift.
      </S>
      <S x={228} y={top + POSTURE_ROWS.length * ROW_H + 42} size={12} fill={MUTE}>
        The benign auto-accept runs before the posture layer, so a
      </S>
      <S x={20} y={top + POSTURE_ROWS.length * ROW_H + 60} size={12} fill={MUTE}>
        proven-benign change is re-pinned and proceeds under strict too. Monitor never blocks.
      </S>
      <S x={20} y={top + POSTURE_ROWS.length * ROW_H + 84} size={12} fill={MUTE}>
        An injection / exfil marker is a separate scan, not a ChangeKind, so it is not a row &mdash;
      </S>
      <S x={20} y={top + POSTURE_ROWS.length * ROW_H + 102} size={12} fill={MUTE}>
        but guard blocks on it, as it does on a risk escalation and any fail-closed error.
      </S>
    </Canvas>
  );
}

/* D-16 - The 90-second path -------------------------------------------------- */

export function DNinetySecondPath() {
  const beats: [number, string, string, string][] = [
    [90, '0s', 'install', 'the gate'],
    [250, '20s', 'wire your', 'MCP hosts'],
    [410, '30s', 'restart', 'the host'],
    [570, '45s', 'first tools/list', '= every tool pinned'],
    [830, 'whenever', 'first drift', '= your first HOLD'],
  ];
  return (
    <Canvas id="ninety-second-path" w={1000} h={300}>
      <Rule x1={40} x2={960} y={72} />
      {beats.map(([x, t, a, b], i) => (
        <g key={t}>
          <line
            x1={x}
            y1={66}
            x2={x}
            y2={78}
            stroke={i === 4 ? ACCENT : INK}
            strokeWidth={i === 4 ? 1.5 : 1}
          />
          <M x={x} y={54} anchor="middle" caps size={10.5} fill={i === 4 ? ACCENT_TEXT : INK}>
            {t}
          </M>
          <S x={x} y={102} anchor="middle" size={12.5} weight="600">
            {a}
          </S>
          <S x={x} y={119} anchor="middle" size={11.5} fill={MUTE}>
            {b}
          </S>
        </g>
      ))}

      <Box x={470} y={146} w={210} h={92} tone="shade" />
      <M x={486} y={168} caps size={9.5}>
        SILENT
      </M>
      <S x={486} y={190} size={12} fill={MUTE}>
        nothing to configure.
      </S>
      <S x={486} y={207} size={12} fill={MUTE}>
        nothing to see.
      </S>
      <S x={486} y={224} size={12} fill={CITE} weight="600">
        this is correct.
      </S>

      <Box x={730} y={146} w={220} h={92} tone="accent" />
      <M x={746} y={168} caps size={9.5} fill={ACCENT_TEXT}>
        THE POINT
      </M>
      <S x={746} y={190} size={12} fill={MUTE}>
        the only time the gate
      </S>
      <S x={746} y={207} size={12} fill={MUTE}>
        ever interrupts you.
      </S>
      <S x={746} y={224} size={12} fill={CITE} weight="600">
        read it, then decide.
      </S>

      <FootNote x={40} y={286} w={920}>
        SILENCE AFTER INSTALL IS THE GATE WORKING, NOT THE GATE BEING BROKEN.
      </FootNote>
    </Canvas>
  );
}
