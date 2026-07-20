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
