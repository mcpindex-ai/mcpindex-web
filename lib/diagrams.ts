import {
  SURFACE_CHANGE_KINDS,
  SAFETY_RELEVANT_CHANGE_KINDS,
  BENIGN_AUTOACCEPT_CHANGE_KINDS,
  BEHAVIORAL_MANDATED_CHANGE_KINDS,
  postureOutcome,
  type PostureOutcome,
} from './changeKinds';
import { KIND_LABEL } from './kindLabels';
import { SOURCE_LIVENESS_CENSUS } from './sourceLiveness';
import { D3_CONFORMING_LABELS, D3_REQUIRED_LABELS } from './honest-limits';

/**
 * The diagram registry: one entry per published figure.
 *
 * WHY A REGISTRY AND NOT JUST COMPONENTS
 * A diagram is four artifacts that must not drift apart: the SVG, the aria-label, the
 * figcaption claim, and the ASCII text twin. Models never see the SVG - they see the twin, the
 * label, and the caption - so a figure whose twin says something the SVG does not is a silent
 * lie to every AI answer engine that quotes us. Holding all four in one record makes the drift
 * visible and lets scripts/check-diagram-freshness.mjs assert on it at build time.
 *
 * ANTI-STALENESS CONTRACT (enforced by scripts/check-diagram-freshness.mjs, wired into build):
 *   1. `derives` names every single-source a figure reads. A figure that renders a number or an
 *      enumeration MUST derive it - literals are rejected by the guard.
 *   2. `tripwire` names the capability assumption the figure bakes in (e.g. "tiers 1-3 are still
 *      held off"). The guard re-asserts each tripwire against its source, so the build FAILS the
 *      moment a capability ships that makes a figure wrong. That is the alert: it fires in CI at
 *      the exact commit that changes the capability, and it names the figure to update.
 *   3. `placements` names every route that renders the figure. The guard fails if a placement
 *      page no longer imports it, so a figure can never be silently orphaned by a page rewrite.
 *   4. `reviewed` is a staleness stamp surfaced on /diagrams. The guard warns past 180 days.
 */
export interface DiagramMeta {
  /** URL slug: /diagrams/<id>, and the ImageObject @id. Stable forever once published. */
  id: string;
  /** Figure number as rendered in the caption. */
  fig: string;
  /** Short human name for the gallery and the <title>. */
  title: string;
  /** The claim, one sentence. This IS the figcaption - never a label like "Architecture". */
  claim: string;
  /** aria-label / alt: the CONCLUSION in prose, never a description of shapes. */
  alt: string;
  /** The ASCII twin. The artifact an answer engine actually quotes. `{token}` interpolated. */
  twin: string;
  /** Search / answer-engine intents this figure is aimed at. Drives the gallery copy. */
  queries: readonly string[];
  /** Routes that render this figure. Guard-checked for real imports. */
  placements: readonly string[];
  /** Single-sources this figure reads. Empty = the figure asserts no derived fact. */
  derives: readonly string[];
  /** The capability assumption baked in, re-asserted at build time. */
  tripwire?: string;
  /** Last human review, YYYY-MM-DD. Surfaced publicly; warned on past 180 days. */
  reviewed: string;
}

const REVIEWED = '2026-07-27';

/**
 * D-07's rows are GENERATED from the gate's own sets, never typed by hand.
 *
 * The taxonomy already lives in several places with hand-maintained sync comments; a drawn
 * matrix would be one more copy, and a matrix wrong in one cell is worse than no matrix. A
 * first hand-drawn draft WAS wrong in four rows.
 *
 * VERIFIED 2026-07-27 against corpus_eval/tooling/cse/gate.py by driving the real Gate at all
 * three postures - not read off the docs. That run corrected three further errors this table
 * had inherited from the site's own prose:
 *   - STRICT does NOT hold every drift. Benign auto-accept runs BEFORE the posture layer, so a
 *     proven-benign drift proceeds under strict too.
 *   - annotation-flip-to-destructive and output-schema-changed resolve to INCONCLUSIVE, a third
 *     state ("behaviour is the gate"), not HOLD.
 *   - MONITOR returns PROCEED-with-note, never a block, for every kind.
 */
export type PostureRow = {
  kind: string;
  label: string;
  safety: boolean;
  monitor: PostureOutcome;
  guard: PostureOutcome;
  strict: PostureOutcome;
  /** Why this row lands where it does, in the gate's own vocabulary. */
  because: string;
};

export const POSTURE_ROWS: readonly PostureRow[] = [...SURFACE_CHANGE_KINDS]
  .sort((a, b) => {
    const rank = (k: string) =>
      BENIGN_AUTOACCEPT_CHANGE_KINDS.has(k) ? 2 : BEHAVIORAL_MANDATED_CHANGE_KINDS.has(k) ? 1 : 0;
    return rank(a) - rank(b) || a.localeCompare(b);
  })
  .map((kind) => ({
    kind,
    label: KIND_LABEL[kind] ?? kind.replace(/-/g, ' '),
    safety: SAFETY_RELEVANT_CHANGE_KINDS.has(kind),
    monitor: postureOutcome(kind, 'monitor'),
    guard: postureOutcome(kind, 'guard'),
    strict: postureOutcome(kind, 'strict'),
    because: BENIGN_AUTOACCEPT_CHANGE_KINDS.has(kind)
      ? 'proven benign - re-pinned, then proceeds'
      : BEHAVIORAL_MANDATED_CHANGE_KINDS.has(kind)
        ? 'behaviour is the gate, not a block'
        : 'carries the safety bit',
  }));

const CELL: Record<PostureOutcome, string> = {
  PROCEED: '-> proceed',
  PROCEED_NOTIFY: 'notify',
  INCONCLUSIVE: '? INCONCL.',
  HOLD: '| HOLD',
};

/** The generated ASCII twin for D-07, built from the same rows the SVG renders. */
function posturesTwin(): string {
  const w = Math.max(...POSTURE_ROWS.map((r) => r.kind.length));
  const head = `  ${'ChangeKind'.padEnd(w)}   MONITOR    GUARD*      STRICT`;
  const body = POSTURE_ROWS.map(
    (r) =>
      `  ${r.kind.padEnd(w)}   ${CELL[r.monitor].padEnd(10)} ${CELL[r.guard].padEnd(11)} ${CELL[r.strict]}`,
  ).join('\n');
  const benign = POSTURE_ROWS.filter((r) => r.guard === 'PROCEED').length;
  const incon = POSTURE_ROWS.filter((r) => r.guard === 'INCONCLUSIVE').length;
  const hold = POSTURE_ROWS.filter((r) => r.guard === 'HOLD').length;
  return `${head}\n${'  ' + '-'.repeat(w + 36)}\n${body}

  * guard is the default posture.

  of ${POSTURE_ROWS.length} surfaced kinds: ${hold} HOLD under guard, ${incon} resolve to
  INCONCLUSIVE (behaviour is the gate, not a block), ${benign} proceed as proven-benign.

  STRICT DOES NOT HOLD EVERY DRIFT. the benign auto-accept runs BEFORE the posture
  layer, so a proven-benign change (an added optional param, a first-time output
  schema) is re-pinned and proceeds under strict too. strict holds everything it
  cannot prove benign.

  MONITOR never blocks: every kind returns PROCEED-with-note.

  an injection / exfil MARKER found in a schema or description is a separate scan,
  not a ChangeKind, so it is not a row here - but guard blocks on it, as it does on
  a risk escalation, a description change, and any fail-closed error.

  verified 2026-07-27 by driving the gate (corpus_eval/tooling/cse/gate.py) at all
  three postures.`;
}

export const DIAGRAMS: readonly DiagramMeta[] = [
  {
    id: 'where-the-gate-sits',
    fig: '01',
    title: 'Where the gate sits',
    claim: 'The gate is inside the call path, so a hold actually stops the call.',
    alt: 'Without mcpindex an agent calls an MCP server directly with nothing in between. With mcpindex the gate sits in the call path: it pins the contract, diffs it, and either proceeds to the server when the live contract matches the pin, or holds the call and returns it to the agent when the contract has changed. The gate runs on your host, holds no credentials, and the default build egresses nothing.',
    queries: ['mcp architecture diagram', 'how does mcp work diagram', 'mcp interceptor', 'in-path mcp gate'],
    placements: ['/', '/install', '/docs', '/diagrams/where-the-gate-sits'],
    derives: [],
    reviewed: REVIEWED,
    twin: `TODAY          [ your agent ] - - - - - - - - - - - - - -> [ MCP server ]
                                nothing between them

WITH THE GATE  [ your agent ] --> [ mcpindex gate ] --> [ MCP server ]
                                   pin - diff - decide      PROCEED
                                          |                 live contract matches your pin
                                          +--| HELD
                                             the contract changed since you pinned it.
                                             the call never leaves your machine.

               runs on your host - zero credential custody - default build egresses nothing`,
  },
  {
    id: 'silent-contract-drift-timeline',
    fig: '02',
    title: 'Monday / Tuesday',
    claim: 'The change arrives with no version bump, no notification and no email. The pin is the only witness.',
    alt: 'On Monday you pin a tool contract in which search_docs takes a query string. On Tuesday the server changes it to also require a webhook parameter, with no version bump, no notification and no email. On Wednesday your agent calls the tool. Without a pin the agent fills the new required parameter and calls anyway and nothing tells you. With mcpindex the call is held and labelled added-required-param before it goes out.',
    queries: ['mcp rug pull', 'mcp silent contract drift', 'mcp tool poisoning', 'mcp tool changed without notice'],
    placements: ['/guides/mcp-silent-contract-drift', '/diagrams/silent-contract-drift-timeline'],
    derives: [],
    reviewed: REVIEWED,
    twin: `  MON -------------------- TUE -------------------- WED
   |                        |                        |
   you pin the contract     the server changes it    your agent calls it

   search_docs(             search_docs(             WITHOUT A PIN
     query: string            query: string,         the agent fills the new required
   )                          webhook: string *      param and calls. nothing tells you.
                            )
                            * newly required         WITH MCPINDEX
                            no version bump          |- HELD  added-required-param
                            no notification             held before the call goes out
                            no email

  the tool your agent trusted on monday changed on tuesday. nothing in MCP told you.`,
  },
  {
    id: 'trust-boundary',
    fig: '03',
    title: 'Trust boundary',
    claim: 'By default, nothing crosses the boundary to mcpindex.',
    alt: 'Inside your host sit the agent, the mcpindex gate and a local pin store. By default nothing crosses to mcpindex because the tier-0 contract diff runs locally. The tool call and your credentials pass through untouched to the MCP server and the gate holds no keys. Two optional opt-in crossings exist: a contract hash to the mcpindex US edge, and a salted HMAC fingerprint to the drift network. Tokens, arguments, schema bodies, descriptions, URLs, server names, tool names and your call data never cross.',
    queries: ['mcp security architecture', 'mcp trust boundary', 'does mcpindex phone home', 'mcp gate data flow'],
    placements: ['/trust', '/privacy', '/diagrams/trust-boundary'],
    derives: [],
    tripwire: 'default-build-egresses-nothing',
    reviewed: REVIEWED,
    twin: `+- YOUR HOST ---------------------------------------+
|                                                   |
|   [ agent ] <-> [ mcpindex gate ] <-> [ pin store ]|
|                                        local disk |
+-----------+---------------------------+-----------+
            |                           |
   DEFAULT  | nothing crosses to        | tools/call + your credentials
            | mcpindex. the tier-0      +-------------> [ MCP server ]
            | contract-diff runs here.  |  passed through untouched.
            |                           |  the gate holds no keys.
    OPT-IN  | contract hash ------------------------> [ mcpindex edge - US ]
            | a deterministic hash of the public tool contract
    OPT-IN  | salted HMAC fingerprint --------------> [ drift network ]
            | + change type, safety flag, hour-rounded time. fail-open.
            |
     NEVER  X tokens - arguments - schema bodies - descriptions
            X URLs - server names - tool names - your call data`,
  },
  {
    id: 'tier-ladder',
    fig: '04',
    title: 'The tier ladder',
    claim: 'Only the deterministic rung is on. Tiers 1 to 3 are built and held off by default.',
    alt: 'A four-rung ladder. Tier 0, the deterministic contract diff over the ChangeKind taxonomy plus a marker scan, is live, runs first, is local and egresses nothing, and fails closed. Tier 1 cloud corpus lookup, tier 2 LLM consult and tier 3 behavioural verifier are built as in-path seams but each is held off by default and requires explicit opt-in. The default build is tier 0 only. The behavioural tier clears or refutes a change; it never proves a tool safe.',
    queries: ['mcp trust tiers', 'mcpindex tier 0', 'deterministic contract diff', 'mcp gate architecture'],
    placements: ['/methodology', '/trust', '/diagrams/tier-ladder'],
    derives: ['well-known:drift_gate.tiers'],
    tripwire: 'tiers1to3_held_off_by_default_opt_in',
    reviewed: REVIEWED,
    twin: `  TIER 3  behavioural verifier   clears or refutes a change   [ ] HELD OFF - opt-in
          exercises the changed tool                             executes the tool
  TIER 2  LLM consult            judges the ambiguous         [ ] HELD OFF - opt-in
                                                                 an LLM call
  TIER 1  cloud corpus lookup    judged once, known           [ ] HELD OFF - opt-in
                                 everywhere                      a contract hash leaves
  ---------------------------------------------------------------------------------
  TIER 0  deterministic          did this contract change     [X] LIVE - runs first
          contract-diff          versus what you pinned?          local - no egress
          ChangeKind taxonomy                                     fail-closed
          + marker scan

  the default build is tier-0 only. it egresses nothing.
  the behavioural tier clears or refutes. it never proves a tool safe.`,
  },
  {
    id: 'anatomy-of-a-hold',
    fig: '05',
    title: 'Anatomy of a hold',
    claim: 'A hold is a decision with three exits, not an error.',
    alt: 'A held call reads: HELD, filesystem write_file. ChangeKind added-required-param, a fixed taxonomy rather than free prose. Pinned: write_file with path and content, which is your baseline. Live: write_file with path, content and a newly required mode parameter, which is what the server sends now. Posture guard, which is why it held; monitor would only notify. Blast radius write, not reversible, stays on this machine. Three exits are offered: re-pin, reject, or tune the posture. All three are reversible.',
    queries: ['mcpindex held my call', 'what does mcp hold mean', 'mcp gate hold output', 'mcpindex first hold'],
    placements: ['/guides/install-the-gate-first-hold', '/receipts', '/diagrams/anatomy-of-a-hold'],
    derives: [],
    reviewed: REVIEWED,
    twin: `  |- HELD   filesystem - write_file
     ChangeKind    added-required-param       (1) fixed taxonomy. never free prose.
     pinned        write_file(path, content)  (2) your baseline. what you saw first.
     live          write_file(path, content,  (3) what the server sends now.
                              mode *)
                              * newly required
     posture       guard                      (4) why it held here. monitor would notify.
     blast radius  WRITE - not reversible     (5) what the call would have done.
                   - stays on this machine
     -> re-pin   -> reject   -> tune posture  (6) three exits. all reversible.

  the gate says "this changed", never "this is unsafe".`,
  },
  {
    id: 'it-held-now-what',
    fig: '06',
    title: 'It held. Now what?',
    claim: 'Every exit from a hold is reversible.',
    alt: 'A decision tree for a held call. If you expected the change, re-pin and the new contract becomes your baseline. If you did not expect it, ask whether it is breaking or destructive: if yes, reject the call, check the server changelog, and check the public ledger to see whether the crawler saw it too; if no, re-pin or move that server to the monitor posture. If the gate is holding too often, move from guard to monitor to notify and proceed, or to strict, which holds anything it cannot prove benign.',
    queries: ['mcpindex re-pin', 'mcp gate too many holds', 'mcpindex posture', 'what to do when mcp call is held'],
    placements: ['/guides/install-the-gate-first-hold', '/guides/tune-postures', '/diagrams/it-held-now-what'],
    derives: [],
    reviewed: REVIEWED,
    twin: `  |- HELD
     |
     +- did you expect this change?
     |     yes --> re-pin. the new contract becomes your baseline. done.
     |      no --> is it breaking or destructive?
     |                 yes --> reject the call. check the server's changelog.
     |                         check /ledger - did the crawler see it too?
     |                  no --> re-pin, or move that server to the monitor posture.
     |
     +- holding too often?
           guard --> monitor    notify and proceed. you still see every change.
           guard --> strict     hold anything not PROVEN benign.

  every exit is reversible. a re-pin can be re-pinned.`,
  },
  {
    id: 'posture-matrix',
    fig: '07',
    title: 'Posture and ChangeKind',
    claim: 'The gate reads a fixed table, not a judgement call - and strict does not hold every drift.',
    alt: 'A matrix of the twelve surfaced ChangeKinds against the three postures, generated from the gate source. Monitor never blocks: every kind returns proceed-with-note. Guard, the default, holds the eight kinds that carry the safety bit, resolves annotation-flip-to-destructive and output-schema-changed to inconclusive because behaviour is the gate rather than a block, and lets the two provably benign kinds proceed. Strict matches guard except that it also holds the inconclusive pair; it does not hold every drift, because the benign auto-accept runs before the posture layer and re-pins a proven-benign change. An injection or exfiltration marker is a separate scan rather than a ChangeKind, so it is not a row, though guard blocks on it.',
    queries: ['mcp changekind taxonomy', 'mcpindex postures', 'monitor guard strict mcp', 'mcp contract diff kinds'],
    placements: ['/guides/tune-postures', '/methodology', '/diagrams/posture-matrix'],
    derives: [
      'SURFACE_CHANGE_KINDS',
      'SAFETY_RELEVANT_CHANGE_KINDS',
      'BENIGN_AUTOACCEPT_CHANGE_KINDS',
      'BEHAVIORAL_MANDATED_CHANGE_KINDS',
    ],
    tripwire: 'surface-taxonomy-size',
    reviewed: REVIEWED,
    twin: posturesTwin(),
  },
  {
    id: 'two-jobs-two-packages',
    fig: '08',
    title: 'Two jobs, two packages',
    claim: 'Installing the directory client does not install the gate.',
    alt: 'Two different jobs. Job one is the gate, installed from PyPI as mcpindex-gate: it runs in your call path, it can hold a call, and it cannot tell you what to install. Job two is the directory client, installed from npm as mcp-server-mcpindex or connected remotely: it runs beside your agent as an MCP server, it can search, recommend and look up an advisory verdict, and it cannot stop a call. Installing job two does not install job one. The mcp-index SDK and Mastra binding let you embed either job in your own code.',
    queries: ['mcpindex gate vs directory', 'mcpindex-gate vs mcp-server-mcpindex', 'which mcpindex package'],
    placements: ['/install', '/which-mcpindex', '/diagrams/two-jobs-two-packages'],
    derives: ['PACKAGES'],
    reviewed: REVIEWED,
    twin: `        JOB 1 - THE GATE          |        JOB 2 - THE DIRECTORY CLIENT
  ------------------------------  |  ------------------------------------------
  uv / pip:  mcpindex-gate        |  npm:  mcp-server-mcpindex
                                  |        or remote: mcpindex.ai/api/mcp
  runs   in your call path        |  runs   beside your agent, as an MCP server
  can    HOLD a call              |  can    search - recommend - look up a verdict
  cannot tell you what to install |  cannot stop a call

  ! installing job 2 does not install job 1. different package, different job.
  ---------------------------------------------------------------------------
  @mcp-index/sdk - @mcp-index/mastra   embed either job in your own code`,
  },
  {
    id: 'two-verdict-surfaces',
    fig: '09',
    title: 'Two verdict surfaces',
    claim: 'The screen verdict and the gate verdict are different axes. Neither overrides the other.',
    alt: 'Two surfaces emit verdicts and they are separate axes. The advisory screen, read before you wire a tool, is semantic-only and out of the call path: REVIEW and UNVERIFIED are produced today, while ALLOW and DENY are reserved in the contract and not produced at v1 because a clearing ALLOW requires the behavioural conformance probe that is gated to the D3 labelled-corpus milestone. The in-path gate emits HOLD when the live contract differs from your pin and PROCEED when it matches. The screen is a prior; the gate is the decision.',
    queries: ['mcp allow deny review unverified', 'mcpindex verdict states', 'mcp trust verdict meaning'],
    placements: ['/methodology', '/screen', '/diagrams/two-verdict-surfaces'],
    derives: ['D3_CONFORMING_LABELS', 'D3_REQUIRED_LABELS'],
    tripwire: 'd3-not-graduated',
    reviewed: REVIEWED,
    twin: `  ADVISORY SCREEN (before you wire)      |  IN-PATH GATE (during the call)
  -------------------------------------  |  --------------------------------
              eval ran?                  |
              yes         no             |   |- HOLD     the live contract differs
   cleared    ALLOW       .              |               from what you pinned
              reserved                   |
   crossed    DENY        .              |   -> PROCEED  the contract matches
              reserved                   |
   ambiguous  REVIEW      .              |  deterministic. fail-closed.
              live                       |
       none   .           UNVERIFIED     |
                          live           |
  -------------------------------------  |  --------------------------------
  semantic, advisory, out of path        |  in-path, can actually stop the call

  ALLOW and DENY are reserved in the contract, not produced at v1: a clearing
  ALLOW requires the behavioural conformance probe, gated to the D3 labelled
  corpus ({d3progress} labels). neither surface overrides the other - the
  screen is a prior, the gate is the decision.`,
  },
  {
    id: 'drift-network-loop',
    fig: '10',
    title: 'The drift network loop',
    claim: 'The crawler catches the drift before you do, so you are warned on call one.',
    alt: 'mcpindex crawls the public MCP registry every day, re-derives every tool contract, and records each silent change as a fingerprint-only ledger entry anchored to Bitcoin via OpenTimestamps and published on the public ledger. When your gate pins a tool it can query that network and warn you on the very first call. The corroboration count floors at the crawler as a single first-party source; forgeable install reports are excluded from the public number. The advisory rides alongside the verdict and never moves a PROCEED or a HOLD.',
    queries: ['mcp drift ledger', 'mcp registry crawl', 'mcp contract change history', 'mcpindex drift network'],
    placements: ['/ledger', '/methodology', '/diagrams/drift-network-loop'],
    derives: [],
    reviewed: REVIEWED,
    twin: `        daily crawl of the public MCP registry
                     |
                     v
        re-derive every tool contract
                     |
                     v
        change detected --> fingerprint-only ledger entry --> OTS anchor --> /ledger
                     |                                                        public
                     v
        fleet query  GET /api/v1/drift/any?fp=...
                     |
                     v
        your gate warns you on the FIRST call
        advisory only - it never moves a PROCEED or a HOLD

  corroboration floors at the crawler (sources=1). forgeable install reports are
  excluded from the public count. entries are fingerprint-only: no schema, no
  argument, no description, no URL, no server or tool name.`,
  },
  {
    id: 'blast-radius',
    fig: '11',
    title: 'Blast radius',
    claim: 'To an agent, a search and an irreversible delete are both just "a tool call" until something labels them.',
    alt: 'Two tool calls look identical to an agent. Running each through the deterministic blast-radius classifier separates them: search_docs is a read that touches documents, has no reversal question and stays local, so its autonomy ceiling is autonomous. delete_repo is a delete that touches a repository, is not reversible and stays local, so its ceiling is ask a human. The grade is read from the tool declared contract and does not run the tool. Ambiguous contracts grade toward the more dangerous class, never down. It is advisory: mcpindex labels the blast radius and your agent or IDE decides.',
    queries: ['mcp blast radius', 'mcp tool autonomy', 'agent tool approval', 'mcp destructive tool detection'],
    placements: ['/scan', '/diagrams/blast-radius'],
    derives: ['well-known:blast_radius.fields'],
    reviewed: REVIEWED,
    twin: `  to your agent, both of these are just "a tool call":

    search_docs(query)                      delete_repo(name)
          |                                       |
   ACTION | read                           delete |
  TOUCHES | documents                      a repo |
  REVERSE | n/a                     not reversible|
   EGRESS | stays local                stays local|
          v                                       v
   CEILING  autonomous                    ask a human

  deterministic and static, read from the tool's own declared contract.
  it does not run the tool. ambiguous contracts grade toward the more
  dangerous class, never down. advisory: mcpindex labels the blast radius,
  your agent or IDE decides.`,
  },
  {
    id: 'provenance-chain',
    fig: '12',
    title: 'The provenance chain',
    claim: 'The history cannot be quietly rewritten. Here is exactly what that does not prove.',
    alt: 'A verdict is hashed with SHA-256 into an entry, chained to the prior entry, folded into a daily digest, and timestamped to Bitcoin via OpenTimestamps. Pending arrives in about ten minutes and Bitcoin-finalized at six confirmations in about an hour. This proves the verdict existed by some Bitcoin block and that the chain is auditable end to end. It does not prove minute-level ordering inside the confirmation window, and checking confirmation depth is the relying party job against their own Bitcoin node.',
    queries: ['opentimestamps verdict', 'bitcoin anchored audit log', 'mcp verdict provenance', 'hash chained trust record'],
    placements: ['/trust', '/research/source-liveness', '/diagrams/provenance-chain'],
    derives: [],
    reviewed: REVIEWED,
    twin: `  verdict --sha256--> entry --chained to prior--> daily digest --OTS--> bitcoin block
                                                                            |
                                                          ~10 min ----------+ pending
                                                          ~1 hour ----------+ N=6, final

  PROVES     the verdict existed by some block. the chain is auditable end to end.
  DOES NOT   prove minute-level ordering inside the confirmation window.
             confirmation-depth checking is the relying party's job, against
             their own bitcoin node.`,
  },
  {
    id: 'category-map',
    fig: '13',
    title: 'Scanner, gateway, allow-list, gate',
    claim: 'Four categories separated by when they act and what they can do about it. Only one is contract-aware and in the call path.',
    alt: 'A positional map of four tool categories by when they act and what they can do. A static scanner reads a server before install and can only advise. An allow-list or authentication check acts at install time and gates identity rather than the contract. An API gateway acts in the call path but at the network layer and is contract-blind. An audit log acts after the fact and can only tell you. The mcpindex gate acts in the call path, is contract-aware, and can hold. Categories only; no vendor is named.',
    queries: ['mcp scanner vs gateway', 'mcp security tools comparison', 'mcp allow list vs gate', 'trust to act'],
    placements: ['/guides/mcp-scanner-vs-gateway', '/about', '/diagrams/category-map'],
    derives: [],
    reviewed: REVIEWED,
    twin: `  what it       +-----------------------------------------------------------+
  can do        |                                                           |
                |                              * mcpindex gate              |
   HOLD  -------|                              contract-aware, in-path      |
                |                                                           |
                |        * allow-list / auth        * API gateway           |
   BLOCK -------|        gates identity,            gates the network,      |
                |        not the contract           contract-blind          |
                |                                                           |
  ADVISE -------|  * static scanner                          * audit log    |
                |  reads it once                             tells you after|
                +-----------------------------------------------------------+
                   BEFORE INSTALL    AT INSTALL    IN THE CALL PATH   AFTER
                                        when it acts

  categories, not vendors. the axes are factual: when a control runs, and what
  it is able to do when it runs.`,
  },
  {
    id: 'corpus-pipeline',
    fig: '14',
    title: 'Where the numbers come from',
    claim: 'The server count is a defined population, not a scrape. Every stage carries its exclusion rule.',
    alt: 'The registry population funnel. All entries from the official MCP registry are narrowed by excluding delisted and superseded versions, leaving the active latest-version entries that mcpindex publishes as its server count. A reachability probe narrows that to the reachable remote servers that form the drift-ledger population. Quality scoring and a semantic index produce the ranked searchable corpus behind the servers, search and leaderboard pages. A screen queue that takes adversarial cases first produces the advisory screen verdicts, which are REVIEW or UNVERIFIED at v1.',
    queries: ['how many mcp servers are there', 'mcp registry size', 'mcp server count', 'mcp directory methodology'],
    placements: ['/stats', '/diagrams/corpus-pipeline'],
    derives: ['getServerCount', 'getCategoryCount'],
    reviewed: REVIEWED,
    twin: `  registry.modelcontextprotocol.io          all entries
        |  exclude delisted + superseded versions
        v
  active latest-version entries             {servers} servers  <- the number we publish
        |  reachability probe                {categories} categories
        v
  reachable remote servers                  the drift-ledger population
        |  quality scoring (lib/quality.ts) + semantic index
        v
  ranked + searchable corpus                /servers - /search - /leaderboard
        |  screen queue (adversarial cases first)
        v
  advisory screen verdicts                  REVIEW / UNVERIFIED at v1

  delisted and superseded versions are excluded so the same server never
  counts twice. the count is a defined population, not a scrape.`,
  },
  {
    id: 'source-liveness-census',
    fig: '15',
    title: 'Source liveness census',
    claim: `${SOURCE_LIVENESS_CENSUS.pctUnreachable} of referenced repositories were unreachable, confirmed by two independent vantages with zero disagreements.`,
    alt: `A census funnel over the MCP registry. ${SOURCE_LIVENESS_CENSUS.serversTotal} listed servers reference ${SOURCE_LIVENESS_CENSUS.reposTotal} GitHub repositories. Each repository was checked from two independent vantages with a 48-hour debounce, producing zero cross-vantage disagreements. ${SOURCE_LIVENESS_CENSUS.reposUnreachable} repositories, ${SOURCE_LIVENESS_CENSUS.pctUnreachable}, were not publicly reachable, affecting ${SOURCE_LIVENESS_CENSUS.serversAffected} listed servers. The census digest is anchored to Bitcoin via OpenTimestamps and archived under CC-BY-4.0 with a DOI. The evidence is negative-only: an absent entry means nothing publishable, never a healthy verdict.`,
    queries: ['mcp registry dead links', 'mcp server repository unreachable', 'mcp registry quality research'],
    placements: ['/research/source-liveness', '/diagrams/source-liveness-census'],
    derives: ['SOURCE_LIVENESS_CENSUS'],
    reviewed: REVIEWED,
    twin: `  listed servers                    ${SOURCE_LIVENESS_CENSUS.serversTotal}
        |  extract referenced source repositories
        v
  referenced GitHub repositories    ${SOURCE_LIVENESS_CENSUS.reposTotal}
        |
        +-- vantage A --+
        |               +-- 0 cross-vantage disagreements (48h debounce)
        +-- vantage B --+
        v
  not publicly reachable            ${SOURCE_LIVENESS_CENSUS.reposUnreachable}  (${SOURCE_LIVENESS_CENSUS.pctUnreachable}, ${SOURCE_LIVENESS_CENSUS.ratioPhrase})
        |
        v
  listed servers affected           ${SOURCE_LIVENESS_CENSUS.serversAffected}

  census date ${SOURCE_LIVENESS_CENSUS.sweepDate}. digest anchored to bitcoin via OpenTimestamps.
  CC-BY-4.0, DOI 10.5281/zenodo.21501867 (concept DOI - resolves to the current version).
  NEGATIVE-ONLY evidence: an absent entry means nothing publishable, never
  "verified healthy" - a reachable repo proves only that a URL resolves.`,
  },
  {
    id: 'ninety-second-path',
    fig: '16',
    title: 'The 90-second path',
    claim: 'After you install, the correct experience is that nothing visible happens.',
    alt: 'The install timeline. At zero seconds you install the gate; at about twenty seconds the installer wires every MCP host it detects; at about thirty seconds you restart the host; at about forty-five seconds the first tools/list pins every tool, silently, with nothing to configure and nothing to see. Then nothing happens until the first drift, which is your first hold and the only time the gate interrupts you. Silence after install is the gate working, not the gate being broken.',
    queries: ['mcpindex install nothing happened', 'is the mcp gate working', 'mcpindex first run', 'mcp gate setup'],
    placements: ['/install', '/guides/install-the-gate-first-hold', '/diagrams/ninety-second-path'],
    derives: ['GATE_WIRING_HOSTS'],
    reviewed: REVIEWED,
    twin: `   0s ------ 20s ------ 30s ------ 45s -------------- whenever
    |          |          |          |                     |
  install    wire your  restart    first tools/list      first drift
  the gate   hosts      the host   = every tool pinned   = your first HOLD

                                   +---- silent ----+    +--- the point ---+
                                   | nothing to     |    | this is the only|
                                   | configure.     |    | time the gate   |
                                   | nothing to     |    | interrupts you. |
                                   | see. correct.  |    |                 |
                                   +----------------+    +-----------------+

  silence after install is the gate working, not the gate being broken.`,
  },
  {
    id: 'mcp-needs-a-lockfile',
    fig: '17',
    title: 'MCP needs a lockfile',
    claim: 'npm has package-lock. pip has a lock. The MCP protocol has no equivalent row.',
    alt: 'A comparison of dependency pinning across ecosystems. With npm you declare in package.json and pin in package-lock.json with a sha512 per package, and npm ci fails on drift. With pip you declare in requirements.txt and pin in a lock file with a hash per wheel, and pip check fails on drift. With MCP you declare in mcp.json, but the protocol defines no lock file, no integrity hash, and no drift check, so a changed tool contract is silently accepted. The gate trust-on-first-use pin is that missing row, written per tool by observation instead of by hand.',
    queries: ['mcp lockfile', 'mcp.lock', 'mcp dependency pinning', 'package-lock for mcp'],
    placements: ['/guides/mcp-lock', '/diagrams/mcp-needs-a-lockfile'],
    derives: [],
    reviewed: REVIEWED,
    twin: `                  npm                    pip                    MCP
  you declare     package.json           requirements.txt       mcp.json
  you pin         package-lock.json      a lock file            (none in the protocol)
  integrity       sha512 per package     hash per wheel         (none in the protocol)
  drift caught    npm ci fails           pip check fails        silently accepted

  mcp.lock is the missing row. the gate's trust-on-first-use pin is that row,
  written per tool by observation instead of by hand.`,
  },
];

/** Interpolate `{token}` placeholders in a twin (live counts, derived progress). */
export function renderTwin(twin: string, vars: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    d3progress: `${D3_CONFORMING_LABELS}/${D3_REQUIRED_LABELS}`,
    ...vars,
  };
  return twin.replace(/\{(\w+)\}/g, (m, k) => base[k] ?? m);
}

export function getDiagram(id: string): DiagramMeta | undefined {
  return DIAGRAMS.find((d) => d.id === id);
}

/** Figures placed on a given route, in figure order. */
export function diagramsFor(route: string): DiagramMeta[] {
  return DIAGRAMS.filter((d) => d.placements.includes(route));
}

export const DIAGRAM_LICENSE = 'CC BY 4.0';
export const DIAGRAM_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

/** The copy-paste attribution a reuser needs. Easy beats correct-but-tedious. */
export function attributionHtml(d: DiagramMeta): string {
  return `<a href="https://mcpindex.ai/diagrams/${d.id}">${d.title} - mcpindex.ai</a> (CC BY 4.0)`;
}
