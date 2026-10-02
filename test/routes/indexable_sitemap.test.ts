// Pins the published search contract: a server page is offered to search only when its
// name is in data/indexable-servers.json, the sitemap lists those pages and not the rest,
// and /servers/page/N is not a crawl target.
//
// generateMetadata lives on the server page, and importing that module pulls client
// components the route harness cannot load. The page spreads serverSearchRobots(), which
// is the robots object asserted here. The slugs are chosen from the shipped artifact at
// run time; a hardcoded slug would rot the way the old screened-slug pins did.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sitemap from '../../app/sitemap';
import { indexablePredicate, serverSearchRobots } from '../../lib/indexable';
import { loadServers } from '../../lib/registry';

test('the server page decides its robots with serverSearchRobots', async () => {
  const src = await fs.readFile(
    path.join(process.cwd(), 'app/server/[slug]/page.tsx'),
    'utf8',
  );
  assert.match(src, /serverSearchRobots\(indexed\)/);
});

test('indexable server pages stay in the sitemap; the rest, and /servers/page/2, do not', async () => {
  const [servers, indexable] = await Promise.all([loadServers(), indexablePredicate()]);
  const kept = servers.find((s) => s.status !== 'deprecated' && indexable(s.name));
  const dropped = servers.find((s) => s.status !== 'deprecated' && !indexable(s.name));
  assert.ok(kept, 'the shipped artifact must name at least one live server');
  assert.ok(dropped, 'the shipped artifact must leave at least one live server out');

  assert.deepEqual(serverSearchRobots(indexable(kept.name)), {});
  assert.deepEqual(serverSearchRobots(indexable(dropped.name)), {
    robots: { index: false, follow: true },
  });

  const urls = new Set((await sitemap()).map((entry) => entry.url));
  assert.equal(urls.has(`https://mcpindex.ai/server/${kept.slug}`), true);
  assert.equal(urls.has(`https://mcpindex.ai/server/${dropped.slug}`), false);
  assert.equal(urls.has('https://mcpindex.ai/servers/page/2'), false);
  assert.equal(urls.has('https://mcpindex.ai/servers/drift-observed'), true);
});
