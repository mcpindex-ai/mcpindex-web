// The v1 response CONTRACT for /api/v1/recommend.
//
// `note` was removed from this payload on 2026-07-28 in favour of a structured
// `provenance` block. That broke two things at once: mcp-server-mcpindex (our own
// published npm package) reads `data.note` at src/index.mjs and printed a bare "Source:"
// line for every already-installed copy, and /docs publishes "breaking changes ship behind
// /api/v2; v1 stays available for at least 6 months". A server-side field removal cannot
// be repaired by a client release, which is what makes it breaking rather than untidy.
//
// These pin BOTH halves: the field is present, and its value is DERIVED from
// provenance.basis rather than written a second time - the literal that used to live here
// claimed a 70/30 weighting for eight weeks after the composite changed to score + QS*0.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../app/api/v1/recommend/route';
import type { NextRequest } from 'next/server';

function req(task: string): NextRequest {
  return { nextUrl: new URL(`https://mcpindex.ai/api/v1/recommend?task=${encodeURIComponent(task)}`) } as NextRequest;
}

test('v1 still carries `note` (deprecated alias, not removed)', async () => {
  const body = await (await GET(req('read postgres'))).json();
  assert.equal(typeof body.note, 'string');
  assert.ok(body.note.length > 0, 'a bare "Source:" line is the failure this guards');
});

test('`note` is DERIVED from provenance.basis, so the two cannot drift', async () => {
  const body = await (await GET(req('read postgres'))).json();
  assert.equal(body.note, body.provenance.basis);
});

test('the ranker description no longer claims the retired 70/30 weighting', async () => {
  const body = await (await GET(req('read postgres'))).json();
  assert.doesNotMatch(body.note, /70%|30%/, 'the composite is score + QS*0.1');
  assert.match(body.provenance.basis, /not a safety verdict/i);
});

test('provenance carries the advisory floor and a docs pointer', async () => {
  const body = await (await GET(req('search files'))).json();
  for (const l of ['conformance_monitored_not_enforced', 'calibrated_false_v1', 'advisory_deployment']) {
    assert.ok(body.provenance.limits.includes(l), `missing floor token ${l}`);
  }
  assert.equal(body.provenance.source, 'mcpindex.ai');
  assert.match(body.provenance.docs, /^https:\/\/mcpindex\.ai\//);
});
