import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  DEFAULT_SITE_ORIGIN,
  SITE_ORIGIN_ENV,
  WEB_LOGIN_MESSAGE_TYPE,
  siteOrigin,
} from './webLoginContract';

test('the postMessage message type is the stable shared constant', () => {
  assert.equal(WEB_LOGIN_MESSAGE_TYPE, 'mcpindex-api-key');
});

test('siteOrigin defaults to the prod origin when the env is unset/empty', () => {
  assert.equal(siteOrigin({}), DEFAULT_SITE_ORIGIN);
  assert.equal(siteOrigin({ [SITE_ORIGIN_ENV]: '' }), DEFAULT_SITE_ORIGIN);
  assert.equal(siteOrigin({ [SITE_ORIGIN_ENV]: '   ' }), DEFAULT_SITE_ORIGIN);
});

test('siteOrigin honors a valid https origin (prod or preview)', () => {
  assert.equal(siteOrigin({ [SITE_ORIGIN_ENV]: 'https://mcpindex.ai' }), 'https://mcpindex.ai');
  assert.equal(
    siteOrigin({ [SITE_ORIGIN_ENV]: 'https://mcpindex-web-git-preview.vercel.app' }),
    'https://mcpindex-web-git-preview.vercel.app',
  );
  assert.equal(siteOrigin({ [SITE_ORIGIN_ENV]: 'https://localhost:3000' }), 'https://localhost:3000');
});

test('siteOrigin NEVER yields a wildcard or a malformed value (fails to the strict default)', () => {
  // The targetOrigin is a security control: a bad env must never downgrade it to '*' or garbage.
  for (const bad of ['*', 'http://mcpindex.ai', 'https://mcpindex.ai/path', 'https://a b', 'not-an-origin', 'https://*']) {
    assert.equal(siteOrigin({ [SITE_ORIGIN_ENV]: bad }), DEFAULT_SITE_ORIGIN, `must reject: ${bad}`);
  }
});

test('production misconfig tripwire logs on a wrong-but-VALID origin, never changes the return value', () => {
  const originalError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  try {
    // A syntactically valid origin that is NOT the canonical prod host, in a production env:
    // must log AND still resolve to the (wrong) value verbatim — the tripwire never overrides it.
    const wrong = siteOrigin({ VERCEL_ENV: 'production', [SITE_ORIGIN_ENV]: 'https://staging.mcpindex.ai' });
    assert.equal(wrong, 'https://staging.mcpindex.ai');
    assert.equal(calls.length, 1, 'must log exactly once on a production canonical-host mismatch');
    assert.match(String(calls[0][0]), /MCPINDEX_SITE_ORIGIN misconfig/);
  } finally {
    console.error = originalError;
  }
});

test('production misconfig tripwire stays silent on the canonical origin or outside production', () => {
  const originalError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  try {
    siteOrigin({ VERCEL_ENV: 'production', [SITE_ORIGIN_ENV]: 'https://mcpindex.ai' });
    siteOrigin({ VERCEL_ENV: 'production', [SITE_ORIGIN_ENV]: 'https://www.mcpindex.ai' });
    siteOrigin({ VERCEL_ENV: 'production' }); // unset -> resolves to the default, also canonical
    siteOrigin({ [SITE_ORIGIN_ENV]: 'https://staging.mcpindex.ai' }); // no VERCEL_ENV -> not production
    siteOrigin({ VERCEL_ENV: 'preview', [SITE_ORIGIN_ENV]: 'https://mcpindex-web-git-x.vercel.app' });
    assert.equal(calls.length, 0, 'must never log outside a genuine production canonical-host mismatch');
  } finally {
    console.error = originalError;
  }
});
