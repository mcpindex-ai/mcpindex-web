import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { pageMetadata } from '@/lib/seo';
import {
  UNREGISTERED,
  communityServersFor,
  getUnregistered,
} from '@/lib/unregistered';

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return UNREGISTERED.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getUnregistered(slug);
  if (!entry) return {};
  return pageMetadata({
    title: `${entry.name} MCP server: registry status`,
    description:
      `Is there an official ${entry.name} MCP server? The MCP registry has no ` +
      `${entry.vendor}-published entry. See which community servers carry the ` +
      `name and what an unregistered server means for agent trust.`,
    path: `/unregistered/${entry.slug}`,
  });
}

export default async function UnregisteredPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getUnregistered(slug);
  if (!entry) notFound();

  const [servers, meta] = await Promise.all([loadServers(), loadSnapshotMeta()]);
  const community = communityServersFor(servers, entry);
  const asOf = meta.fetchedAt.slice(0, 10);

  return (
    <article className="site-container pt-16 pb-24 max-w-[720px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Registry status · unregistered
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        There is no official {entry.name} MCP server in the registry.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        As of the {asOf} registry snapshot ({servers.length.toLocaleString()}{' '}
        indexed servers), no entry is published under a {entry.vendor}-owned
        namespace ({entry.officialNamespaces.join(', ')}).
        {entry.note ? ` ${entry.note}` : ''}
      </p>

      <section className="mt-12">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Servers that carry the name
        </div>
        {community.length === 0 ? (
          <p className="text-[15px] leading-[1.6] text-[var(--color-cite)]">
            No community server in the registry carries this name either.
          </p>
        ) : (
          <>
            <p className="text-[15px] leading-[1.6] text-[var(--color-cite)]">
              {community.length === 1
                ? 'One community server uses'
                : `${community.length} community servers use`}{' '}
              the {entry.name} name. None is published by {entry.vendor}; treat
              each as the third-party project it is.
            </p>
            <ul className="mt-4 rule-t">
              {community.map((s) => (
                <li key={s.slug} className="py-3 border-b border-[var(--color-rule)]">
                  <Link
                    href={`/server/${s.slug}`}
                    className="font-mono text-[14px] text-[var(--color-ink)] hover:underline"
                  >
                    {s.name}
                  </Link>
                  <div className="mt-1 text-[13px] text-[var(--color-mute)]">
                    updated {s.updatedAt.slice(0, 10)}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-12">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          What unregistered means
        </div>
        <p className="text-[15px] leading-[1.6] text-[var(--color-cite)]">
          The registry verifies namespace ownership, so a registered vendor
          entry is the one identity an agent can pin. Without one there is no
          verified {entry.name} namespace, no canonical entry to pin a tool
          contract against, and no drift history when the tool surface changes.
          A server using the name may still be useful; it is just not{' '}
          {entry.vendor} speaking.
        </p>
        <p className="mt-4 text-[15px] leading-[1.6] text-[var(--color-cite)]">
          How mcpindex evaluates what a server declares versus what it does is
          covered in <Link href="/methodology" className="underline">the methodology</Link>{' '}
          and <Link href="/trust" className="underline">the trust model</Link>.
        </p>
      </section>

      <section className="mt-12">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          If you are {entry.vendor}
        </div>
        <p className="text-[15px] leading-[1.6] text-[var(--color-cite)]">
          Publishing to the MCP registry gives your users a verifiable
          namespace. mcpindex syncs the registry daily; a published entry
          replaces this page with a normal server page, which you can then{' '}
          <Link href="/claim" className="underline">claim</Link>.
        </p>
      </section>
    </article>
  );
}
