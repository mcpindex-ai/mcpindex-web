// Emit data/indexable-servers.json: the /server pages offered to search engines (see
// lib/indexable.ts for why the set exists and what qualifies).
//
//   npx tsx --conditions=react-server scripts/build-indexable-servers.ts
//
// Run by .github/workflows/sync-registry.yml after the registry fetch, so the set is computed
// against the server index committed beside it. Reads the PUBLIC ledger over HTTPS: the runner
// holds no Upstash token and does not need one.
//
// FAIL-SOFT, like the era-census export in the same workflow. Any failure keeps the last
// committed file and exits 0, because a ledger blip must not take the registry sync down, and an
// old set is an honest set. A result under half the previous one, or over double, is refused
// the same way: that is a broken ledger read, not a week in which half of all drift vanished
// or the corpus suddenly all qualified. A /2 blob is refused too: its events still list
// fleet-collapsed tools, so it cannot answer "drift of its own".
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  computeIndexable,
  coerceIndexable,
  indexableCountAcceptable,
  INDEXABLE_CRITERION,
  INDEXABLE_SCHEMA,
  ledgerAnswersIndexableCriterion,
} from '../lib/indexable';
import { parseLedgerBlob } from '../lib/ledger';
import { loadServersFromSnapshot } from '../lib/registry';

const OUT = path.join(process.cwd(), 'data', 'indexable-servers.json');
const LEDGER_URL = process.env.INDEXABLE_LEDGER_URL ?? 'https://mcpindex.ai/api/v1/ledger';

function keep(reason: string): never {
  console.log(`::warning::indexable-servers.json keeps its last reading: ${reason}`);
  process.exit(0);
}

async function main(): Promise<void> {
  let raw: unknown;
  try {
    const res = await fetch(LEDGER_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) keep(`ledger HTTP ${res.status}`);
    raw = await res.json();
  } catch (e) {
    keep(`ledger fetch failed (${(e as Error).message})`);
  }
  const ledger = parseLedgerBlob(raw);
  if (!ledger) keep('ledger blob failed validation');
  if (!ledgerAnswersIndexableCriterion(ledger.schema)) {
    keep(`ledger schema ${ledger.schema} cannot separate fleet-only events`);
  }

  const names = (await loadServersFromSnapshot()).map((s) => s.name);
  const servers = computeIndexable(names, ledger.events, ledger.context_events);

  const prev = await fs
    .readFile(OUT, 'utf8')
    .then((t) => coerceIndexable(JSON.parse(t)))
    .catch(() => null);
  if (!indexableCountAcceptable(servers.length, prev ? prev.servers.length : null)) {
    keep(
      `new set has ${servers.length} servers, previous had ${prev ? prev.servers.length : 0}`,
    );
  }

  const doc = {
    schema: INDEXABLE_SCHEMA,
    generated_at: new Date().toISOString(),
    ledger_generated_at: ledger.generated_at,
    criterion: INDEXABLE_CRITERION,
    servers,
  };
  await fs.writeFile(OUT, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`indexable-servers.json: ${servers.length} of ${names.length} registry servers`);
}

main().catch((e) => keep(`unexpected error (${(e as Error).message})`));
