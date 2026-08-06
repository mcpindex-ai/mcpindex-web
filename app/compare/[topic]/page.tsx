import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { computeQuality } from '@/lib/quality';
import { loadSourceLiveness } from '@/lib/sourceLiveness';
import { listScreened } from '@/lib/verdicts';
import {
  eligibleTopics,
  implementationsFor,
  isTopic,
  publisherOf,
  topicEligibility,
  topicLabel,
} from '@/lib/topics';
import { jsonLdSafe } from '@/lib/jsonLd';
import type { IndexedServer } from '@/lib/types';

export const revalidate = 3600;

const UNDERLINE =
  'underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]';

export async function generateStaticParams() {
  const servers = await loadServers();
  return eligibleTopics(servers).map((topic) => ({ topic }));
}

export async function generateMetadata(
  ctx: { params: Promise<{ topic: string }> },
): Promise<Metadata> {
  const { topic } = await ctx.params;
  if (!isTopic(topic)) return { title: 'Not found', robots: { index: false, follow: false } };
  const label = topicLabel(topic);
  const servers = await loadServers();
  // The body notFound()s when a topic stops clearing the bar; without the same check here a
  // prerendered, sitemap-listed page would keep emitting a title, description and
  // self-canonical for a hard 404 - the soft-404 class already fixed for /server/[slug].
  if (!topicEligibility(servers, topic).eligible) {
    return { title: 'Not found', robots: { index: false, follow: false } };
  }
  const n = implementationsFor(servers, topic).length;
  return {
    title: `${label} MCP servers compared: which one to use`,
    // Deliberately NOT a registry blurb. The count plus the maintenance framing is the
    // one snippet on this SERP that answers "which of these should I pick".
    description: `${n} ${label} MCP servers side by side - which are still maintained, which have a source repository that went offline, and which have been screened. Indexed by mcpindex, mostly from the MCP registry.`,
    alternates: { canonical: `https://mcpindex.ai/compare/${topic}` },
  };
}

type Row = {
  server: IndexedServer;
  score: number;
  /** Source repository flagged unreachable by the liveness sweep. */
  sourceGone: boolean;
  verdict: string | null;
};

function installTarget(s: IndexedServer): string {
  if (s.npmPackage) return `npm ${s.npmPackage}`;
  if (s.pypiPackage) return `pypi ${s.pypiPackage}`;
  if (s.dockerImage) return `docker ${s.dockerImage}`;
  if (s.hasRemote) return 'remote endpoint';
  return 'not published';
}

export default async function CompareTopic(
  ctx: { params: Promise<{ topic: string }> },
) {
  const { topic } = await ctx.params;
  if (!isTopic(topic)) notFound();

  const servers = await loadServers();
  // Re-check eligibility at render: the registry moves under us, and a topic that has
  // decayed into a single publisher's catalogue should stop being a "comparison" rather
  // than quietly become one.
  if (!topicEligibility(servers, topic).eligible) notFound();

  const label = topicLabel(topic);
  const impls = implementationsFor(servers, topic);

  // Three bulk loads, not N lookups per row.
  const [liveness, screened, meta] = await Promise.all([
    loadSourceLiveness(),
    listScreened(),
    loadSnapshotMeta(),
  ]);
  const verdictBySlug = new Map(screened.map((s) => [s.slug, s.verdict.directive.decision]));

  const rows: Row[] = impls
    .map((server) => ({
      server,
      score: computeQuality(server, liveness.servers[server.name] ?? null).score,
      sourceGone: Boolean(liveness.servers[server.name]),
      verdict: verdictBySlug.get(server.slug) ?? null,
    }))
    // Servers whose source went offline sort last: the page exists to answer "which
    // should I use", so the ones carrying a known problem belong at the bottom.
    .sort((a, b) =>
      a.sourceGone !== b.sourceGone ? Number(a.sourceGone) - Number(b.sourceGone) : b.score - a.score,
    );

  const goneCount = rows.filter((r) => r.sourceGone).length;
  // The scope sentence used to assert that non-registry servers are never listed here. They
  // are, whenever an admitted server matches the topic - so state the real composition.
  const admittedCount = rows.filter((r) => r.server.source === 'admitted').length;
  const asOf = (meta.fetchedAt || meta.writtenAt || '').slice(0, 10);

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `How many ${label} MCP servers are there?`,
        acceptedAnswer: {
          '@type': 'Answer',
          // "what the MCP registry lists" was left in the machine-readable half after the
          // prose was corrected - and it is false whenever an admitted server matches.
          text: `${rows.length} ${label} MCP servers are indexed on mcpindex as of ${asOf}${admittedCount > 0 ? `, of which ${admittedCount} are indexed by mcpindex despite not being listed in the MCP registry` : ''}. That is close to what the registry lists, not necessarily every one that exists.`,
        },
      },
      {
        '@type': 'Question',
        name: `Which ${label} MCP server should I use?`,
        acceptedAnswer: {
          '@type': 'Answer',
          // rows[0] is the top-scoring UNFLAGGED row, not the top-scoring row overall - the
          // sort puts flagged servers last. Claiming "highest Quality Score" here was false
          // whenever a flagged server scored higher, in machine-consumed structured data.
          // rows[0] is only "unflagged" when at least one unflagged row exists; if every
          // server is flagged the previous wording asserted a clean bill of health for a
          // flagged server, in structured data.
          text: (() => {
            const clean = rows.find((r) => !r.sourceGone);
            if (!clean) {
              return rows[0]
                ? `Every one of the ${rows.length} indexed has a source repository flagged unreachable, so none can be recommended on that basis. ${rows[0].server.title} scores highest at ${rows[0].score}/100.`
                : 'No servers indexed for this topic yet.';
            }
            return `Of the ${rows.length} indexed, ${clean.server.title} (${clean.server.name}) is the highest-scoring server with no source-liveness flag, at ${clean.score}/100. A high score means the listing is complete and current, not that the server is safe.`;
          })(),
        },
      },
      {
        '@type': 'Question',
        name: `Are any ${label} MCP servers abandoned?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            goneCount > 0
              ? `${goneCount} of ${rows.length} have a source repository that is no longer publicly reachable. That can also mean the repository was made private or relocated, so it is an observation rather than a conclusion.`
              : `None of the ${rows.length} indexed have a source repository flagged unreachable by the latest liveness sweep.`,
        },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(faqLd) }} />
      <article className="site-container pt-16 pb-24">
        <Link
          href="/leaderboard"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-mute)] hover:text-[var(--color-accent-strong)]"
        >
          ← Index
        </Link>
        <header className="mt-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
            Compared · {topic}
          </div>
          <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
            {rows.length} {label} MCP servers. Which one to use.
          </h1>
          <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
            Every {label} server we index, with whether its source is still reachable and
            whether we hold a screening verdict.{' '}
            {goneCount > 0 ? (
              <>
                <strong className="font-medium text-[var(--color-ink)]">
                  {goneCount} of {rows.length}
                </strong>{' '}
                have a source repository that is no longer publicly reachable.
              </>
            ) : (
              <>None currently carry a source-liveness flag.</>
            )}
          </p>
          {/* The denominator, stated. We index what the MCP registry lists plus a small
              editorially admitted set, which is not the same as every server that exists -
              claiming otherwise on a trust site would be the exact failure we sell against. */}
          <p className="mt-3 text-[13.5px] leading-[1.5] text-[var(--color-mute)]">
            Scope: {rows.length} servers, mostly mirrored from the{' '}
            <Link href="/methodology" className={UNDERLINE}>
              MCP registry
            </Link>{' '}
            as of {asOf || 'the latest snapshot'}
            {admittedCount > 0
              ? `, plus ${admittedCount} indexed by mcpindex despite not being registry-listed`
              : ''}
            . Most servers whose authors never published to the registry are absent, so treat
            this as close to the registry&apos;s view rather than a complete census.
          </p>
        </header>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full text-left text-[14px] border-collapse">
            <thead>
              <tr className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mute)]">
                <th scope="col" className="rule-b py-3 pr-4 font-normal">Server</th>
                <th scope="col" className="rule-b py-3 pr-4 font-normal">Publisher</th>
                <th scope="col" className="rule-b py-3 pr-4 font-normal">Source</th>
                <th scope="col" className="rule-b py-3 pr-4 font-normal">Screened</th>
                <th scope="col" className="rule-b py-3 pr-4 font-normal">Quality</th>
                <th scope="col" className="rule-b py-3 font-normal">Install</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ server, score, sourceGone, verdict }) => (
                <tr key={server.slug} className="align-top">
                  <td className="rule-b py-3 pr-4">
                    <Link href={`/server/${server.slug}`} className={UNDERLINE}>
                      {server.title}
                    </Link>
                  </td>
                  <td className="rule-b py-3 pr-4 font-mono text-[12px] text-[var(--color-mute)]">
                    {publisherOf(server.name)}
                  </td>
                  <td className="rule-b py-3 pr-4">
                    {sourceGone ? (
                      <span className="text-[var(--color-ink)]">repo unreachable</span>
                    ) : (
                      <span className="text-[var(--color-mute)]">no flag</span>
                    )}
                  </td>
                  <td className="rule-b py-3 pr-4 font-mono text-[12px]">
                    {verdict ?? <span className="text-[var(--color-mute)]">not screened</span>}
                  </td>
                  <td className="rule-b py-3 pr-4 tabular-nums">{score}</td>
                  <td className="rule-b py-3 font-mono text-[12px] text-[var(--color-mute)]">
                    {installTarget(server)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-8 text-[13.5px] leading-[1.55] text-[var(--color-mute)]">
          &ldquo;Repo unreachable&rdquo; means the source returned a not-found from two
          vantage points, which can also happen when a repository is made private or moved -
          see{' '}
          <Link href="/research/source-liveness" className={UNDERLINE}>
            source liveness
          </Link>
          . &ldquo;Screened&rdquo; is the advisory verdict on the listing text, never a
          safety clearance; the{' '}
          <Link href="/methodology" className={UNDERLINE}>
            methodology
          </Link>{' '}
          spells out what each dimension does and does not test.
        </p>
      </article>
    </>
  );
}
