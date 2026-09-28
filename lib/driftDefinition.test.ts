// Pins the /drift definition and figures. The page exists to be quoted, so a number that moves
// without anyone deciding to move it is the failure this file catches. Run with
// `npx tsx --test lib/driftDefinition.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DRIFT_DEFINITION,
  DRIFT_CONTRACT_SCOPE,
  LIVE_EDITION,
  LIVE_CONCENTRATION,
  REGISTRY_PANEL,
} from './driftDefinition';

const ASCII = /^[\x20-\x7e]*$/;
const pct1 = (num: number, den: number) => Math.round((1000 * num) / den) / 10;

test('definition text is plain ASCII, one sentence each', () => {
  for (const s of [DRIFT_DEFINITION, DRIFT_CONTRACT_SCOPE]) {
    assert.match(s, ASCII);
    assert.equal(s.trim().split(/\.\s/).length, 1, `more than one sentence: ${s}`);
  }
});

test('live-contract figures are the frozen edition v1 headline', () => {
  const L = LIVE_EDITION;
  assert.equal(L.incidents, 2503);
  assert.equal(L.kindsObserved, 9);
  assert.equal(L.sameVersion, 1561);
  assert.equal(L.silentPct, 62.4);
  assert.equal(pct1(L.sameVersion, L.incidents), L.silentPct);
  assert.equal(L.flips, 123);
  assert.equal(L.flipsFirstLabel, 68);
  assert.equal(L.flipsGuaranteeChange, 55);
  assert.equal(L.flipsFirstLabel + L.flipsGuaranteeChange, L.flips);
  assert.equal(L.stableIncidents, 2401);
  assert.equal(L.stableSilentPct, 63.4);
  assert.equal(L.unstableTools, 76);
  assert.equal(L.snapshots, 23);
  assert.equal(L.days, 40);
  assert.equal(L.outageDays, 21);
  assert.equal(L.versionDoi, '10.5281/zenodo.21449150');
});

// Recomputed from the edition's public per-server file, so a hand-typed concentration figure
// cannot pass on the strength of an ordering check.
test('concentration figures recompute from the per-server CSV', () => {
  const lines = fs
    .readFileSync(new URL('../data/report-edition-v1-per-server.csv', import.meta.url), 'utf8')
    .trim()
    .split('\n');
  const header = lines[0].split(',');
  const col = (name: string) => header.indexOf(name);
  const [iServer, iIncidents, iKinds, iSame, iChanged] = [
    'server',
    'safety_incidents',
    'kinds',
    'version_same',
    'version_changed',
  ].map(col);
  // No quoted fields in this file; assert it so a future export with commas in a name fails loudly.
  for (const l of lines) assert.ok(!l.includes('"'), `quoted field, parser needs updating: ${l}`);
  const rows = lines.slice(1).map((l) => l.split(','));

  const sum = (i: number) => rows.reduce((a, r) => a + Number(r[i]), 0);
  assert.equal(sum(iIncidents), LIVE_EDITION.incidents);
  assert.equal(sum(iSame), LIVE_EDITION.sameVersion);
  assert.equal(sum(iSame) + sum(iChanged), LIVE_EDITION.incidents);
  assert.equal(rows.length, LIVE_CONCENTRATION.servers);

  const flipServers = rows.filter((r) => r[iKinds].includes('annotation-flip-to-destructive:'));
  assert.equal(flipServers.length, LIVE_CONCENTRATION.flipServers);

  const byPublisher = new Map<string, number>();
  for (const r of rows) {
    const pub = r[iServer].split('/')[0];
    byPublisher.set(pub, (byPublisher.get(pub) ?? 0) + Number(r[iSame]));
  }
  const same = [...byPublisher.values()].sort((a, b) => b - a);
  assert.equal(same[0], LIVE_CONCENTRATION.topSameVersionPublisher);
  assert.equal(pct1(same[0], LIVE_EDITION.sameVersion), LIVE_CONCENTRATION.topSameVersionPct);
  const top5 = same.slice(0, 5).reduce((a, b) => a + b, 0);
  assert.equal(pct1(top5, LIVE_EDITION.sameVersion), LIVE_CONCENTRATION.topFiveSameVersionPct);
});

// The panel file is not in this repo, so these literals are checked against the long-standing
// guide that quotes the same panel: correcting one side without the other fails here. It cannot
// catch an error both copies share; the concentration wording was one (fixed 2026-09-28).
test('registry panel figures match the guide that already cites the panel', () => {
  const guide = JSON.parse(
    fs.readFileSync(
      new URL(
        '../content/guides/how-many-mcp-servers-change-their-tools-after-publishing.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const body: string = guide.body;
  const p = REGISTRY_PANEL;
  for (const needle of [
    `${p.descriptionPct.d30}% within 30 days, ${p.descriptionPct.d60}% within 60, ${p.descriptionPct.d89}% within 89`,
    `${p.descriptorPct.d30}% of servers changed it within 30 days, ${p.descriptorPct.d60}% within 60, ${p.descriptorPct.d89}% within 89`,
    `Of the ${p.eligible.toLocaleString('en-US')} servers seen in at least ten observations, ${p.neverChangedPct}% never changed`,
    `the 10% of eligible servers that changed most account for ${p.topTenthSharePct}%`,
    `${p.cohorts.d30} of them for 30 days, ${p.cohorts.d60} for 60 and ${p.cohorts.d89} for 89, where the 89-day windows run at least ${p.minWindowDaysAt89} days`,
    `observed the official MCP registry ${p.observations} times over ${p.spanDays} days`,
    `data cutoff ${p.cutoff}`,
    p.conceptDoi,
  ]) {
    assert.ok(body.includes(needle), `guide no longer says: ${needle}`);
  }
  // Both past errors, checked across every field a reader or a crawler sees.
  const everything = JSON.stringify(guide);
  assert.ok(!everything.includes('top 10% of changers'), 'the wrong concentration wording is back');
  assert.ok(
    !everything.includes(`% of ${p.eligible.toLocaleString('en-US')}`),
    'a survival rate is quoted as a share of the eligible servers; its denominator is each cohort',
  );
});
