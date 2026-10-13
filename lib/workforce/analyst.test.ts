import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateFacts, type Fact } from '../facts';
import { roundsTo } from '../factsGuard';
import {
  applyWrites,
  delta,
  judge,
  parseOutput,
  renderReport,
  repinQuery,
  writable,
  writes,
  type Outcome,
} from './analyst';

const SHA = 'abc1234';
const live: Fact = {
  id: 'panel.pct',
  value: 6.9,
  raw: 6.85,
  unit: 'percent',
  query: "git -C mcpindex-trust show 5e22333:a/figures.json | jq '.x'",
  observed_at: '2026-07-28',
  max_age_days: 14,
};
const frozen: Fact = { ...live, id: 'panel.frozen', max_age_days: undefined };
const ok = (stdout: string) => ({ ok: true as const, stdout });

test('repin: every mcpindex-trust pin moves to main, other queries are untouched', () => {
  assert.equal(repinQuery(live.query, SHA), "git -C mcpindex-trust show abc1234:a/figures.json | jq '.x'");
  const py = "python3 -c \"print(1)\"";
  assert.equal(repinQuery(py, SHA), py);
  assert.throws(() => repinQuery(live.query, 'main; rm -rf /'), /not a commit sha/);
});

test('update math: raw is kept at full precision, value is half-up at the published decimals', () => {
  const o = judge(live, ok('7.25\n'), repinQuery(live.query, SHA), '2026-10-18');
  assert.equal(o.kind, 'moved');
  if (o.kind !== 'moved') return;
  assert.equal(o.next.value, 7.3);
  assert.equal(o.next.raw, 7.25);
  assert.ok(roundsTo(o.next.raw!, o.next.value as number), 'the guard must accept what the analyst writes');
  assert.equal(o.next.observed_at, '2026-10-18');
  assert.match(o.next.query, /show abc1234:/);
  assert.deepEqual(Object.keys(o.next), ['id', 'value', 'raw', 'unit', 'query', 'observed_at', 'max_age_days']);
});

test('update math: a whole new raw drops the raw field; float noise is not a move', () => {
  const o = judge(live, ok('7'), live.query, '2026-10-18');
  assert.equal(o.kind, 'moved');
  if (o.kind === 'moved') {
    assert.equal(o.next.value, 7);
    assert.equal('raw' in o.next, false);
  }
  const bound = { ...live, value: 59.3, raw: 59.31 };
  assert.equal(judge(bound, ok('59.309999999999995'), live.query, '2026-10-18').kind, 'remeasured');
  const count: Fact = { ...live, id: 'c.n', value: 17673, raw: undefined, unit: 'servers' };
  const c = judge(count, ok('18001'), live.query, '2026-10-18');
  assert.equal(c.kind === 'moved' && c.next.value, 18001);
  assert.equal(delta(17673, 18001), '17673 -> 18001 (+328, +1.9%)');
  assert.equal(delta(6.9, 6.5), '6.9 -> 6.5 (-0.4, -5.8%)');
});

test('update math: a rate keeps one decimal even when stored as a whole number (10.0)', () => {
  const pct: Fact = { ...live, value: 10.0, raw: undefined };
  const o = judge(pct, ok('10.34'), live.query, '2026-10-18');
  assert.ok(o.kind === 'moved' && o.next.value === 10.3 && o.next.raw === 10.34);
});

test('failed query: an error, empty output, extra lines or a shape change never produce a value', () => {
  assert.equal(judge(live, { ok: false, error: 'exit 128: fatal: path not in abc1234' }, live.query, 'd').kind, 'failed');
  assert.equal(judge(live, ok('   \n'), live.query, 'd').kind, 'failed');
  assert.match((judge(live, ok('1\n2'), live.query, 'd') as { reason: string }).reason, /2 lines/);
  assert.match((judge(live, ok('null'), live.query, 'd') as { reason: string }).reason, /shape change/);
  const date: Fact = { ...live, value: '2026-07-20', raw: undefined, unit: 'date' };
  assert.match((judge(date, ok('July 20'), live.query, 'd') as { reason: string }).reason, /date was expected/);
  assert.equal(parseOutput(date, '2026-10-01\n').ok, true);
});

test('failed query: one failure blocks every write, including facts that moved cleanly', () => {
  const outs: Outcome[] = [
    judge(live, ok('7.25'), live.query, 'd'),
    judge({ ...live, id: 'b.c' }, { ok: false, error: 'exit 1' }, live.query, 'd'),
  ];
  assert.equal(writable(outs), false);
  assert.match(renderReport({ date: 'd', trustSha: SHA, trustRemote: 'r' }, outs), /FAILED, nothing written[\s\S]*b\.c: query failed: exit 1/);
});

test('CONTRADICTED: re-run and reported, never written, and does not block the run', () => {
  const c: Fact = { ...live, id: 'd3.conforming_labels', note: 'CONTRADICTED. mcpindex-trust replaced it.' };
  const moved = judge(c, ok('0'), live.query, 'd');
  const failed = judge(c, { ok: false, error: 'exit 1' }, live.query, 'd');
  assert.equal(moved.kind, 'contradicted');
  assert.equal(failed.kind, 'contradicted');
  assert.equal(writable([moved, failed]), true);
  assert.deepEqual(writes([moved, failed]), []);
  assert.match(renderReport({ date: 'd', trustSha: SHA, trustRemote: 'r' }, [moved]), /CONTRADICTED[\s\S]*main prints 0/);
});

test('frozen: a fact without max_age_days that moved at main is reported and fails the run', () => {
  const o = judge(frozen, ok('7.25'), live.query, 'd');
  assert.equal(o.kind, 'frozen-moved');
  assert.equal(writable([o]), false);
  assert.equal(judge(frozen, ok('6.85'), live.query, 'd').kind, 'unchanged');
});

test('write: only the changed object is rewritten; 10.0 elsewhere survives byte for byte', () => {
  const text = fs.readFileSync('lib/facts.json', 'utf8');
  const doc = validateFacts(JSON.parse(text));
  const target = doc.find((f) => f.id === 'drift_panel.description_pct_89d')!;
  const next = { ...target, value: 7.1, raw: 7.08, observed_at: '2026-10-18' };
  const out = applyWrites(text, [next]);
  validateFacts(JSON.parse(out));
  assert.ok(out.includes('"value": 10.0'), 'untouched 10.0 must not be reformatted');
  const changed = out.split('\n').filter((l, i) => l !== text.split('\n')[i]);
  assert.ok(changed.length <= 6, `expected a local change, got ${changed.length} differing lines`);
  assert.equal(JSON.parse(out).facts.find((f: Fact) => f.id === target.id).raw, 7.08);
});
