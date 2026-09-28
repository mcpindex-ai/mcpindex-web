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

test('definition text is plain ASCII, one sentence each', () => {
  for (const s of [DRIFT_DEFINITION, DRIFT_CONTRACT_SCOPE]) {
    assert.match(s, ASCII);
    assert.equal(s.trim().split(/\.\s/).length, 1, `more than one sentence: ${s}`);
  }
});

test('live-contract figures are the frozen edition v1 headline', () => {
  assert.equal(LIVE_EDITION.incidents, 2503);
  assert.equal(LIVE_EDITION.sameVersion, 1561);
  assert.equal(LIVE_EDITION.silentPct, 62.4);
  assert.equal(
    Math.round((1000 * LIVE_EDITION.sameVersion) / LIVE_EDITION.incidents) / 10,
    LIVE_EDITION.silentPct,
  );
  assert.equal(LIVE_EDITION.flips, 123);
  assert.equal(LIVE_EDITION.stableIncidents, 2401);
  assert.equal(LIVE_EDITION.stableSilentPct, 63.4);
  assert.equal(LIVE_EDITION.unstableTools, 76);
  assert.equal(LIVE_EDITION.snapshots, 23);
  assert.equal(LIVE_EDITION.days, 40);
  assert.equal(LIVE_EDITION.outageDays, 21);
  assert.equal(LIVE_EDITION.versionDoi, '10.5281/zenodo.21449150');
});

test('concentration figures are internally consistent', () => {
  const c = LIVE_CONCENTRATION;
  assert.equal(
    Math.round((1000 * c.topPublisherIncidents) / LIVE_EDITION.incidents) / 10,
    c.topPublisherPct,
  );
  assert.ok(c.publishersMostlySameVersion <= c.publishers);
  assert.ok(c.publishers <= c.servers);
  assert.ok(c.flipServers <= c.servers);
});

// The registry figures are literal here; the long-standing guide quotes the same panel. If one
// side is corrected and the other is not, this fails.
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
    `${p.neverChangedPct}% of eligible servers never changed`,
    `top 10% of changers account for ${p.top10ChangerSharePct}%`,
    p.eligible.toLocaleString('en-US'),
    p.conceptDoi,
  ]) {
    assert.ok(body.includes(needle), `guide no longer says: ${needle}`);
  }
});
