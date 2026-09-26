import Link from 'next/link';
import { CiteBibtex } from '@/components/CiteBibtex';
import type { Metadata } from 'next';
import { CITATION_BINDING_GAP_PAPER, CITATION_DECLARED_EFFECT } from '@/lib/citations';
import { pageMetadata } from '@/lib/seo';

// Every figure below is the one printed in the talk, read from the paper's section 3 and
// the v1 deposit (version DOI 10.5281/zenodo.21778282). They are frozen with the deck:
// a later deposit version does not update this page, it gets its own edition.
const FIG = {
  crawls: 35,
  windowStart: '2026-06-09',
  windowEnd: '2026-08-01',
  entriesAttempted: '4,909',
  serversServing: '2,043',
  tools: '44,172',
  declaringTools: '37,001',
  declaredPct: '83.8%',
  boundPct: '59.3%',
  gapPoints: '24.5',
  gapLow: '21.6',
  gapHigh: '24.7',
} as const;

export const metadata: Metadata = pageMetadata({
  title: 'The Binding Gap: MCP tool contracts that change after you approve them',
  description:
    `Talk at AI Context San Jose, 23 Sep 2026. Across ${FIG.tools} MCP tools, ${FIG.declaredPct} ` +
    `declare an effect but only ${FIG.boundPct} stay bound to the contract served. Slides and data.`,
  image: '/opengraph-image',
  path: '/research/binding-gap',
});

const CELL = 'py-2.5 pr-6 align-top';
const LINK =
  'underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]';

export default function BindingGapTalkPage() {
  return (
    <article className="site-container pt-16 pb-24 max-w-[52rem]">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Talk &middot; AI Context San Jose &middot; 23 September 2026
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        The Binding Gap: the MCP tool your agent vetted is not always the tool it calls.
      </h1>

      <p className="mt-6 text-[16px] leading-[1.65] text-[var(--color-cite)]">
        An agent&apos;s tools get reviewed once, at install. The contract the agent
        actually calls is served live by someone else&apos;s process, and MCP&apos;s
        change notification is optional, so a server can rewrite what a tool claims
        to do after you approved it. Same tool name, sometimes the same version
        number, and nothing in the protocol requires the server to tell you. Some
        people call this a rug pull. I call it drift, and this talk measured how
        much of it there is.
      </p>

      <p className="mt-4">
        <a
          href="/the-binding-gap.pdf"
          className="inline-block font-mono text-[13px] border border-[var(--color-rule)] px-4 py-2 text-[var(--color-ink)] hover:text-[var(--color-accent-strong)]"
        >
          Download the slides (PDF, 23 pages)
        </a>
      </p>

      <h2 className="mt-12 t-h2 font-medium text-[var(--color-ink)]">What was measured</h2>
      <p className="mt-4 text-[15px] leading-[1.65] text-[var(--color-cite)]">
        {FIG.crawls} crawls of the public MCP registry between {FIG.windowStart} and{' '}
        {FIG.windowEnd}. Of {FIG.entriesAttempted} registry entries attempted,{' '}
        {FIG.serversServing} servers were reachable and serving tools. Every figure
        is a share of that crawlable population and says nothing about the rest of
        the registry listing.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[14px] leading-[1.5] text-[var(--color-cite)]">
          <tbody>
            <tr className="rule-b">
              <td className={CELL}>Tool contracts observed</td>
              <td className={`${CELL} font-mono text-[var(--color-ink)]`}>{FIG.tools}</td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>Declare an effect annotation ({FIG.declaringTools} tools)</td>
              <td className={`${CELL} font-mono text-[var(--color-ink)]`}>{FIG.declaredPct}</td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>Still carry a declaration bound to the contract the server returns</td>
              <td className={`${CELL} font-mono text-[var(--color-ink)]`}>{FIG.boundPct}</td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>Binding gap, percentage points</td>
              <td className={`${CELL} font-mono text-[var(--color-ink)]`}>{FIG.gapPoints}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[15px] leading-[1.65] text-[var(--color-cite)]">
        Across every corroboration setting tested the gap stays between{' '}
        {FIG.gapLow} and {FIG.gapHigh} points. A tool that drifted before the first
        crawl still counts as bound, so the real gap is wider than this.
      </p>

      <h2 className="mt-12 t-h2 font-medium text-[var(--color-ink)]">
        What to do about it
      </h2>
      <p className="mt-4 text-[15px] leading-[1.65] text-[var(--color-cite)]">
        Pin the tool contract you approved. When the server serves a different one,
        auto-accept only the changes you can prove are benign and hold the rest for
        a person. The appendix of the slides walks through one run of a gate doing
        this: a pinned contract, a call that runs, the server rewriting the tool,
        the same call refused, and a harmless change let through. The gate in that
        demo is mcpindex, which I build. The longer write-up on the threat is{' '}
        <Link href="/guides/mcp-silent-contract-drift" className={LINK}>
          MCP rug pulls and silent contract drift
        </Link>
        .
      </p>

      <h2 className="mt-12 t-h2 font-medium text-[var(--color-ink)]">Where the method stops</h2>
      <p className="mt-4 text-[15px] leading-[1.65] text-[var(--color-cite)]">
        A stale declaration can still be accurate. The measurement says the
        contract changed after the declaration was written, never that the tool is
        now unsafe, so this works as a change tripwire and makes no safety call on
        its own. Declared, bound, stale and unobserved are the four states the talk
        uses; the vocabulary was developed jointly with Mayur Agnihotri,
        StraightArc Technologies Pvt. Ltd. (ORCID 0009-0007-0137-3780).
      </p>

      <h2 className="mt-12 t-h2 font-medium text-[var(--color-ink)]">Cite this</h2>
      <p className="mt-4 text-[15px] leading-[1.65] text-[var(--color-cite)]">
        The figures come from a paper and a dataset, both archived on Zenodo under
        CC-BY-4.0 and recomputable from the per-tool files.
      </p>
      <CiteBibtex citation={CITATION_BINDING_GAP_PAPER} className="mt-4" />
      <CiteBibtex citation={CITATION_DECLARED_EFFECT} className="mt-4" />
      <p className="mt-3 text-[13px] leading-[1.6] text-[var(--color-mute)]">
        Figures in the talk are from dataset version{' '}
        <a href="https://doi.org/10.5281/zenodo.21778282" target="_blank" rel="noreferrer" className={LINK}>
          10.5281/zenodo.21778282
        </a>
        . The talk quoted paper version 1.0,{' '}
        <a href="https://doi.org/10.5281/zenodo.22649164" target="_blank" rel="noreferrer" className={LINK}>
          10.5281/zenodo.22649164
        </a>
        ; the BibTeX above uses the concept DOI, which follows later versions.
      </p>

      <p className="mt-10 text-[14px] leading-[1.6] text-[var(--color-mute)]">
        The live record of contract changes across the registry:{' '}
        <Link href="/ledger" className={LINK}>
          the drift ledger
        </Link>
        . Corrections:{' '}
        <a href="mailto:hello@mcpindex.ai?subject=The%20Binding%20Gap%20talk" className={LINK}>
          hello@mcpindex.ai
        </a>
        .
      </p>
    </article>
  );
}
