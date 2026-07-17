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
  assert.ok(body.includes('Total servers:'), 'llms-full.txt must state the catalog total');
  // Must enumerate real per-server detail links (not silently emptied).
  const serverLinks = body.match(/https:\/\/mcpindex\.ai\/server\//g)?.length ?? 0;
  assert.ok(serverLinks > 1000, `expected the full catalog enumerated, saw ${serverLinks} server links`);

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
