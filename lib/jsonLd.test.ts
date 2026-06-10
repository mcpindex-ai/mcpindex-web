import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonLdSafe } from './jsonLd';

test('jsonLdSafe neutralizes a </script> breakout payload but round-trips the value', () => {
  const payload = { name: '</script><script>alert(1)</script>', amp: 'a & b' };
  const out = jsonLdSafe(payload);
  assert.equal(out.includes('</script>'), false);
  assert.equal(out.includes('<'), false);
  assert.equal(out.includes('>'), false);
  assert.equal(out.includes('&'), false);
  assert.match(out, /\\u003cscript\\u003e/); // payload still present, but neutralized as escaped text
  assert.deepEqual(JSON.parse(out), payload); // valid JSON, exact round-trip to the original
});

test('jsonLdSafe escapes the U+2028/U+2029 separators (no invisible literals in source)', () => {
  const sep = String.fromCharCode(0x2028) + String.fromCharCode(0x2029);
  const out = jsonLdSafe({ s: 'a' + sep + 'b' });
  assert.equal(out.includes(String.fromCharCode(0x2028)), false);
  assert.equal(out.includes(String.fromCharCode(0x2029)), false);
  assert.ok(out.includes('\\u2028') && out.includes('\\u2029'));
  assert.equal(JSON.parse(out).s, 'a' + sep + 'b');
});
