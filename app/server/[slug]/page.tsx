import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getServer, loadServers } from '@/lib/registry';
import { computeQuality } from '@/lib/quality';
import { buildInstalls } from '@/lib/installs';
import { CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export async function generateStaticParams() {
  const servers = await loadServers();
  return servers.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata(
  ctx: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await ctx.params;
  const server = await getServer(slug);
  if (!server) return { title: 'Server not found' };
  return {
    title: `${server.title} — ${server.name}`,
    description: server.description,
    alternates: { canonical: `https://mcpindex.ai/server/${server.slug}` },
    openGraph: {
      title: server.title,
      description: server.description,
      url: `https://mcpindex.ai/server/${server.slug}`,
      type: 'website',
    },
  };
}

export default async function ServerPage(
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const server = await getServer(slug);
  if (!server) notFound();

  const all = await loadServers();
  const { score, breakdown } = computeQuality(server);
  const installs = buildInstalls(server);
  const alternatives = all
    .filter((s) => s.category === server.category && s.slug !== server.slug)
    .slice(0, 3);

  // JSON-LD for Google + agent crawlers
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: server.title,
    alternateName: server.name,
    description: server.description,
    softwareVersion: server.version,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Cross-platform',
    url: `https://mcpindex.ai/server/${server.slug}`,
    sameAs: [server.repositoryUrl, server.websiteUrl].filter(Boolean),
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: (score / 20).toFixed(1),
      ratingCount: 1,
      bestRating: 5,
      worstRating: 0,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="mx-auto max-w-[920px] px-6 sm:px-10 pt-16 pb-24">
        <Link
          href="/leaderboard"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[--color-mute] hover:text-[--color-accent]"
        >
          ← Index
        </Link>

        <header className="mt-6 grid sm:grid-cols-[1fr_auto] gap-6 items-start">
          <div>
            <h1 className="text-[34px] sm:text-[44px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
              {server.title}
            </h1>
            <div className="mt-3 font-mono text-[12px] text-[--color-mute] flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{server.name}</span>
              <span className="text-[--color-rule]">·</span>
              <span>v{server.version}</span>
              <span className="text-[--color-rule]">·</span>
              <Link
                href={`/best/${server.category}`}
                className="text-[--color-cite] hover:text-[--color-accent]"
              >
                {CATEGORY_LABELS[server.category] ?? server.category}
              </Link>
            </div>
          </div>
          <QualityBadge score={score} />
        </header>

        <p className="mt-6 text-[17px] leading-[1.55] text-[--color-cite] max-w-[640px]">
          {server.description}
        </p>

        {/* Links */}
        <div className="mt-8 flex flex-wrap gap-3 font-mono text-[11px] uppercase tracking-[0.16em]">
          {server.repositoryUrl && (
            <a
              href={server.repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="border border-[--color-rule] px-3 py-1.5 text-[--color-cite] hover:border-[--color-accent] hover:text-[--color-accent]"
            >
              Repository →
            </a>
          )}
          {server.websiteUrl && (
            <a
              href={server.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="border border-[--color-rule] px-3 py-1.5 text-[--color-cite] hover:border-[--color-accent] hover:text-[--color-accent]"
            >
              Website →
            </a>
          )}
          {server.remoteUrl && (
            <a
              href={server.remoteUrl}
              target="_blank"
              rel="noreferrer"
              className="border border-[--color-rule] px-3 py-1.5 text-[--color-cite] hover:border-[--color-accent] hover:text-[--color-accent]"
            >
              Remote endpoint →
            </a>
          )}
        </div>

        {/* Install commands */}
        <section className="mt-16">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
            §01&nbsp;&nbsp;Install
          </div>
          {installs.length === 0 ? (
            <p className="text-[14px] text-[--color-mute]">
              No runnable package or remote endpoint listed in the registry. Check the repo for
              manual install instructions.
            </p>
          ) : (
            <div className="space-y-6">
              {installs.map((inst, i) => (
                <div key={i} className="rule-t pt-5">
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[--color-cite] mb-2">
                    {inst.label}
                  </div>
                  {inst.notes && (
                    <p className="text-[13px] text-[--color-mute] mb-3">{inst.notes}</p>
                  )}
                  {inst.command && (
                    <pre className="bg-[--color-ink] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
                      <code>{inst.command}</code>
                    </pre>
                  )}
                  {inst.json && (
                    <pre className="bg-[--color-ink] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
                      <code>{inst.json}</code>
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Env vars */}
        {server.envVars.length > 0 && (
          <section className="mt-16">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
              §02&nbsp;&nbsp;Environment variables
            </div>
            <div className="rule-t">
              {server.envVars.map((v) => (
                <div
                  key={v.name}
                  className="rule-b grid sm:grid-cols-[200px_auto_1fr] gap-4 py-4 px-2"
                >
                  <code className="font-mono text-[13px] text-[--color-ink]">{v.name}</code>
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[--color-mute] flex gap-2">
                    {v.isRequired && <span className="text-[--color-accent]">required</span>}
                    {v.isSecret && <span>secret</span>}
                  </div>
                  <p className="text-[13px] text-[--color-cite]">
                    {v.description ?? <span className="text-[--color-mute]">no description</span>}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quality breakdown */}
        <section className="mt-16">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
            §03&nbsp;&nbsp;MCP Quality Score &nbsp;·&nbsp;{' '}
            <Link href="/methodology" className="hover:text-[--color-accent]">
              methodology
            </Link>
          </div>
          <div className="rule-t">
            {Object.entries(breakdown).map(([k, v]) => (
              <div
                key={k}
                className="rule-b grid grid-cols-[1fr_60px] gap-4 py-3 px-2 items-center"
              >
                <div className="font-mono text-[12px] text-[--color-cite] capitalize">{k}</div>
                <div className="text-right font-mono tabular-nums text-[14px] text-[--color-ink]">
                  {v}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <section className="mt-16">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
              §04&nbsp;&nbsp;Alternatives in {CATEGORY_LABELS[server.category] ?? server.category}
            </div>
            <div className="rule-t">
              {alternatives.map((a) => (
                <Link
                  key={a.slug}
                  href={`/server/${a.slug}`}
                  className="block rule-b py-4 px-2 hover:bg-[--color-accent-soft]/40 transition-colors group"
                >
                  <div className="font-medium text-[15px] text-[--color-ink] group-hover:text-[--color-accent]">
                    {a.title}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[--color-mute]">
                    {a.name}
                  </div>
                  <p className="mt-1.5 text-[13px] text-[--color-cite] line-clamp-2">
                    {a.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </>
  );
}

function QualityBadge({ score }: { score: number }) {
  return (
    <div className="rule-t rule-b rule-l rule-r p-4 bg-[--color-accent-soft] text-center w-[120px]">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[--color-mute]">
        Quality Score
      </div>
      <div className="mt-2 font-mono tabular-nums text-[36px] text-[--color-ink] leading-none">
        {score}
      </div>
      <div className="font-mono text-[10px] text-[--color-mute] mt-1">/100</div>
    </div>
  );
}
