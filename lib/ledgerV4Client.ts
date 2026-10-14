// Client side of the /4 ledger API: walk one section from page 0 to the last page by following
// next_cursor. Used by scripts/build-indexable-servers.ts, which runs in CI with no Upstash token
// and reads the public API. The fetch is injected so the walk is testable without a network.

import { LEDGER_SCHEMA_V4, type LedgerSection } from './ledgerV4';

// Measured 2026-10-14: the largest section was 34 pages. A walk past this is a server that keeps
// handing out cursors, not a ledger.
const MAX_WALK_PAGES = 2_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_WAIT_S = 60;

export interface SectionWalk {
  readonly schema: string;
  readonly generated_at: string;
  readonly counts: Readonly<Record<string, unknown>>;
  readonly items: readonly unknown[];
}

export class LedgerWalkError extends Error {}

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPage(url: URL, fetchFn: typeof fetch, sleep: Sleep): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(60_000) });
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const s = Number(res.headers.get('retry-after'));
      await sleep(1000 * (Number.isFinite(s) && s > 0 ? Math.min(s, MAX_RETRY_WAIT_S) : MAX_RETRY_WAIT_S));
      continue;
    }
    if (!res.ok) throw new LedgerWalkError(`ledger HTTP ${res.status} on ${url.search || '(first page)'}`);
    const body: unknown = await res.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LedgerWalkError('page is not an object');
    return body as Record<string, unknown>;
  }
}

/** Every row of one section, in page order, all from the generation page 0 came from (a cursor
 * stays in its generation). Throws LedgerWalkError on anything that is not a clean walk. */
export async function walkLedgerSection(
  baseUrl: string,
  section: LedgerSection,
  fetchFn: typeof fetch = fetch,
  sleep: Sleep = realSleep,
): Promise<SectionWalk> {
  const items: unknown[] = [];
  let cursor: string | null = null;
  let first: Record<string, unknown> | null = null;
  for (let n = 0; n < MAX_WALK_PAGES; n++) {
    const url = new URL(baseUrl);
    if (cursor === null) url.searchParams.set('section', section);
    else url.searchParams.set('cursor', cursor);
    const body = await getPage(url, fetchFn, sleep);
    if (body.schema !== LEDGER_SCHEMA_V4) throw new LedgerWalkError(`schema ${String(body.schema)}`);
    if (body.section !== section || body.page !== n) throw new LedgerWalkError(`page ${n} of ${section} came back out of order`);
    if (!Array.isArray(body.items)) throw new LedgerWalkError('items is not an array');
    first ??= body;
    if (body.generated_at !== first.generated_at) throw new LedgerWalkError('generation changed mid-walk');
    items.push(...body.items);
    const next = body.next_cursor;
    if (next === null) {
      if (n + 1 !== body.pages && !(body.pages === 0 && n === 0)) {
        throw new LedgerWalkError(`walk ended at page ${n} of ${String(body.pages)}`);
      }
      const counts = first.counts && typeof first.counts === 'object' ? (first.counts as Record<string, unknown>) : {};
      return { schema: LEDGER_SCHEMA_V4, generated_at: String(first.generated_at ?? ''), counts, items };
    }
    if (typeof next !== 'string' || next.length === 0) throw new LedgerWalkError('next_cursor is not a string');
    cursor = next;
  }
  throw new LedgerWalkError(`more than ${MAX_WALK_PAGES} pages`);
}
