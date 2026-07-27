import { SOURCE_LIVENESS_CENSUS } from '@/lib/sourceLiveness';
import { D3_CONFORMING_LABELS, D3_REQUIRED_LABELS } from '@/lib/honest-limits';
import {
  Canvas,
  Box,
  M,
  S,
  ArrowR,
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
  SHADE,
} from './primitives';

/* D-03 - Trust boundary ------------------------------------------------------ */

export function DTrustBoundary() {
  return (
    <Canvas id="trust-boundary" w={1000} h={400}>
      <M x={52} y={42} caps size={10.5} fill={INK}>
        YOUR HOST
      </M>
      <rect x={40} y={50} width={420} height={230} fill="#ffffff" stroke={INK} strokeWidth={1.5} />

      <Box x={64} y={76} w={180} h={48} tone="shade" />
      <S x={154} y={105} anchor="middle" size={13.5}>
        agent
      </S>
      <line x1={244} y1={100} x2={270} y2={100} stroke={MUTE} strokeWidth={1} />
      <Box x={270} y={76} w={180} h={48} tone="accent" />
      <S x={360} y={105} anchor="middle" size={13.5} weight="600">
        mcpindex gate
      </S>

      <line x1={360} y1={124} x2={360} y2={152} stroke={MUTE} strokeWidth={1} />
      <Box x={64} y={152} w={366} h={46} tone="shade" />
      <S x={80} y={172} size={13}>
        pin store
      </S>
      <M x={80} y={189} caps size={9.5}>
        LOCAL DISK &middot; YOUR BASELINE
      </M>

      <M x={64} y={232} caps size={10} fill={ACCENT_TEXT}>
        DEFAULT
      </M>
      <S x={64} y={252} size={12.5}>
        nothing crosses to mcpindex. the tier-0
      </S>
      <S x={64} y={269} size={12.5}>
        contract-diff runs entirely in here.
      </S>

      {/* the one crossing that always happens: the call itself, untouched */}
      <ArrowR x1={460} x2={697} y={90} stroke={INK} />
      <M x={470} y={80} caps size={9.5} fill={INK}>
        TOOLS/CALL + CREDENTIALS
      </M>
      <S x={470} y={106} size={10.5} fill={MUTE}>
        passed through untouched.
      </S>
      <S x={470} y={121} size={10.5} fill={MUTE}>
        the gate holds no keys.
      </S>
      <Box x={700} y={62} w={280} h={56} tone="ink" />
      <S x={718} y={88} size={13.5} weight="600">
        MCP server
      </S>
      <S x={718} y={105} size={11.5} fill={MUTE}>
        the tool you wired
      </S>

      <ArrowR x1={460} x2={697} y={188} stroke={ACCENT} dashed />
      <M x={470} y={178} caps size={9.5} fill={ACCENT_TEXT}>
        OPT-IN &middot; CONTRACT HASH
      </M>
      <S x={470} y={204} size={10.5} fill={MUTE}>
        a deterministic hash of the
      </S>
      <S x={470} y={219} size={10.5} fill={MUTE}>
        public tool contract
      </S>
      <Box x={700} y={160} w={280} h={56} tone="shade" />
      <S x={718} y={186} size={13.5} weight="600">
        mcpindex edge
      </S>
      <S x={718} y={203} size={11.5} fill={MUTE}>
        US region &middot; tier-1 corpus lookup
      </S>

      <ArrowR x1={460} x2={697} y={268} stroke={ACCENT} dashed />
      <M x={470} y={258} caps size={9.5} fill={ACCENT_TEXT}>
        OPT-IN &middot; SALTED FINGERPRINT
      </M>
      <S x={470} y={284} size={10.5} fill={MUTE}>
        + change type, safety flag,
      </S>
      <S x={470} y={299} size={10.5} fill={MUTE}>
        hour-rounded time. fail-open.
      </S>
      <Box x={700} y={240} w={280} h={56} tone="shade" />
      <S x={718} y={266} size={13.5} weight="600">
        drift network
      </S>
      <S x={718} y={283} size={11.5} fill={MUTE}>
        never blocks or changes a call
      </S>

      <rect x={40} y={326} width={920} height={52} fill={SHADE} stroke={RULE} strokeWidth={1} />
      <line x1={60} y1={345} x2={76} y2={361} stroke={ACCENT_TEXT} strokeWidth={1.5} />
      <line x1={76} y1={345} x2={60} y2={361} stroke={ACCENT_TEXT} strokeWidth={1.5} />
      <M x={94} y={348} caps size={10} fill={ACCENT_TEXT}>
        NEVER CROSSES
      </M>
      <S x={94} y={367} size={12.5}>
        tokens &middot; arguments &middot; schema bodies &middot; descriptions &middot; URLs &middot; server names
        &middot; tool names &middot; your call data
      </S>
    </Canvas>
  );
}

/* D-09 - Two verdict surfaces ------------------------------------------------ */

export function DTwoVerdictSurfaces() {
  const cell = (
    x: number,
    y: number,
    token: string,
    state: 'live' | 'reserved',
  ) => (
    <g key={token}>
      <M x={x} y={y} size={12} fill={state === 'live' ? INK : GHOST} weight={state === 'live' ? '600' : undefined}>
        {token}
      </M>
      <M x={x} y={y + 15} caps size={9} fill={state === 'live' ? ACCENT_TEXT : GHOST}>
        {state === 'live' ? 'PRODUCED AT V1' : 'RESERVED'}
      </M>
    </g>
  );

  return (
    <Canvas id="two-verdict-surfaces" w={1000} h={356}>
      <line x1={520} y1={20} x2={520} y2={272} stroke={RULE} strokeWidth={1} />

      <M x={20} y={38} caps size={10} fill={INK}>
        ADVISORY SCREEN &middot; BEFORE YOU WIRE
      </M>
      <Rule x1={20} x2={480} y={50} stroke={INK} />
      <M x={250} y={76} caps size={9.5}>
        DID THE EVAL RUN?
      </M>
      <M x={258} y={98} caps size={9.5} fill={INK}>
        YES
      </M>
      <M x={392} y={98} caps size={9.5} fill={INK}>
        NO
      </M>

      {(
        [
          [128, 'cleared'],
          [172, 'crossed the deny threshold'],
          [216, 'ambiguous or partial'],
          [258, 'no eval on file'],
        ] as [number, string][]
      ).map(([y, label]) => (
        <S key={label} x={20} y={y} size={11.5} fill={MUTE}>
          {label}
        </S>
      ))}

      {cell(258, 128, 'ALLOW', 'reserved')}
      {cell(258, 172, 'DENY', 'reserved')}
      {cell(258, 216, 'REVIEW', 'live')}
      {cell(392, 258, 'UNVERIFIED', 'live')}

      <M x={560} y={38} caps size={10} fill={ACCENT_TEXT}>
        IN-PATH GATE &middot; DURING THE CALL
      </M>
      <Rule x1={560} x2={980} y={50} stroke={INK} />

      <Box x={560} y={96} w={420} h={62} tone="accent" />
      <HoldGlyph x={578} y={122} stroke={ACCENT_TEXT} />
      <M x={608} y={126} caps size={12} fill={ACCENT_TEXT} weight="600">
        HOLD
      </M>
      <S x={578} y={146} size={11.5} fill={MUTE}>
        the live contract differs from what you pinned
      </S>

      <Box x={560} y={178} w={420} h={62} tone="shade" />
      <M x={578} y={206} size={12} fill={INK} weight="600">
        &#8594; PROCEED
      </M>
      <S x={578} y={228} size={11.5} fill={MUTE}>
        the live contract matches your pin
      </S>

      <M x={560} y={262} caps size={9.5}>
        DETERMINISTIC &middot; FAIL-CLOSED &middot; IN THE CALL PATH
      </M>

      <Rule x1={20} x2={980} y={288} />
      <S x={20} y={306} size={12} fill={CITE}>
        ALLOW and DENY are reserved in the contract, not produced at v1: a clearing ALLOW
      </S>
      <S x={20} y={323} size={12} fill={CITE}>
        requires the behavioural conformance probe, gated to the D3 labelled corpus (
        {D3_CONFORMING_LABELS}/{D3_REQUIRED_LABELS}).
      </S>
      <S x={20} y={343} size={12} fill={MUTE}>
        Neither surface overrides the other. The screen is a prior; the gate is the decision.
      </S>
    </Canvas>
  );
}

/* D-10 - The drift network loop ---------------------------------------------- */

export function DDriftNetworkLoop() {
  const steps: [string, string][] = [
    ['daily crawl of the public MCP registry', 'every reachable remote server'],
    ['re-derive every tool contract', 'the same derivation your gate runs'],
    ['change detected', 'recorded as a fingerprint-only entry'],
    ['your gate queries the network on pin', 'GET /api/v1/drift/any?fp=…'],
  ];
  return (
    <Canvas id="drift-network-loop" w={1000} h={340}>
      {steps.map(([title, sub], i) => {
        const y = 22 + i * 74;
        return (
          <g key={title}>
            <Box x={120} y={y} w={340} h={52} tone={i === 3 ? 'accent' : 'shade'} />
            <M x={136} y={y + 20} caps size={9} fill={i === 3 ? ACCENT_TEXT : MUTE}>
              {String(i + 1).padStart(2, '0')}
            </M>
            <S x={172} y={y + 21} size={12.5} weight="600">
              {title}
            </S>
            <S x={172} y={y + 38} size={11} fill={MUTE}>
              {sub}
            </S>
            {i < 3 && <ArrowD x={290} y1={y + 52} y2={y + 72} stroke={ACCENT} />}
          </g>
        );
      })}

      <ArrowR x1={460} x2={577} y={196} stroke={ACCENT} />
      <Box x={580} y={170} w={390} h={52} tone="shade" />
      <S x={598} y={191} size={12.5} weight="600">
        OTS anchor &#8594; the public drift ledger
      </S>
      <S x={598} y={208} size={11} fill={MUTE}>
        /ledger &middot; fingerprint-only, hash-chained, timestamped
      </S>

      <ArrowR x1={460} x2={577} y={270} stroke={ACCENT} />
      <Box x={580} y={244} w={390} h={52} tone="accent" />
      <S x={598} y={265} size={12.5} weight="600">
        warned on the FIRST call
      </S>
      <S x={598} y={282} size={11} fill={MUTE}>
        advisory only &middot; it never moves a PROCEED or a HOLD
      </S>

      <FootNote x={20} y={330} w={960}>
        CORROBORATION FLOORS AT THE CRAWLER (SOURCES=1). FORGEABLE INSTALL REPORTS ARE EXCLUDED FROM
        THE PUBLIC COUNT.
      </FootNote>
    </Canvas>
  );
}

/* D-12 - The provenance chain ------------------------------------------------ */

export function DProvenanceChain() {
  const nodes: [number, number, string, string][] = [
    [20, 150, 'verdict', 'a finding on a tool'],
    [230, 150, 'entry', 'chained to the prior'],
    [440, 160, 'daily digest', 'one root per day'],
    [660, 130, 'OTS', 'OpenTimestamps'],
    [830, 150, 'bitcoin block', 'the anchor'],
  ];
  const links: [number, number, string][] = [
    [170, 230, 'sha256'],
    [380, 440, 'chained'],
    [600, 660, 'folded'],
    [790, 830, 'stamped'],
  ];
  return (
    <Canvas id="provenance-chain" w={1000} h={280}>
      {nodes.map(([x, w, title, sub]) => (
        <g key={title}>
          <Box x={x} y={40} w={w} h={56} tone={title === 'bitcoin block' ? 'accent' : 'shade'} />
          <S x={x + 14} y={66} size={13} weight="600">
            {title}
          </S>
          <S x={x + 14} y={83} size={10.5} fill={MUTE}>
            {sub}
          </S>
        </g>
      ))}
      {links.map(([x1, x2, label]) => (
        <g key={label}>
          <ArrowR x1={x1} x2={x2 - 3} y={68} stroke={ACCENT} />
          <M x={(x1 + x2) / 2} y={30} anchor="middle" caps size={9}>
            {label}
          </M>
        </g>
      ))}

      <line x1={920} y1={96} x2={920} y2={150} stroke={RULE} strokeWidth={1} />
      <line x1={880} y1={122} x2={920} y2={122} stroke={RULE} strokeWidth={1} />
      <M x={872} y={126} anchor="end" size={10.5} fill={MUTE}>
        ~10 min &middot; pending
      </M>
      <line x1={880} y1={150} x2={920} y2={150} stroke={RULE} strokeWidth={1} />
      <M x={872} y={154} anchor="end" size={10.5} fill={ACCENT_TEXT}>
        ~1 hour &middot; N=6, final
      </M>

      <Rule x1={20} x2={980} y={186} stroke={INK} />
      <M x={20} y={210} caps size={10} fill={ACCENT_TEXT}>
        PROVES
      </M>
      <S x={130} y={210} size={12.5}>
        the verdict existed by some Bitcoin block. the chain is auditable end to end.
      </S>
      <M x={20} y={238} caps size={10} fill={MUTE}>
        DOES NOT
      </M>
      <S x={130} y={238} size={12.5} fill={MUTE}>
        prove minute-level ordering inside the confirmation window.
      </S>
      <S x={130} y={258} size={12.5} fill={MUTE}>
        confirmation-depth checking is the relying party&rsquo;s job, against their own node.
      </S>
    </Canvas>
  );
}

/* D-15 - Source liveness census ---------------------------------------------- */

const C = SOURCE_LIVENESS_CENSUS;
/** Parse "14.0%" -> 14.0. Derived, never re-typed: the census owns the figure. */
const PCT = Number.parseFloat(C.pctUnreachable) || 0;

export function DSourceLivenessCensus() {
  const BAR_X = 300;
  const BAR_W = 560;
  const unreachableW = Math.max(6, (BAR_W * PCT) / 100);

  return (
    <Canvas id="source-liveness-census" w={1000} h={378}>
      <S x={20} y={38} size={12.5} fill={MUTE}>
        listed servers
      </S>
      <M x={300} y={38} size={14} fill={INK} weight="600">
        {C.serversTotal}
      </M>
      <ArrowD x={40} y1={48} y2={72} stroke={FAINT} />
      <M x={60} y={66} size={10.5} fill={MUTE}>
        extract the referenced source repository for each
      </M>

      <S x={20} y={100} size={12.5} fill={MUTE}>
        referenced GitHub repositories
      </S>
      <M x={300} y={100} size={14} fill={INK} weight="600">
        {C.reposTotal}
      </M>

      <Box x={300} y={126} w={180} h={40} tone="shade" />
      <S x={316} y={151} size={12}>
        vantage A
      </S>
      <Box x={500} y={126} w={180} h={40} tone="shade" />
      <S x={516} y={151} size={12}>
        vantage B
      </S>
      <M x={700} y={143} size={11} fill={ACCENT_TEXT}>
        0 cross-vantage disagreements
      </M>
      <M x={700} y={159} size={10.5} fill={MUTE}>
        confirmed only after 2 failures &ge;48h apart
      </M>

      <ArrowD x={490} y1={166} y2={196} stroke={FAINT} />

      <S x={20} y={222} size={12.5} fill={MUTE}>
        repository reachability
      </S>
      <rect x={BAR_X} y={206} width={BAR_W} height={26} fill="#ffffff" stroke={RULE} strokeWidth={1} />
      <rect x={BAR_X} y={206} width={unreachableW} height={26} fill={ACCENT} />
      <M x={BAR_X + unreachableW + 12} y={224} size={11.5} fill={ACCENT_TEXT} weight="600">
        {C.reposUnreachable} not publicly reachable &middot; {C.pctUnreachable} &middot; {C.ratioPhrase}
      </M>

      <ArrowD x={BAR_X + 40} y1={232} y2={262} stroke={FAINT} />

      <S x={20} y={288} size={12.5} fill={MUTE}>
        listed servers affected
      </S>
      <M x={300} y={288} size={14} fill={INK} weight="600">
        {C.serversAffected}
      </M>

      <Rule x1={20} x2={980} y={312} />
      <M x={20} y={332} size={10.5} fill={MUTE} caps>
        CENSUS {C.sweepDate} &middot; DIGEST ANCHORED TO BITCOIN VIA OPENTIMESTAMPS &middot; CC BY 4.0 &middot;
        DOI 10.5281/ZENODO.21501868
      </M>
      <S x={20} y={350} size={11.5} fill={MUTE}>
        Negative-only evidence: an absent entry means nothing publishable, never
      </S>
      <S x={20} y={366} size={11.5} fill={MUTE}>
        &ldquo;verified healthy&rdquo; &mdash; a reachable repository proves only that a URL resolves.
      </S>
    </Canvas>
  );
}
