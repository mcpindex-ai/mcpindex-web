import Link from 'next/link';
import type { Metadata } from 'next';
import { CiteBibtex } from '@/components/CiteBibtex';
import {
  CITATION_DRIFT_DEFINITION,
  CITATION_DRIFT_REPORT_EDITION_V1,
  CITATION_PANEL,
  CITATION_PAPER,
} from '@/lib/citations';
import {
  CONTEXT_SURFACE_CHANGE_KINDS,
  SAFETY_RELEVANT_CHANGE_KINDS,
  SURFACE_CHANGE_KINDS,
} from '@/lib/changeKinds';
import {
  DRIFT_CONTRACT_SCOPE,
  DRIFT_DEFINITION,
  DRIFT_TERM,
  LIVE_CONCENTRATION,
  LIVE_EDITION,
  REGISTRY_PANEL,
} from '@/lib/driftDefinition';
import { jsonLdSafe } from '@/lib/jsonLd';
import { kindLabel } from '@/lib/kindLabels';
import { pageMetadata } from '@/lib/seo';

// Fully static: every value is a frozen figure or a fixed taxonomy. The running count lives on
// /ledger, which this page links to and never reads, so a cited number cannot change under a reader.

export const metadata: Metadata = pageMetadata({
  title: 'MCP tool drift: definition and measured rates',
  description:
    "MCP tool drift is a change to a tool's contract after a client has seen it. What counts " +
    'as drift and how often it happens, with DOIs.',
  image: '/opengraph-image',
  path: '/drift',
});

const CELL = 'py-2.5 pr-6 align-top';
const NUM = `${CELL} font-mono text-[var(--color-ink)] whitespace-nowrap`;
const P = 'mt-4 text-[15px] leading-[1.65] text-[var(--color-cite)]';
const H2 = 'mt-12 t-h2 font-medium text-[var(--color-ink)]';
const LINK =
  'underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]';

const n = (x: number) => x.toLocaleString('en-US');

export default function DriftDefinitionPage() {
  const L = LIVE_EDITION;
  const C = LIVE_CONCENTRATION;
  const R = REGISTRY_PANEL;
  const kinds = [...SURFACE_CHANGE_KINDS];
  const serverKinds = [...CONTEXT_SURFACE_CHANGE_KINDS];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: DRIFT_TERM,
    alternateName: ['tool drift', 'MCP contract drift'],
    description: `${DRIFT_DEFINITION} ${DRIFT_CONTRACT_SCOPE}`,
    url: 'https://mcpindex.ai/drift',
  };

  return (
    <article className="site-container pt-16 pb-24 max-w-[52rem]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} />

      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Definition
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">{DRIFT_TERM}</h1>

      <p className="mt-6 text-[18px] leading-[1.6] text-[var(--color-ink)] border-l-2 border-[var(--color-rule)] pl-4">
        {DRIFT_DEFINITION}
      </p>
      <p className={P}>
        {DRIFT_CONTRACT_SCOPE} Drift is found by comparing the contract a client recorded when it
        first saw the tool with the one the server returns now. Nothing in the protocol makes a
        server announce the change: the <code>notifications/tools/list_changed</code> message is
        optional, and a tool contract carries no signature.
      </p>

      <h2 className={H2}>Related terms</h2>
      <dl className="mt-4 text-[15px] leading-[1.65] text-[var(--color-cite)]">
        <dt className="font-medium text-[var(--color-ink)]">Silent drift</dt>
        <dd className="mt-1">
          Drift that ships while the server&apos;s declared version stays the same. The word is about
          version evidence only. It says nothing about intent.
        </dd>
        <dt className="mt-4 font-medium text-[var(--color-ink)]">Rug pull</dt>
        <dd className="mt-1">
          What security writing calls drift done on purpose, after a tool has passed review. The
          term asserts intent. Drift does not, and a contract diff cannot tell a rug pull from
          routine maintenance.
        </dd>
        <dt className="mt-4 font-medium text-[var(--color-ink)]">Registry drift</dt>
        <dd className="mt-1">
          A change to the server&apos;s entry in the MCP registry. The entry is what a server says
          about itself and the contract is what it serves, and either can move while the other
          stays put.
        </dd>
        <dt className="mt-4 font-medium text-[var(--color-ink)]">Safety-relevant drift</dt>
        <dd className="mt-1">
          Drift of a kind marked safety-relevant in the table below: a change a person should look
          at before the tool runs again.
        </dd>
      </dl>

      <h2 className={H2}>What counts</h2>
      <p className={P}>
        Each change the crawler observes is classified into a fixed set of kinds. These are the
        tool-level kinds published on the <Link href="/ledger" className={LINK}>drift ledger</Link>.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[14px] leading-[1.5] text-[var(--color-cite)]">
          <thead>
            <tr className="rule-b text-left font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mute)]">
              <th className={CELL}>Kind</th>
              <th className={CELL}>What changed</th>
              <th className={CELL}>Safety-relevant</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => (
              <tr key={k} className="rule-b">
                <td className={`${CELL} font-mono text-[13px] text-[var(--color-ink)]`}>{k}</td>
                <td className={CELL}>{kindLabel(k)}</td>
                <td className={CELL}>{SAFETY_RELEVANT_CHANGE_KINDS.has(k) ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={P}>
        The ledger also publishes {serverKinds.length} server-level kinds, all safety-relevant:{' '}
        {serverKinds.map((k, i) => (
          <span key={k}>
            {kindLabel(k)} (<code>{k}</code>){i < serverKinds.length - 1 ? '; ' : '.'}
          </span>
        ))}
      </p>
      <p className={P}>
        More kinds are recorded and kept off the ledger, among them a tool being added and an edit
        to description text with no structural change. A description edit is still drift under the
        definition above, and a poisoned description is one way an attack arrives, but on its own
        the classifier grades it cosmetic.
      </p>

      <h2 className={H2}>What drift is not</h2>
      <p className={P}>
        A contract diff says the contract changed. Whether the new contract is safe is a separate
        question, and this page makes no safety call.
      </p>
      <p className={P}>
        A change in behavior under an unchanged contract is outside the definition. A server that
        keeps its contract byte for byte and changes what the tool does is invisible to any contract
        comparison, including ours.
      </p>

      <h2 className={H2}>How it is measured</h2>
      <p className={P}>
        Live contracts: a daily crawl of the reachable remote servers in the official MCP registry
        calls <code>tools/list</code> on each and compares every snapshot with the one before it,
        so it also records changes that are later reverted. Only servers reachable in both
        snapshots are compared, so a server going offline never counts as its tools being removed.
        The frozen edition below covers {L.snapshots} snapshots across {L.days} days,{' '}
        {L.firstSnapshot} to {L.lastSnapshot}, including a {L.outageDays}-day crawler outage.
        Changes that happened and were undone entirely inside the outage were never observed.
      </p>
      <p className={P}>
        Registry entries: {R.observations} observations of the official registry over {R.spanDays}
        {' '}days, to {R.cutoff}. For each starting observation, take every server listed then and
        count the share whose entry differed from its starting value at any observation within N
        days; a change that later reverts still counts. Each rate is the mean over starting
        observations: {R.cohorts.d30} for 30 days, {R.cohorts.d60} for 60 and {R.cohorts.d89} for 89,
        the last using windows of at least {R.minWindowDaysAt89} days.
      </p>

      <h2 className={H2}>The numbers</h2>
      <h3 className="mt-6 text-[15px] font-medium text-[var(--color-ink)]">
        Live contracts, Drift Report Edition v1
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[14px] leading-[1.5] text-[var(--color-cite)]">
          <tbody>
            <tr className="rule-b">
              <td className={CELL}>
                Safety-relevant contract changes, deduped to one per server, tool and kind
              </td>
              <td className={NUM}>{n(L.incidents)}</td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>Shipped with the declared version unchanged</td>
              <td className={NUM}>
                {L.silentPct}% ({n(L.sameVersion)})
              </td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>The same share with the {L.unstableTools} unstable tools left out</td>
              <td className={NUM}>
                {L.stableSilentPct}% of {n(L.stableIncidents)}
              </td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>Annotation flipped toward destructive</td>
              <td className={NUM}>
                {L.flips}, on {C.flipServers} servers
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={P}>
        The {n(L.incidents)} changes came from {C.servers} servers and span {L.kindsObserved} of the
        safety-relevant kinds above. Of the {L.flips} flips to destructive, {L.flipsFirstLabel} were
        a tool declaring annotations for the first time and {L.flipsGuaranteeChange} changed an
        annotation the tool already had. No single publisher accounts for the same-version share:
        the largest supplied {C.topSameVersionPct}% of those changes ({C.topSameVersionPublisher} of{' '}
        {n(L.sameVersion)}) and the top five together {C.topFiveSameVersionPct}%.
      </p>

      <h3 className="mt-8 text-[15px] font-medium text-[var(--color-ink)]">
        Registry entries, MCP Registry Drift Panel
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[14px] leading-[1.5] text-[var(--color-cite)]">
          <thead>
            <tr className="rule-b text-left font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mute)]">
              <th className={CELL}>Share of servers that changed</th>
              <th className={CELL}>30 days</th>
              <th className={CELL}>60 days</th>
              <th className={CELL}>89 days</th>
            </tr>
          </thead>
          <tbody>
            <tr className="rule-b">
              <td className={CELL}>Description text, the part a reviewer reads</td>
              <td className={NUM}>{R.descriptionPct.d30}%</td>
              <td className={NUM}>{R.descriptionPct.d60}%</td>
              <td className={NUM}>{R.descriptionPct.d89}%</td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>
                Any field of the entry, an upper bound that also counts bare version bumps
              </td>
              <td className={NUM}>{R.descriptorPct.d30}%</td>
              <td className={NUM}>{R.descriptorPct.d60}%</td>
              <td className={NUM}>{R.descriptorPct.d89}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={P}>
        Of the {n(R.eligible)} servers seen in at least {R.eligibleMinObservations} observations,{' '}
        {R.neverChangedPct}% never changed their entry in the window, and the tenth of them that
        changed most account for {R.topTenthSharePct}% of all changes.
      </p>
      <p className={P}>
        These figures are frozen and will not move. The running count is on the{' '}
        <Link href="/ledger" className={LINK}>drift ledger</Link>, and the full live-contract
        analysis is <Link href="/drift-report" className={LINK}>The MCP Drift Report</Link>.
      </p>

      <h2 className={H2}>Cite this</h2>
      <p className={P}>
        Cite the definition when you use the term, and the paper or datasets when you use a number.
        The datasets are on Zenodo under CC-BY-4.0 and the figures recompute from their files. The
        paper is a preprint and has not been peer reviewed.
      </p>
      <CiteBibtex citation={CITATION_DRIFT_DEFINITION} className="mt-4" />
      <CiteBibtex citation={CITATION_PAPER} className="mt-4" />
      <CiteBibtex citation={CITATION_DRIFT_REPORT_EDITION_V1} className="mt-4" />
      <CiteBibtex citation={CITATION_PANEL} className="mt-4" />

      <p className="mt-10 text-[14px] leading-[1.6] text-[var(--color-mute)]">
        Guides that apply this:{' '}
        <Link href="/guides/mcp-silent-contract-drift" className={LINK}>
          silent contract drift and how to hold it
        </Link>
        ,{' '}
        <Link href="/guides/how-to-monitor-mcp-servers-for-tool-description-drift" className={LINK}>
          how to monitor for it
        </Link>
        . Corrections:{' '}
        <a href="mailto:hello@mcpindex.ai?subject=MCP%20tool%20drift%20definition" className={LINK}>
          hello@mcpindex.ai
        </a>
        .
      </p>
    </article>
  );
}
