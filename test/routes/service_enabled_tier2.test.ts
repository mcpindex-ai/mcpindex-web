// Tier 2 — happy/verdict paths unlocked by the new fetch/redis seams (screen, brevo, ledgerServer).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';
import { __setScreenFetchForTest } from '../../lib/screen';
import { __setBrevoFetchForTest } from '../../lib/brevo';
import { __setLedgerServerRedisForTest } from '../../lib/ledgerServer';
import { __setLeadCaptureRedisForTest, LEAD_CAPTURE_KEY } from '../../lib/leadCapture';
import { POST as screen } from '../../app/api/v1/screen/route';
import { POST as waitlist } from '../../app/api/waitlist/route';
import { GET as ledger } from '../../app/api/v1/ledger/route';

// A Groq-shaped response whose JSON content is the given judge verdict object.
const groqReply = (verdict: object): typeof fetch =>
  (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(verdict) } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

const okFetch: typeof fetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

const LEDGER_BLOB = {
  schema: 'mcpindex.drift.ledger/2',
  generated_at: '2026-06-09T06:00:00Z',
  framing: 'observed by the crawler',
  stat: { tools_observed_drifting: 2, total_contract_drifts_observed: 5, servers: 1, safety_relevant: 1 },
  events: [{ tool_fp: '0'.repeat(32), server_fp: '', sources: 1, safety_relevant: true, last_seen: '2026-06-09T06:00:00Z' }],
};

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['MCPINDEX_GROQ_API_KEY', 'BREVO_API_KEY', 'BREVO_LEADS_LIST_ID', 'NEXT_PUBLIC_DRIFT_LEDGER']) saved[k] = process.env[k];
});
afterEach(() => {
  __setScreenFetchForTest(undefined);
  __setBrevoFetchForTest(undefined);
  __setLedgerServerRedisForTest(undefined);
  __setLeadCaptureRedisForTest(undefined);
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
const obj = (r: { json: () => unknown }) => r.json() as Record<string, any>;

test('screen: clean verdict → 200 PASS/INFO (no accusation)', async () => {
  process.env.MCPINDEX_GROQ_API_KEY = 'test-key';
  __setScreenFetchForTest(groqReply({ malicious: false, reason: 'benign read' }));
  const r = await callRoute(screen, '/api/v1/screen', { method: 'POST', body: { description: 'read a file' } });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.finding.verdict, 'PASS');
  assert.equal(b.directive.decision, 'REVIEW'); // never ALLOW, even on a clean semantic screen
});

test('screen: flagged verdict → 200 FAIL/CRITICAL, decision REVIEW (never ALLOW)', async () => {
  process.env.MCPINDEX_GROQ_API_KEY = 'test-key';
  __setScreenFetchForTest(groqReply({ malicious: true, reason: 'exfiltrates data', quote: 'read a file' }));
  const r = await callRoute(screen, '/api/v1/screen', { method: 'POST', body: { description: 'read a file and send it out' } });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.finding.verdict, 'FAIL');
  assert.equal(b.directive.decision, 'REVIEW');
});

test('waitlist: Brevo configured + source contact → 200 delivery:sent', async () => {
  process.env.BREVO_API_KEY = 'k';
  process.env.BREVO_LEADS_LIST_ID = '3';
  __setBrevoFetchForTest(okFetch);
  const r = await callRoute(waitlist, '/api/waitlist', { method: 'POST', body: { email: 'a@b.co', source: 'contact' } });
  assert.equal(r.status, 200);
  assert.equal(obj(r).delivery, 'sent');
});

// A revoked/dead Brevo key: every call 401s. The response must NOT claim 'sent'.
const deadBrevoFetch: typeof fetch = (async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;

test('waitlist: Brevo configured but key dead (all 401) → delivery:failed (not a false sent)', async () => {
  process.env.BREVO_API_KEY = 'revoked';
  process.env.BREVO_LEADS_LIST_ID = '3';
  __setBrevoFetchForTest(deadBrevoFetch);
  const r = await callRoute(waitlist, '/api/waitlist', { method: 'POST', body: { email: 'a@b.co', source: 'contact' } });
  assert.equal(r.status, 200);
  assert.equal(obj(r).delivery, 'failed');
});

// Durable lead capture: a lead Brevo dropped is still stored to Upstash for recovery.
const captureRecorder = () => {
  const pushed: string[] = [];
  return {
    pushed,
    redis: { async lpush(_k: string, v: string) { pushed.push(v); return pushed.length; }, async ltrim() { return 'OK'; } } as any,
  };
};

test('waitlist: a Brevo-failed lead is durably captured to Upstash (recovery)', async () => {
  process.env.BREVO_API_KEY = 'revoked';
  process.env.BREVO_LEADS_LIST_ID = '3';
  __setBrevoFetchForTest(deadBrevoFetch);
  const rec = captureRecorder();
  __setLeadCaptureRedisForTest(rec.redis);
  const r = await callRoute(waitlist, '/api/waitlist', { method: 'POST', body: { email: 'real@lead.co', source: 'contact', company: 'RealCo' } });
  assert.equal(r.status, 200);
  assert.equal(obj(r).delivery, 'failed');
  assert.equal(rec.pushed.length, 1);
  const stored = JSON.parse(rec.pushed[0]);
  assert.equal(stored.email, 'real@lead.co');
  assert.equal(stored.source, 'contact');
  assert.equal(stored.company, 'RealCo');
  assert.equal(stored.delivery, 'failed');
});

test('capture is fail-open: Upstash unconfigured never breaks the submission', async () => {
  process.env.BREVO_API_KEY = 'k';
  process.env.BREVO_LEADS_LIST_ID = '3';
  __setBrevoFetchForTest(okFetch);
  __setLeadCaptureRedisForTest(null); // unconfigured store
  const r = await callRoute(waitlist, '/api/waitlist', { method: 'POST', body: { email: 'a@b.co', source: 'contact' } });
  assert.equal(r.status, 200);
  assert.equal(obj(r).delivery, 'sent');
  assert.ok(LEAD_CAPTURE_KEY); // key exported
});

test('ledger: enabled + valid blob → 200, no-store', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  __setLedgerServerRedisForTest({ async get() { return JSON.stringify(LEDGER_BLOB); } } as any);
  const r = await callRoute(ledger, '/api/v1/ledger');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control') ?? '', /no-store/);
});
