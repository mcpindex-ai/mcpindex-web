// Locks the two machine-readable AEO surfaces (/llms.txt, /llms-full.txt) that broadcast
// mcpindex's load-bearing honest claims to answer engines. Neither had test coverage, so a
// refactor could silently (a) drift the install commands away from their source constant, or
// (b) inflate a v1 honesty caveat into a false capability claim. These tests fail closed on both.
// The size tripwire converts the unbounded-growth concern on /llms-full.txt into a deferred,
// data-triggered decision: it goes red only if the catalog dump grows into genuinely harmful
// territory — that, not design taste, is when we revisit slimming it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET as llms } from '../../app/llms.txt/route';
import { GET as llmsFull } from '../../app/llms-full.txt/route';
import { gateInstallLine } from '../../lib/install/manifest';
import { loadServers, loadSnapshotMeta } from '../../lib/registry';
import { SOURCE_LIVENESS_CENSUS } from '../../lib/sourceLiveness';

async function bodyOf(res: Response): Promise<string> {
  return res.text();
}

test('/llms.txt: canonical install line is generated from source (no hand-drift)', async () => {
  const res = await llms();
  const body = await bodyOf(res);
  // The route renders gateInstallLine({ code: true }); assert its exact output is present,
  // so the install copy can never drift from lib/install/manifest.
  assert.ok(
    body.includes(gateInstallLine({ code: true })),
    'llms.txt install line drifted from gateInstallLine({code:true})',
  );
});

test('/llms.txt: load-bearing honest claims are intact', async () => {
  const body = await bodyOf(await llms());
  for (const phrase of [
    'Not a safety oracle',
    'ALLOW and DENY are reserved in the contract, not emitted today',
    'calibrated=false',
    'held off by default',
    'Unofficial. Not affiliated with Anthropic',
  ]) {
    assert.ok(body.includes(phrase), `llms.txt missing honest claim: "${phrase}"`);
  }
});

test('/llms.txt: structure + content-type', async () => {
  const res = await llms();
  const body = await bodyOf(res);
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  // Edge-cacheable with a long stale-while-revalidate. Both halves are load-bearing: rendering this
  // body costs a cold isolate a ~25MB snapshot parse, so without SWR every TTL expiry puts one
  // fetcher on the origin-render path — which is exactly how an agent-accessibility audit timed out
  // fetching llms.txt while the route was no-store.
  const cc = res.headers.get('cache-control') ?? '';
  assert.match(cc, /s-maxage=3600\b/, 'llms.txt must be edge-cached for an hour');
  assert.match(cc, /stale-while-revalidate=86400\b/, 'llms.txt must keep SWR so a cold render never blocks a fetcher');
  assert.ok(body.startsWith('# mcpindex.ai'), 'llms.txt must open with the H1 title');
  assert.ok(body.includes('/api/mcp'), 'llms.txt must advertise the remote MCP endpoint');
});

test('/llms-full.txt: canonical install line is generated from source', async () => {
  const body = await bodyOf(await llmsFull());
  // The full doc renders gateInstallLine() (no code fences).
  assert.ok(
    body.includes(gateInstallLine()),
    'llms-full.txt install line drifted from gateInstallLine()',
  );
});

test('/llms-full.txt: load-bearing honest claims are intact', async () => {
  const body = await bodyOf(await llmsFull());
  for (const phrase of [
    'Contract states: ALLOW / DENY / REVIEW / UNVERIFIED',
    'ALLOW and DENY are reserved, not produced',
    'calibrated=false',
    'held off by default',
  ]) {
    assert.ok(body.includes(phrase), `llms-full.txt missing honest claim: "${phrase}"`);
  }
});

test('/llms-full.txt: catalog present, content-type, and runaway size tripwire', async () => {
  const res = await llmsFull();
  const body = await bodyOf(res);
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  // Same contract as llms.txt, and it matters more here: this body is ~4MB, so an uncached origin
  // render is both a slow path and an egress cost.
  const cc = res.headers.get('cache-control') ?? '';
  assert.match(cc, /s-maxage=3600\b/, 'llms-full.txt must be edge-cached for an hour');
  assert.match(cc, /stale-while-revalidate=86400\b/, 'llms-full.txt must keep SWR so a cold render never blocks a fetcher');
  assert.ok(body.includes('Total servers:'), 'llms-full.txt must state the catalog total');
  // One detail link per indexed server — tie to the source of truth so a RENDER-side partial collapse
  // is caught. (A source-side collapse would move both sides together; the coarse absolute floor below
  // guards that: the real registry is ~16k, so <10k means the snapshot itself shrank.)
  // Tied to loadServers(), NOT getServerCount(): the latter is deliberately registry-only
  // because /stats publishes it under an explicit "official registry" claim, while this
  // catalog lists everything mcpindex indexes, editorially admitted servers included.
  const serverLinks = body.match(/https:\/\/mcpindex\.ai\/server\//g)?.length ?? 0;
  assert.equal(serverLinks, (await loadServers()).length, 'one detail link per indexed server');
  assert.ok(serverLinks > 10000, `catalog collapsed to ${serverLinks} (expected ~16k) — snapshot shrank?`);

  const bytes = Buffer.byteLength(body, 'utf8');
  const TEN_MB = 10 * 1024 * 1024;
  const HUNDRED_KB = 100 * 1024;
  // Lower bound: a regression that guts the doc fails here.
  assert.ok(bytes > HUNDRED_KB, `llms-full.txt implausibly small (${bytes} bytes)`);
  // Upper bound (deferred-decision tripwire): if the catalog dump ever crosses this, the file
  // has grown past one-shot ingestibility for most consumers — revisit slimming it THEN.
  assert.ok(
    bytes < TEN_MB,
    `llms-full.txt is ${(bytes / 1024 / 1024).toFixed(1)}MB (>10MB tripwire) — revisit slimming the 16k catalog dump vs. pointing at sitemap/API`,
  );
});

test('/llms-full.txt: X-Snapshot-Version equals the current snapshot version', async () => {
  const res = await llmsFull();
  // Assert the VALUE, not mere presence: a refactor setting a constant or the wrong source would
  // pass a non-empty check but fail this. (Process _cache is frozen, so meta.version is stable here.)
  const expected = (await loadSnapshotMeta()).version;
  assert.equal(res.headers.get('x-snapshot-version'), expected);
});

// llms.txt is a third copy of the source-liveness census figures, alongside the page
// body and the page metadata. The census test in lib/sourceLiveness.test.ts guards the
// constant against data/source-liveness.json, but nothing guarded that this surface
// actually uses the constant - and answer engines read this file. Pre-debounce figures
// sat in production for four days precisely because each copy was hand-maintained.
test('/llms.txt: every source-liveness figure, including the derived ones, is present',
  async () => {
    const body = await bodyOf(await llms());
    for (const key of ['reposUnreachable', 'reposTotal', 'serversAffected', 'sweepDate',
                       'pctUnreachable', 'ratioPhrase'] as const) {
      assert.ok(
        body.includes(SOURCE_LIVENESS_CENSUS[key]),
        `llms.txt must carry SOURCE_LIVENESS_CENSUS.${key} (${SOURCE_LIVENESS_CENSUS[key]})`,
      );
    }
    // The superseded pre-debounce numbers must never reappear on this surface.
    for (const stale of ['1,834', '2,073']) {
      assert.ok(!body.includes(stale), `llms.txt still contains superseded figure ${stale}`);
    }
  });
