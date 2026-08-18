// Golden-set ranking test against the REAL corpus (data/server-index.json).
//
// Origin: a 163-name spot check of Reddit-cited servers (2026-08-18) found the
// official GitHub server in the corpus but absent from the top 5 for ?q=github,
// with a wrapper at #1. These assertions pin "search the vendor name, get the
// canonical server in the top 3" - the property v1.3 (O5-O8) exists to hold.
//
// Corpus drift rule: the snapshot syncs twice daily. If a canonical server
// leaves the registry the entry is SKIPPED with a diagnostic (that is an
// ingestion event, not a ranking regression); present-but-buried FAILS.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { search } from './search';
import type { IndexedServer } from './types';

const GOLDEN: Array<{ query: string; canonical: string }> = [
  { query: 'github', canonical: 'io.github.github/github-mcp-server' },
  { query: 'stripe', canonical: 'com.stripe/mcp' },
  { query: 'filesystem', canonical: 'io.github.modelcontextprotocol/server-filesystem' },
  { query: 'memory', canonical: 'io.github.modelcontextprotocol/server-memory' },
  { query: 'playwright', canonical: 'io.github.microsoft/playwright-mcp' },
  { query: 'supabase', canonical: 'com.supabase/mcp' },
  { query: 'vercel', canonical: 'com.vercel/vercel-mcp' },
  { query: 'zapier', canonical: 'com.zapier/mcp' },
  { query: 'context7', canonical: 'io.github.upstash/context7' },
  { query: 'linear', canonical: 'app.linear/linear' },
  { query: 'notion', canonical: 'com.notion/mcp' },
  { query: 'brave search', canonical: 'io.github.brave/brave-search-mcp-server' },
  { query: 'mongodb', canonical: 'io.github.mongodb-js/mongodb-mcp-server' },
];

const TOP_N = 3;

function loadCorpus(): IndexedServer[] {
  const p = path.join(process.cwd(), 'data', 'server-index.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).servers as IndexedServer[];
}

test('golden set: canonical server ranks in the top 3 for its vendor query', (t) => {
  const corpus = loadCorpus();
  const byName = new Set(corpus.map((s) => s.name.toLowerCase()));

  const failures: string[] = [];
  for (const { query, canonical } of GOLDEN) {
    if (!byName.has(canonical.toLowerCase())) {
      t.diagnostic(`SKIP ?q=${query}: ${canonical} left the corpus (ingestion event)`);
      continue;
    }
    const top = search(corpus, query, { limit: TOP_N }).map((h) => h.server.name);
    if (!top.some((n) => n.toLowerCase() === canonical.toLowerCase())) {
      failures.push(`?q=${query}: expected ${canonical} in top ${TOP_N}, got [${top.join(', ')}]`);
    }
  }
  assert.deepEqual(failures, []);
});
