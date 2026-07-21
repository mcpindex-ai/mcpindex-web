// Service-backed routes — the FAIL-CLOSED / GATED / ERROR branches that need ZERO backends.
// These are the trust-critical branches: no Groq → 503, no Brevo → fail-soft, flag off → 404,
// bad input → 4xx. Rate-limit fails OPEN with no Redis, so no 429 here (that's Tier 2 via a seam).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX, snapshotEnv } from './_harness';

import { POST as screen } from '../../app/api/v1/screen/route';
import { POST as waitlist } from '../../app/api/waitlist/route';
import { GET as healthBrevo } from '../../app/api/health/brevo/route';
import { GET as healthGroq } from '../../app/api/health/groq/route';
import { GET as cron } from '../../app/api/cron/sync-registry/route';
import { POST as driftRegister, DELETE as driftUnregister } from '../../app/api/v1/drift/register/route';
import { GET as oauthStart } from '../../app/api/v1/drift/oauth/start/route';
import { GET as oauthCallback } from '../../app/api/v1/drift/oauth/callback/route';
import { GET as ledger } from '../../app/api/v1/ledger/route';
import { GET as serverDrift } from '../../app/api/v1/server-drift/route';
import { GET as loginStart } from '../../app/api/auth/login/start/route';
import { GET as loginCallback } from '../../app/api/auth/login/callback/route';

let restore: () => void;
beforeEach(() => { restore = snapshotEnv(); }); // deletes all gate flags + Groq/Brevo keys below
afterEach(() => {
  restore();
  delete process.env.MCPINDEX_GROQ_API_KEY;
  delete process.env.MCPINDEX_GROQ_API_KEY_FALLBACK;
  delete process.env.BREVO_API_KEY;
});
const obj = (r: { json: () => unknown }) => r.json() as Record<string, any>;

// ---- B1 screen (no Groq key configured) ----
test('screen: wrong content-type → 415', async () => {
  const r = await callRoute(screen, '/api/v1/screen', { method: 'POST', raw: 'x', headers: { 'content-type': 'text/plain' } });
  assert.equal(r.status, 415);
});
test('screen: invalid JSON → 400', async () => {
  const r = await callRoute(screen, '/api/v1/screen', { method: 'POST', raw: '{bad', headers: { 'content-type': 'application/json' } });
  assert.equal(r.status, 400);
});
test('screen: empty description → 400', async () => {
  const r = await callRoute(screen, '/api/v1/screen', { method: 'POST', body: { description: '   ' } });
  assert.equal(r.status, 400);
});
test('screen: description > 8000 → 413', async () => {
  const r = await callRoute(screen, '/api/v1/screen', { method: 'POST', body: { description: 'a'.repeat(8001) } });
  assert.equal(r.status, 413);
});
test('screen: no Groq key → 503 UNAVAILABLE (fail-closed, advisory)', async () => {
  delete process.env.MCPINDEX_GROQ_API_KEY;
  delete process.env.MCPINDEX_GROQ_API_KEY_FALLBACK;
  const r = await callRoute(screen, '/api/v1/screen', { method: 'POST', body: { description: 'read a file' } });
  assert.equal(r.status, 503);
  const b = obj(r);
  assert.equal(b.status, 'UNAVAILABLE');
  assert.equal(b.advisory, true);
});

// ---- B10 waitlist (no Brevo → fail-soft) ----
test('waitlist: invalid email → 400', async () => {
  const r = await callRoute(waitlist, '/api/waitlist', { method: 'POST', body: { email: 'nope' } });
  assert.equal(r.status, 400);
});
test('waitlist: valid email, no Brevo → 200 logged (fail-soft)', async () => {
  const r = await callRoute(waitlist, '/api/waitlist', { method: 'POST', body: { email: 'a@b.co' } });
  assert.equal(r.status, 200);
  assert.equal(obj(r).delivery, 'logged');
});
test('waitlist: form POST → 303 redirect', async () => {
  const r = await callRoute(waitlist, '/api/waitlist', {
    method: 'POST', raw: 'email=a%40b.co', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  assert.equal(r.status, 303);
  assert.match(r.location ?? '', /joined=1/);
});
// ---- B12/B13 health (unconfigured) ----
test('health/brevo: unconfigured → 503', async () => {
  const r = await callRoute(healthBrevo, '/api/health/brevo');
  assert.equal(r.status, 503);
  assert.equal(obj(r).healthy, false);
});
test('health/groq: no keys → 503', async () => {
  delete process.env.MCPINDEX_GROQ_API_KEY;
  delete process.env.MCPINDEX_GROQ_API_KEY_FALLBACK;
  const r = await callRoute(healthGroq, '/api/health/groq');
  assert.equal(r.status, 503);
  assert.equal(obj(r).healthy, false);
});

// ---- B14 cron (auth) ----
test('cron: no CRON_SECRET / no bearer → 401', async () => {
  const r = await callRoute(cron, '/api/cron/sync-registry');
  assert.equal(r.status, 401);
});
test('cron: wrong bearer → 401', async () => {
  process.env.CRON_SECRET = 'right';
  const r = await callRoute(cron, '/api/cron/sync-registry', { headers: { authorization: 'Bearer wrong' } });
  assert.equal(r.status, 401);
});

// ---- flag-off 404s (gate flags deleted by snapshotEnv) ----
test('drift/register POST: flag off → 404', async () => {
  const r = await callRoute(driftRegister, '/api/v1/drift/register', { method: 'POST', body: { install_id: FIX.ID32_OK } });
  assert.equal(r.status, 404);
});
test('drift/register DELETE: flag off → 404', async () => {
  const r = await callRoute(driftUnregister, '/api/v1/drift/register', { method: 'DELETE', headers: { authorization: 'Bearer x' } });
  assert.equal(r.status, 404);
});
test('drift/oauth/start: flag off → 404', async () => {
  const r = await callRoute(oauthStart, '/api/v1/drift/oauth/start', { headers: { authorization: 'Bearer x' } });
  assert.equal(r.status, 404);
});
test('drift/oauth/callback: flag off → 404', async () => {
  const r = await callRoute(oauthCallback, '/api/v1/drift/oauth/callback', { query: { code: 'x', state: FIX.STATE64_OK } });
  assert.equal(r.status, 404);
});
test('drift/oauth/callback: flag on + missing code → 400 invalid_request', async () => {
  process.env.DRIFT_OAUTH_UPGRADE = '1';
  const r = await callRoute(oauthCallback, '/api/v1/drift/oauth/callback', { query: { state: FIX.STATE64_OK } });
  assert.equal(r.status, 400);
});
test('ledger: flag off → 404', async () => {
  const r = await callRoute(ledger, '/api/v1/ledger');
  assert.equal(r.status, 404);
});
test('ledger: flag on + no Redis → 503 (honest, never stale)', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const r = await callRoute(ledger, '/api/v1/ledger');
  assert.equal(r.status, 503);
});
test('server-drift: flag off → 404', async () => {
  const r = await callRoute(serverDrift, '/api/v1/server-drift', { query: { server: FIX.SCREENED } });
  assert.equal(r.status, 404);
});
test('server-drift: flag on + missing server → 400', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const r = await callRoute(serverDrift, '/api/v1/server-drift');
  assert.equal(r.status, 400);
});
test('login/start: flag off → 404', async () => {
  const r = await callRoute(loginStart, '/api/auth/login/start');
  assert.equal(r.status, 404);
});
test('login/callback: flag off → 404', async () => {
  const r = await callRoute(loginCallback, '/api/auth/login/callback', { query: { code: 'x', state: FIX.STATE64_OK } });
  assert.equal(r.status, 404);
});
