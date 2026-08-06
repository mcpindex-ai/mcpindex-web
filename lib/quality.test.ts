import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeQuality, rankByQuality, DOCK_UNREACHABLE_SOURCE } from './quality';
import { loadSourceLiveness, type SourceLiveness } from './sourceLiveness';
import { loadServers } from './registry';
import type { IndexedServer } from './types';

function makeServer(over: Partial<IndexedServer> = {}): IndexedServer {
  return {
    source: 'registry',
    slug: 'x',
    baseSlug: 'x',
    name: 'ns/x',
    title: 'X Server',
    description: 'A description comfortably longer than the fifty character floor.',
    version: '1.0.0',
    category: 'other',
    publishedAt: '2026-01-01',
    // Freshness decays with wall-clock time. Every assertion below is a DELTA or a
    // dimension comparison between two scores taken at the same instant, never an
    // absolute total — an absolute would silently start failing the day the fixture
    // crosses the 30/365-day boundaries.
    updatedAt: new Date().toISOString(),
    status: 'active',
    hasRemote: false,
    hasPackage: false,
    primaryTransport: null,
    envVars: [],
    ...over,
  };
}

const FLAGGED: SourceLiveness = {
  state: 'unavailable',
  url: 'https://github.com/acme/x',
  last_verified_accessible: null,
  confirmed_unavailable: '2026-07-23',
  evidence: { http_status: 404, vantages: 2, methods: ['a', 'b'] },
};

// The docking is gated until after the 2026-08-20 checkpoint (see DOCK_UNREACHABLE_SOURCE).
// Every delta assertion is expressed against the gate, so this suite guards the CURRENT
// behaviour today and the DOCKED behaviour the moment the constant flips - no test edits.
const EXPECTED_DROP = DOCK_UNREACHABLE_SOURCE ? 10 : 0;

test('an unreachable source moves ONLY the two repo-derived credits, per the gate', () => {
  const s = makeServer({ repositoryUrl: 'https://github.com/acme/x', npmPackage: 'x', hasPackage: true });
  const alive = computeQuality(s, null);
  const dead = computeQuality(s, FLAGGED);

  assert.equal(alive.score - dead.score, EXPECTED_DROP, 'total drop must match the gate');
  assert.equal(alive.breakdown.completeness - dead.breakdown.completeness, EXPECTED_DROP / 2);
  assert.equal(alive.breakdown.documentation - dead.breakdown.documentation, EXPECTED_DROP / 2);
  // Whatever the gate says, the drop may only ever come from those two dimensions.
  assert.equal(alive.breakdown.installability, dead.breakdown.installability);
  assert.equal(alive.breakdown.freshness, dead.breakdown.freshness);
  assert.equal(alive.breakdown.stability, dead.breakdown.stability);
});

test('installability and freshness are NOT docked for an unreachable repo', () => {
  // The issue that prompted this change asked for installability to be docked too.
  // Refused on purpose: for a remote entry the endpoint was never the repository, which
  // is what livenessRecommendation() already tells callers. This test is the guard on
  // that decision — if someone later docks installability, they must come here first.
  const remote = makeServer({
    repositoryUrl: 'https://github.com/acme/x',
    remoteUrl: 'https://api.example.com/mcp',
    hasRemote: true,
  });
  const alive = computeQuality(remote, null);
  const dead = computeQuality(remote, FLAGGED);

  assert.equal(dead.breakdown.installability, alive.breakdown.installability);
  assert.equal(dead.breakdown.installability, 25);
  assert.equal(dead.breakdown.freshness, alive.breakdown.freshness);
  assert.equal(dead.breakdown.stability, alive.breakdown.stability);
});

test('null liveness never raises a score — it is the absence of evidence, not an all-clear', () => {
  const s = makeServer({ repositoryUrl: 'https://github.com/acme/x' });
  // Scoring with null must be identical to the pre-change behaviour: repo credit granted
  // on presence. The asymmetry is the whole doctrine in lib/sourceLiveness — negative-only
  // evidence may withhold credit and may never add any.
  assert.equal(computeQuality(s, null).breakdown.completeness, 15); // title + desc + repo
  assert.equal(computeQuality(s, null).breakdown.documentation, 15); // repo 5 + no-env 10
});

test('a flagged server with no repository URL has nothing to dock', () => {
  const s = makeServer({ remoteUrl: 'https://api.example.com/mcp', hasRemote: true });
  assert.equal(computeQuality(s, FLAGGED).score, computeQuality(s, null).score);
});

test('rankByQuality applies liveness per server, not globally', () => {
  const alive = makeServer({ slug: 'alive', name: 'ns/alive', repositoryUrl: 'https://github.com/a/alive' });
  const dead = makeServer({ slug: 'dead', name: 'ns/dead', repositoryUrl: 'https://github.com/a/dead' });
  const ranked = rankByQuality([dead, alive], (s) => (s.name === 'ns/dead' ? FLAGGED : null));

  assert.equal(ranked[0].score - ranked[1].score, EXPECTED_DROP);
  if (DOCK_UNREACHABLE_SOURCE) {
    assert.equal(ranked[0].server.slug, 'alive', 'the reachable one must outrank the flagged one');
  }
});

// The live guard. Fixtures prove the arithmetic; this proves the two real artifacts are
// actually joined — that the census is keyed the way the scorer looks it up. A key
// mismatch (name vs slug) fails OPEN: every lookup misses, nothing is docked, and every
// fixture test above still passes.
test('the real corpus: the census actually joins, and every flagged listing moves by the gate', async () => {
  const [servers, doc] = await Promise.all([loadServers(), loadSourceLiveness()]);
  assert.ok(servers.length > 1000, `expected a full snapshot, got ${servers.length}`);

  let flaggedWithRepo = 0;
  for (const s of servers) {
    const l = doc.servers[s.name];
    if (!l || !s.repositoryUrl) continue;
    flaggedWithRepo++;
    assert.equal(
      computeQuality(s, null).score - computeQuality(s, l).score,
      EXPECTED_DROP,
      `${s.slug} drop did not match the gate`,
    );
  }
  // If this ever reads 0 the join is broken, not the corpus.
  assert.ok(
    flaggedWithRepo > 1000,
    `expected the census to join thousands of listings, joined ${flaggedWithRepo}`,
  );
});

// A tripwire on the SWEEP, not on this code. The sweep is a weekly launchd cron on one
// box; if it dies the artifact silently freezes and every flagged listing keeps carrying a
// public claim about a third party's repository that nobody is re-checking. A red here
// reads "go look at the sweep", which is why it is its own test with its own name rather
// than a precondition buried in the corpus test above.
test('census freshness tripwire: the sweep is still running', async () => {
  const { loadSourceLiveness, censusAgeDays, MAX_CENSUS_AGE_DAYS } = await import('./sourceLiveness');
  const doc = await loadSourceLiveness();
  const age = censusAgeDays(doc.generated_at);
  assert.ok(
    age !== null && age <= MAX_CENSUS_AGE_DAYS,
    `data/source-liveness.json is ${age === null ? 'undated' : `${age.toFixed(1)}d old`} ` +
      `(limit ${MAX_CENSUS_AGE_DAYS}d) - the artifact is now withheld entirely. Check the VM sweep.`,
  );
});

test('a stale census is withheld wholesale, not silently trusted', async () => {
  const { isCensusPublishable } = await import('./sourceLiveness');
  const doc = { generated_at: '2026-01-01T00:00:00Z', servers: {} };
  assert.equal(isCensusPublishable(doc, Date.parse('2026-08-06T00:00:00Z')), false);
  assert.equal(isCensusPublishable(doc, Date.parse('2026-02-01T00:00:00Z')), true);
  // Undated or unparseable is unusable, never "fresh by default".
  assert.equal(isCensusPublishable({ generated_at: '', servers: {} }), false);
});
