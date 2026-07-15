import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeHref, safeMarkdownUrl } from './safeUrl';

test('isSafeHref accepts same-origin paths and http(s) URLs', () => {
  for (const ok of ['/', '/ledger', '/docs#install', '/a/b?q=1', 'https://mcpindex.ai/x', 'http://x.dev']) {
    assert.equal(isSafeHref(ok), true, `${JSON.stringify(ok)} should be safe`);
  }
});

test('isSafeHref rejects protocol-relative, backslash, and non-http schemes', () => {
  for (const bad of ['//evil.com', '/\\evil.com', '/\\/evil.com', 'javascript:alert(1)', 'data:text/html,x', 'mailto:x@y.z', '#frag', 'ftp://x']) {
    assert.equal(isSafeHref(bad), false, `${JSON.stringify(bad)} should be rejected`);
  }
});

test('isSafeHref rejects control-char-obfuscated protocol-relative (browsers strip TAB/LF/CR)', () => {
  for (const bad of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\tevil', 'https://x\t.evil']) {
    assert.equal(isSafeHref(bad), false, `${JSON.stringify(bad)} should be rejected`);
  }
});

test('safeMarkdownUrl keeps safe urls (+ #fragment, mailto:), drops the rest', () => {
  assert.equal(safeMarkdownUrl('/ledger'), '/ledger');
  assert.equal(safeMarkdownUrl('https://mcpindex.ai/x'), 'https://mcpindex.ai/x');
  assert.equal(safeMarkdownUrl('#step-2'), '#step-2');
  assert.equal(safeMarkdownUrl('mailto:hello@mcpindex.ai'), 'mailto:hello@mcpindex.ai');
  // dropped -> '' so react-markdown renders no href
  for (const bad of ['//evil.com', '/\t/evil.com', 'javascript:alert(1)', 'data:x', 'vbscript:x']) {
    assert.equal(safeMarkdownUrl(bad), '', `${JSON.stringify(bad)} should drop to ''`);
  }
});
