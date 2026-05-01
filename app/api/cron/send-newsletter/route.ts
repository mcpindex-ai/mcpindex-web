import { NextRequest } from 'next/server';
import { loadServers, loadSnapshot } from '@/lib/registry';
import { CATEGORY_LABELS } from '@/lib/categorize';

// Weekly Monday newsletter. Sends via Loops API if LOOPS_API_KEY is set;
// otherwise logs the formatted body to stdout for inspection.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const [servers, snap] = await Promise.all([loadServers(), loadSnapshot()]);
  const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const fresh = servers.filter((s) => new Date(s.publishedAt).getTime() > week);

  const subject = `MCP Weekly · +${fresh.length} new servers`;
  const lines: string[] = [
    `# MCP Weekly`,
    `Snapshot: ${snap.fetchedAt}`,
    ``,
    `## ${fresh.length} new servers indexed this week`,
    ``,
  ];
  for (const s of fresh.slice(0, 30)) {
    lines.push(`- **${s.title}** (${s.name}@${s.version})`);
    lines.push(`  ${s.description}`);
    lines.push(`  ${CATEGORY_LABELS[s.category] ?? s.category} · https://mcpindex.ai/server/${s.slug}`);
    lines.push('');
  }
  const body = lines.join('\n');

  if (!process.env.LOOPS_API_KEY) {
    console.log('[newsletter] LOOPS_API_KEY not set; would send:\n', body.slice(0, 2000));
    return Response.json({ ok: true, mode: 'dry-run', subject, freshCount: fresh.length });
  }

  // Loops "transactional" send via their HTTP API.
  // See: https://loops.so/docs/api-reference
  const res = await fetch('https://app.loops.so/api/v1/transactional', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transactionalId: process.env.LOOPS_NEWSLETTER_ID,
      email: process.env.LOOPS_BROADCAST_LIST ?? 'newsletter@mcpindex.ai',
      dataVariables: { subject, body, freshCount: fresh.length },
    }),
  });
  return Response.json({
    ok: res.ok,
    status: res.status,
    subject,
    freshCount: fresh.length,
  });
}
