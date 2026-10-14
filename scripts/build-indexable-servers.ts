// Emit data/indexable-servers.json: the /server pages offered to search engines (see
// lib/indexable.ts for why the set exists and what qualifies).
//
//   npx tsx --conditions=react-server scripts/build-indexable-servers.ts
//
// Run by .github/workflows/sync-registry.yml after the registry fetch, so the set is computed
// against the server index committed beside it. Reads the PUBLIC ledger over HTTPS: the runner
// holds no Upstash token and does not need one. The /4 API is paged, so this walks the events and
// context_events sections page by page (computeIndexable reads only those two; fleet rows never
// qualify a server on their own, see lib/indexable.ts).
//
// FAIL-SOFT, like the era-census export in the same workflow. Any failure keeps the last
// committed file and exits 0, because a ledger blip must not take the registry sync down, and an
// old set is an honest set. A result under half the previous one, or over double, is refused
// the same way: that is a broken ledger read, not a week in which half of all drift vanished
// or the corpus suddenly all qualified. A walk whose row total disagrees with the count the API
// published for that section is refused too: it is a partial read.
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
import { coerceContextEvent, coerceEvent, type ContextEvent, type LedgerEvent } from '../lib/ledger';
import { walkLedgerSection, type SectionWalk } from '../lib/ledgerV4Client';
import type { LedgerSection } from '../lib/ledgerV4';
import { loadServersFromSnapshot } from '../lib/registry';

const OUT = path.join(process.cwd(), 'data', 'indexable-servers.json');
const LEDGER_URL = process.env.INDEXABLE_LEDGER_URL ?? 'https://mcpindex.ai/api/v1/ledger';

function keep(reason: string): never {
  console.log(`::warning::indexable-servers.json keeps its last reading: ${reason}`);
  process.exit(0);
}

async function walk(section: LedgerSection): Promise<SectionWalk> {
  try {
    const w = await walkLedgerSection(LEDGER_URL, section);
    const published = w.counts[section];
    if (typeof published === 'number' && published !== w.items.length) {
      keep(`${section}: walked ${w.items.length} rows, the API says ${published}`);
    }
    return w;
  } catch (e) {
    keep(`ledger ${section} walk failed (${(e as Error).message})`);
  }
}

async function main(): Promise<void> {
  const ev = await walk('events');
  const ctx = await walk('context_events');
  if (ev.generated_at !== ctx.generated_at) keep('events and context_events came from different generations');
  if (!ledgerAnswersIndexableCriterion(ev.schema)) {
    keep(`ledger schema ${ev.schema} cannot separate fleet-only events`);
  }
  const events = ev.items.map(coerceEvent).filter((e): e is LedgerEvent => e !== null);
  const contextEvents = ctx.items.map(coerceContextEvent).filter((e): e is ContextEvent => e !== null);

  const names = (await loadServersFromSnapshot()).map((s) => s.name);
  const servers = computeIndexable(names, events, contextEvents);

  const prev = await fs
    .readFile(OUT, 'utf8')
    .then((t) => coerceIndexable(JSON.parse(t)))
    .catch(() => null);
  // INDEXABLE_ACCEPT_COUNT=1 (workflow_dispatch input accept_indexable_count) lets a reviewed
  // jump through once; without it a legitimate shift outside the ratio would freeze the set.
  const acceptAnyCount = process.env.INDEXABLE_ACCEPT_COUNT === '1' && servers.length > 0;
  if (!acceptAnyCount && !indexableCountAcceptable(servers.length, prev ? prev.servers.length : null)) {
    keep(
      `new set has ${servers.length} servers, previous had ${prev ? prev.servers.length : 0}`,
    );
  }

  const doc = {
    schema: INDEXABLE_SCHEMA,
    generated_at: new Date().toISOString(),
    ledger_generated_at: ev.generated_at,
    criterion: INDEXABLE_CRITERION,
    servers,
  };
  // Write then rename: a truncated file would coerce to null and re-open every page to search.
  await fs.writeFile(`${OUT}.tmp`, `${JSON.stringify(doc, null, 1)}\n`);
  await fs.rename(`${OUT}.tmp`, OUT);
  console.log(`indexable-servers.json: ${servers.length} of ${names.length} registry servers`);
}

main().catch((e) => keep(`unexpected error (${(e as Error).message})`));
