import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FACTS, validateFacts, type Fact } from './facts';
import {
  GUARDED_FILES,
  checkAnchorStatement,
  roundsTo,
  scanFile,
  staleFacts,
  summarizeAnchorLedger,
} from './factsGuard';

const base: Fact = {
  id: 'x.y',
  value: 1,
  unit: 'servers',
  query: 'jq .x file.json',
  observed_at: '2026-10-01',
};

test('registry: the committed facts.json validates and every guarded file exists', () => {
  assert.ok(FACTS.length > 0);
  for (const f of GUARDED_FILES) assert.ok(fs.existsSync(f), `guarded file missing: ${f}`);
});

test('registry: malformed entries are rejected', () => {
  const doc = (facts: unknown[]) => ({ schema_version: '1', facts });
  assert.throws(() => validateFacts(doc([base, base])), /duplicate id/);
  assert.throws(() => validateFacts(doc([{ ...base, observed_at: '10/01/2026' }])), /observed_at/);
  assert.throws(() => validateFacts(doc([{ ...base, query: '' }])), /query/);
  assert.throws(() => validateFacts(doc([{ ...base, max_age_days: 0 }])), /max_age_days/);
  assert.throws(() => validateFacts({ facts: [] }), /schema_version/);
});

test('max age: a live fact past its window is stale, a frozen one never is', () => {
  const live = { ...base, id: 'a.live', max_age_days: 30 };
  const frozen = { ...base, id: 'a.frozen' };
  assert.deepEqual(staleFacts([live, frozen], '2026-10-31'), []);
  assert.deepEqual(staleFacts([live, frozen], '2026-11-01'), [{ id: 'a.live', ageDays: 31, max: 30 }]);
});

test('rounding: half-up at the published precision, where toFixed would round 6.85 down', () => {
  assert.equal(roundsTo(6.85, 6.9), true);
  assert.equal(roundsTo(6.85, 6.8), false);
  assert.equal(roundsTo(83.77, 83.8), true);
  assert.equal(roundsTo(88.64, 88.6), true);
});

test('scan: a literal metric in template prose is flagged, an interpolated one is not', () => {
  const src = 'export const a = `across 44,172 tools, ${n} servers, 83.8% declare`;';
  const r = scanFile('app/llms.txt/route.ts', src);
  assert.deepEqual(r.findings.map((f) => f.literal), ['44,172', '83.8%']);
});

test('scan: dates, versions, DOIs, URLs, class names and headers are not metrics', () => {
  const src = [
    'const a = `on 2026-09-23 (v1.1, DOI 10.5281/zenodo.21778894, https://x.ai/a-2) MCP 2.0 tiers 1-3`;',
    'const b = <p className="text-[15px] leading-[1.65]">HTTP 404 in 2026</p>;',
    "const c = new Response(x, { headers: { 'Cache-Control': 's-maxage=3600' } });",
  ].join('\n');
  assert.deepEqual(scanFile('app/stats/page.tsx', src).findings, []);
});

test('scan: JSX text is prose; JSX expressions are code', () => {
  const src = 'const p = <p>A sample of 150 was checked; {FIG.sampleSize} agreed.</p>;';
  const r = scanFile('app/research/source-liveness/page.tsx', src);
  assert.deepEqual(r.findings.map((f) => f.literal), ['150']);
});

const confirmedLedger = summarizeAnchorLedger({
  anchors: [{ bitcoin: { block_heights: [951197] } }, { bitcoin: { block_heights: [971043, 971047] } }],
});

test('anchoring: the 2026-10-01 incident (confirmed ledger, pending wording) fails', () => {
  const body = '- History: Verdict history is hash-chained; the Bitcoin attestation is not yet confirmed. Cadence bound = x';
  assert.match(checkAnchorStatement(body, '/llms.txt', confirmedLedger) ?? '', /not say anchored|pending/);
});

test('anchoring: confirmed wording with the latest height passes; a stale height fails', () => {
  const ok = '- History: Verdict history is hash-chained and anchored to Bitcoin via OpenTimestamps (latest confirmed at block 971,043). Cadence bound';
  assert.equal(checkAnchorStatement(ok, '/llms.txt', confirmedLedger), null);
  const stale = ok.replace('971,043', '951,197');
  assert.match(checkAnchorStatement(stale, '/llms.txt', confirmedLedger) ?? '', /cites another/);
});

test('anchoring: an unconfirmed ledger may not be called anchored, and a missing line fails', () => {
  const pending = summarizeAnchorLedger({ anchors: [{}] });
  const body = '- History: Verdict history is hash-chained and anchored to Bitcoin via OpenTimestamps.';
  assert.match(checkAnchorStatement(body, '/llms.txt', pending) ?? '', /claims anchored/);
  assert.match(checkAnchorStatement('no such line', '/llms.txt', pending) ?? '', /no "History:" line/);
});
