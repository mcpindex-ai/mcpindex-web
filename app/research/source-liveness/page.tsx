import Link from 'next/link';
import { Figure } from '@/components/Figure';
import { renderDiagram } from '@/components/diagrams';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { SOURCE_LIVENESS_CENSUS as FIG } from '@/lib/sourceLiveness';

// Templated off FIG, not hardcoded. The title and meta were TWO of the sites that
// carried pre-debounce figures for four days, and they are exactly the two the census
// test cannot see, so a literal here can go stale while the suite stays green.
export const metadata: Metadata = pageMetadata({
  title: `Source liveness: ${FIG.serversAffected} listed MCP servers point at source that is not public`,
  description:
    `A ${FIG.sweepDate} census of every repository and website URL in the official MCP registry: ` +
    `${FIG.reposUnreachable} of ${FIG.reposTotal} referenced GitHub repositories were not publicly ` +
    `accessible, affecting ${FIG.serversAffected} of ${FIG.serversTotal} listed servers. Full method, ` +
    `limits, and the deleted-vs-private caveat.`,
  image: '/opengraph-image',
  path: '/research/source-liveness',
});


const CELL = 'py-2.5 pr-6 align-top';

export default function SourceLivenessPage() {
  return (
    <article className="site-container pt-16 pb-24 max-w-[52rem]">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Research · census of {FIG.sweepDate}
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        {FIG.serversAffected} listed MCP servers point at source code that is not
        publicly accessible.
      </h1>

      <p className="mt-6 text-[16px] leading-[1.65] text-[var(--color-cite)]">
        On {FIG.sweepDate} we checked every repository and website URL carried by
        the {FIG.serversTotal} servers in the official MCP registry.{' '}
        {FIG.reposUnreachable} of the {FIG.reposTotal} distinct GitHub
        repositories those servers reference could not be reached, {FIG.ratioPhrase}.
        What has gone is the ability to read the code before you hand it to an
        agent. This census measured URL reachability only; it makes no claim about
        whether a package still installs.
      </p>

      <p className="mt-4 text-[16px] leading-[1.65] text-[var(--color-cite)]">
        Every MCP registry has this problem, mcpindex&rsquo;s own catalog
        included — these are our listings. The difference is that we measure it
        and publish the measurement.
      </p>

      <h2 className="mt-12 t-h2 font-medium text-[var(--color-ink)]">What we found</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[14px] leading-[1.5] text-[var(--color-cite)]">
          <tbody>
            <tr className="rule-b">
              <td className={CELL}>Servers listed in the registry</td>
              <td className={`${CELL} font-mono text-[var(--color-ink)]`}>{FIG.serversTotal}</td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>Distinct GitHub repositories referenced</td>
              <td className={`${CELL} font-mono text-[var(--color-ink)]`}>{FIG.reposTotal}</td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>
                Repositories not publicly accessible (HTTP 404; one HTTP 451)
              </td>
              <td className={`${CELL} font-mono text-[var(--color-ink)]`}>{FIG.reposUnreachable}</td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>Servers affected by an unreachable repository</td>
              <td className={`${CELL} font-mono text-[var(--color-ink)]`}>{FIG.serversAffected}</td>
            </tr>
            <tr className="rule-b">
              <td className={CELL}>
                Website URLs unreachable (single vantage — see limits)
              </td>
              <td className={`${CELL} font-mono text-[var(--color-ink)]`}>{FIG.sitesUnreachable}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 t-h2 font-medium text-[var(--color-ink)]">
        Why &ldquo;not publicly accessible&rdquo; and not &ldquo;deleted&rdquo;
      </h2>
      <p className="mt-4 text-[15px] leading-[1.65] text-[var(--color-cite)]">
        GitHub returns the same 404 for a repository that was deleted and one
        that was made private. We cannot tell those apart, so we do not claim to.
        Both mean the same thing for the reader who matters: the source backing a
        tool your agent may call can no longer be audited by anyone. A maintainer
        who took a repository private on purpose has done nothing wrong, and the
        wording on every affected listing says so.
      </p>

      <h2 className="mt-12 t-h2 font-medium text-[var(--color-ink)]">Method</h2>
      <ol className="mt-4 space-y-3 text-[15px] leading-[1.65] text-[var(--color-cite)] list-decimal pl-5">
        <li>
          Every <code>repositoryUrl</code> and <code>websiteUrl</code> in the{' '}
          {FIG.sweepDate} registry snapshot, de-duplicated to distinct URLs
          ({FIG.reposTotal} repositories from {FIG.serversTotal} servers).
        </li>
        <li>
          Each repository probed with <code>git ls-remote</code>, then — this
          matters — corroborated through the authenticated GitHub API. Anonymous
          git answers a missing repository with a credential prompt rather than a
          404, so a checker that trusts anonymous git alone reports zero
          casualties and looks healthy doing it. That bug hid all{' '}
          {FIG.reposUnreachable} of these from our own first two passes.
        </li>
        <li>
          Only HTTP 404, 410, 451 and NXDOMAIN count as unreachable. Rate limits,
          timeouts, 401s, 403s and 5xx are recorded as <em>unknown</em> and never
          counted against a project.
        </li>
        <li>
          A random sample of 150 was re-checked by hand through a different
          method (unauthenticated web), a different network, and no
          credentials. All {FIG.sampleSize} agreed, which bounds the
          false-positive rate at 2.0% (95% confidence).
        </li>
        <li>
          The sweep&rsquo;s result digest is stamped to Bitcoin via
          OpenTimestamps, so the date of this measurement is independently
          verifiable and cannot be backdated — including by us.
        </li>
      </ol>

      <h2 className="mt-12 t-h2 font-medium text-[var(--color-ink)]">Limits</h2>
      <ul className="mt-4 space-y-3 text-[15px] leading-[1.65] text-[var(--color-cite)] list-disc pl-5">
        <li>
          <strong>Point in time, and confirmed.</strong> The{' '}
          <em>repository</em> counts are for the {FIG.sweepDate} census under the
          same bar as every per-listing flag: two failed checks at least 48 hours
          apart, plus agreement from a second independent vantage. Four
          repositories failed the first check and passed the second, so they are
          not counted here. The website figure is single-vantage and does not
          carry that bar, as the fourth bullet says.
        </li>
        <li>
          <strong>Unreachability, not death dates.</strong> Most affected
          repositories were already unreachable when we first looked, so this is a
          baseline: it says these were not publicly accessible on {FIG.sweepDate},
          never when they stopped being accessible. Death dates accrue only for
          repositories that go dark after this census.
        </li>
        <li>
          <strong>Deleted and private are indistinguishable.</strong> Some share
          of the {FIG.reposUnreachable} are deliberate, not abandoned.
        </li>
        <li>
          <strong>{FIG.egressBlocked} websites are invisible to us.</strong>{' '}
          They refuse connections from datacenter networks, so we record them as
          unknown rather than guessing. The website figure above comes from a
          single vantage and is not used for any per-listing flag.
        </li>
        <li>
          <strong>Repositories only.</strong> A reachable repository proves
          nothing about a running server — it proves a URL resolves. Liveness is
          only ever evidence against, never evidence for.
        </li>
      </ul>

      <h2 className="mt-12 t-h2 font-medium text-[var(--color-ink)]">
        What to do about it
      </h2>
      <p className="mt-4 text-[15px] leading-[1.65] text-[var(--color-cite)]">
        If you install MCP servers as packages, an unreachable repository is a
        real audit gap: pin the version you already reviewed, because you can no
        longer diff what you are running against anything. If you connect to a
        hosted server, the repository was never the code that executes — treat it
        as context, not as a reason to disconnect. Affected listings say which
        case applies, and maintainers can dispute any flag from the listing
        itself.
      </p>

      <h2 className="mt-12 t-h2 font-medium text-[var(--color-ink)]">Cite this</h2>
      <p className="mt-4 text-[15px] leading-[1.65] text-[var(--color-cite)]">
        The full dataset — aggregates, the per-server list, and the
        OpenTimestamps proof — is archived with a DOI and a CC-BY-4.0 license:
      </p>
      <p className="mt-3 text-[14px] leading-[1.6] text-[var(--color-cite)] font-mono break-words">
        Bharti, G. (2026). <em>mcpindex Source Liveness — Baseline v1</em>. Zenodo.{' '}
        <a
          href="https://doi.org/10.5281/zenodo.21501868"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
        >
          https://doi.org/10.5281/zenodo.21501868
        </a>
      </p>
      <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-mute)]">
        Cite the concept DOI{' '}
        <a
          href="https://doi.org/10.5281/zenodo.21501867"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
        >
          10.5281/zenodo.21501867
        </a>{' '}
        to reference the series across editions.
      </p>

      <p className="mt-10 text-[14px] leading-[1.6] text-[var(--color-mute)]">
        Method and limits:{' '}
        <Link href="/methodology" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
          how a verdict is produced
        </Link>
        . Corrections and disputes:{' '}
        <a href="mailto:hello@mcpindex.ai?subject=Source%20liveness%20census" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
          hello@mcpindex.ai
        </a>
        .
      </p>
      <Figure id="source-liveness-census">{renderDiagram('source-liveness-census')}</Figure>
      <Figure id="provenance-chain">{renderDiagram('provenance-chain')}</Figure>
    </article>
  );
}
