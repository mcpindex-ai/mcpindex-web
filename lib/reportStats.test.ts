// Unit tests for the drift-report stats reader (build plan #11). Pins the schema gate, the
// coercion allowlists, the frozen-edition/DOI agreement, and the page's copy rules (basis-named
// silent share; no direction claims; no scare framing). Run with `npx tsx --test lib/reportStats.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  driftReportEnabled,
  parseReportStatsBlob,
  REPORT_STATS_SCHEMA,
} from './reportStats';

const BLOB = {
  schema: REPORT_STATS_SCHEMA,
  generated_at: '2026-07-20T00:00:45Z',
  aggregates: {
    events_total: 57517,
    safety_events: 3058,
    deduped_safety_incidents: 2503,
    incidents_by_kind: { 'output-schema-changed': 992, 'tool-removed': 872 },
    version_delta_split: { same: 1561, changed: 942 },
    silent_share_pct: 62.4,
    flip_segmentation: { 'first-labeling|same': 63, 'guarantee-change|changed': 30 },
  },
  coverage: {
    snapshot_count: 23,
    pair_count: 22,
    first_snapshot: '2026-06-09T04:58:04Z',
    last_snapshot: '2026-07-19T16:22:29Z',
    elapsed_days: 40,
    gap_spans: [{ after: '2026-06-20T16:22:39Z', before: '2026-07-11T17:51:40Z', days: 21.1 }],
  },
  removals: {
    deduped_removal_fp_count: 872,
    deduped_removal_event_count: 873,
    removal_scope_split: { single: 138, 'toolset-replaced': 734 },
  },
  unstable: {
    unstable_incident_count: 102,
    unstable_tool_count: 76,
    excluded_event_share_pct: 5.8,
    by_signal: { occurrence_days_ge5: 0, hash_revert: 41, dynamic_metadata: 63 },
  },
  headline_excluding_unstable: {
    deduped_safety_incidents: 2401,
    incidents_by_kind: { 'output-schema-changed': 955 },
    version_delta_split: { same: 1522, changed: 879 },
    silent_share_pct: 63.4,
  },
};

test('driftReportEnabled is false when NEXT_PUBLIC_DRIFT_REPORT is unset or not "1"', () => {
  delete process.env.NEXT_PUBLIC_DRIFT_REPORT;
  assert.equal(driftReportEnabled(), false);
  process.env.NEXT_PUBLIC_DRIFT_REPORT = '0';
  assert.equal(driftReportEnabled(), false);
  process.env.NEXT_PUBLIC_DRIFT_REPORT = 'true';
  assert.equal(driftReportEnabled(), false);
  process.env.NEXT_PUBLIC_DRIFT_REPORT = '1';
  assert.equal(driftReportEnabled(), true);
  delete process.env.NEXT_PUBLIC_DRIFT_REPORT;
});

test('parseReportStatsBlob: parses a JSON string blob, passes through an object blob', () => {
  const fromObject = parseReportStatsBlob(BLOB);
  const fromString = parseReportStatsBlob(JSON.stringify(BLOB));
  assert.deepEqual(fromObject, fromString);
  assert.equal(fromObject?.aggregates.deduped_safety_incidents, 2503);
  assert.equal(fromObject?.aggregates.silent_share_pct, 62.4); // decimal survives
  assert.equal(fromObject?.removals.removal_scope_split['toolset-replaced'], 734);
  assert.equal(fromObject?.headline_excluding_unstable.silent_share_pct, 63.4);
  assert.equal(fromObject?.generated_at, '2026-07-20T00:00:45Z');
});

test('parseReportStatsBlob: rejects missing, unparseable, wrong-schema blobs (schema-pinned)', () => {
  assert.equal(parseReportStatsBlob(null), null);
  assert.equal(parseReportStatsBlob(undefined), null);
  assert.equal(parseReportStatsBlob('{not json'), null);
  assert.equal(parseReportStatsBlob(42), null);
  assert.equal(parseReportStatsBlob({ ...BLOB, schema: 'mcpindex.drift.report-stats/2' }), null);
  assert.equal(parseReportStatsBlob({ ...BLOB, schema: undefined }), null);
});

test('coercion: unknown incident kinds are dropped (allowlist), counts clamped to ints', () => {
  const out = parseReportStatsBlob({
    ...BLOB,
    aggregates: {
      ...BLOB.aggregates,
      incidents_by_kind: {
        'output-schema-changed': 9.9,
        'made-up-kind': 1000,
        '<script>': 5,
        'tool-removed': -3,
      },
    },
  });
  assert.deepEqual(out?.aggregates.incidents_by_kind, {
    'output-schema-changed': 9,
    'tool-removed': 0,
  });
});

test('coercion: version_delta_split keeps only the four classes; absent keys stay absent', () => {
  const out = parseReportStatsBlob({
    ...BLOB,
    aggregates: {
      ...BLOB.aggregates,
      version_delta_split: { same: 10, bumped: 99, undeclared: 0, junk: 1 },
    },
  });
  assert.deepEqual(out?.aggregates.version_delta_split, { same: 10, undeclared: 0 });
  assert.equal(out?.aggregates.version_delta_split.changed, undefined); // absent is not zero
});

test('coercion: flip_segmentation keys must be class|delta shaped; hostile keys dropped', () => {
  const out = parseReportStatsBlob({
    ...BLOB,
    aggregates: {
      ...BLOB.aggregates,
      flip_segmentation: {
        'first-labeling|same': 63,
        'guarantee-change|not-recorded': 2,
        'rug-pull|same': 7,
        'first-labeling': 4,
        'first-labeling|bumped': 4,
      },
    },
  });
  assert.deepEqual(out?.aggregates.flip_segmentation, {
    'first-labeling|same': 63,
    'guarantee-change|not-recorded': 2,
  });
});

test('coercion: percentages clamp to [0,100] and keep one decimal; numbers never negative', () => {
  const out = parseReportStatsBlob({
    ...BLOB,
    aggregates: { ...BLOB.aggregates, silent_share_pct: 640.23, deduped_safety_incidents: -5 },
    unstable: { ...BLOB.unstable, excluded_event_share_pct: -2 },
  });
  assert.equal(out?.aggregates.silent_share_pct, 100);
  assert.equal(out?.aggregates.deduped_safety_incidents, 0);
  assert.equal(out?.unstable.excluded_event_share_pct, 0);
  assert.equal(parseReportStatsBlob(BLOB)?.unstable.excluded_event_share_pct, 5.8);
});

test('coercion: gap spans are shape-gated (timestamps blanked when malformed) and bounded', () => {
  const hostile = Array.from({ length: 100 }, () => ({
    after: 'not-a-date',
    before: '2026-07-11T17:51:40Z',
    days: -4,
  }));
  const out = parseReportStatsBlob({ ...BLOB, coverage: { ...BLOB.coverage, gap_spans: hostile } });
  assert.equal(out?.coverage.gap_spans.length, 24); // bounded
  assert.equal(out?.coverage.gap_spans[0].after, ''); // malformed ts blanked
  assert.equal(out?.coverage.gap_spans[0].before, '2026-07-11T17:51:40Z');
  assert.equal(out?.coverage.gap_spans[0].days, 0); // negative clamped
  const noSpans = parseReportStatsBlob({ ...BLOB, coverage: { ...BLOB.coverage, gap_spans: 'x' } });
  assert.deepEqual(noSpans?.coverage.gap_spans, []);
});

test('coercion: unstable by_signal is allowlisted; missing blocks coerce to zeroed shapes', () => {
  const out = parseReportStatsBlob({
    ...BLOB,
    unstable: { ...BLOB.unstable, by_signal: { hash_revert: 41, invented_signal: 9 } },
  });
  assert.deepEqual(out?.unstable.by_signal, { hash_revert: 41 });
  const bare = parseReportStatsBlob({ schema: REPORT_STATS_SCHEMA });
  assert.equal(bare?.aggregates.deduped_safety_incidents, 0);
  assert.deepEqual(bare?.coverage.gap_spans, []);
  assert.equal(bare?.removals.removal_scope_split.single, 0);
  assert.equal(bare?.generated_at, '');
});

// ---- Edition mechanism: the checked-in frozen edition must survive the SAME coercion path the
// page feeds it through, and its headline numbers must equal the pinned census figures the DOI
// snapshot will carry - the your-page-says-X-your-DOI-says-Y mismatch is what this kills.
test('edition v1: checked-in JSON coerces cleanly and matches the pinned headline numbers', () => {
  const edition = JSON.parse(
    fs.readFileSync(new URL('../data/report-edition-v1.json', import.meta.url), 'utf8'),
  );
  const parsed = parseReportStatsBlob({
    schema: REPORT_STATS_SCHEMA,
    generated_at: '',
    aggregates: edition.aggregates,
    coverage: edition.coverage,
    removals: edition.removals,
    unstable: edition.unstable,
    headline_excluding_unstable: edition.headline_excluding_unstable,
  });
  assert.ok(parsed, 'edition must survive report-stats coercion');
  assert.equal(parsed.aggregates.deduped_safety_incidents, 2503);
  assert.equal(parsed.aggregates.silent_share_pct, 62.4);
  assert.deepEqual(parsed.aggregates.version_delta_split, { same: 1561, changed: 942, undeclared: 0 });
  assert.equal(parsed.removals.deduped_removal_fp_count, 872);
  assert.equal(parsed.removals.removal_scope_split['toolset-replaced'], 734);
  assert.equal(parsed.unstable.unstable_tool_count, 76);
  assert.equal(parsed.headline_excluding_unstable.silent_share_pct, 63.4);
  assert.equal(parsed.coverage.snapshot_count, 23);
  assert.equal(parsed.coverage.elapsed_days, 40);
  assert.equal(parsed.coverage.gap_spans[0]?.days, 21.1);
  assert.equal(edition.frozen_at, '2026-07-19');
  assert.equal(edition.silent_share_basis, 'deduped safety incidents, first-occurrence delta');
  // DOI: either the pre-publication placeholder or a real minted DOI - never garbage that the
  // page's render condition would silently hide.
  assert.ok(
    edition.doi === 'PENDING-SET-AT-PUBLICATION' || /^10\.\d{4,9}\/\S+$/.test(edition.doi),
    `unexpected doi value: ${edition.doi}`,
  );
});

// ---- Source copy pins (style-match the /ledger lede copy-pin test): the report page must name
// the silent-share basis, and must not carry direction claims ('version bumped'), the bare
// report-headline framing ('% silent' with no basis), or scare framing ('rug pull').
test('copy pins: /drift-report sources carry the basis label and none of the banned framings', () => {
  const sources = [
    '../app/drift-report/page.tsx',
    '../components/DriftReportCta.tsx',
    './reportStats.ts',
    './reportStatsServer.ts',
  ].map((p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
  const page = sources[0];
  assert.ok(
    page.includes('deduped safety incidents, first-occurrence delta'),
    'silent-share basis label missing from the page',
  );
  assert.ok(page.includes('Live since Edition v1'), 'live-counters label missing');
  assert.ok(
    page.includes('early design partners get input on the roadmap'),
    'ICP-2 hand-raise line missing',
  );
  assert.ok(page.includes('drift_report_cta') || sources[1].includes('drift_report_cta'),
    'ICP-1 CTA must fire its own gate_cta_click source');
  for (const src of sources) {
    assert.ok(!src.includes('version bumped'), "'bumped' asserts direction the data does not carry");
    assert.ok(!/%\s*silent/.test(src), "bare '% silent' framing banned; the basis must be named");
    assert.ok(!/rug[\s-]?pull/i.test(src), "'rug pull' is question-layer only, never a headline claim");
    assert.ok(!src.includes('—'), 'em-dash banned; hyphens only');
  }
});
