import { loadServers } from '@/lib/registry';
import { CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export async function GET() {
  const servers = await loadServers();
  const byCategory = new Map<string, typeof servers>();
  for (const s of servers) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category)!.push(s);
  }

  const sections: string[] = [
    '# mcpindex.ai — Full Index',
    '',
    `Total servers: ${servers.length}. Categories: ${byCategory.size}.`,
    'Format: one server per block, grouped by category.',
    '',
  ];

  for (const [cat, list] of [...byCategory.entries()].sort()) {
    sections.push(`\n## ${CATEGORY_LABELS[cat] ?? cat} (${list.length})\n`);
    for (const s of list) {
      const installs: string[] = [];
      if (s.npmPackage) installs.push(`npm:${s.npmPackage}`);
      if (s.pypiPackage) installs.push(`pypi:${s.pypiPackage}`);
      if (s.dockerImage) installs.push(`docker:${s.dockerImage}`);
      if (s.remoteUrl) installs.push(`remote:${s.remoteUrl}`);
      sections.push(
        `- ${s.title} (${s.name}@${s.version})`,
        `  ${s.description}`,
        `  installs: ${installs.join(' | ') || 'manual'}`,
        `  detail: https://mcpindex.ai/server/${s.slug}`,
        '',
      );
    }
  }

  return new Response(sections.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
