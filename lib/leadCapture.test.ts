// maskEmail guards a PII leak into runtime logs: /api/waitlist logged the raw address on
// every accepted submission, and Vercel runtime logs are readable by anyone with project
// access or a configured log drain. Upstash (this module) and Brevo hold the plaintext; the
// log does not need to.
//
// The load-bearing property is the LAST test: no output may ever contain the local part.
// Everything above it is shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { maskEmail } from './leadCapture';

test('keeps the domain and drops the local part', () => {
  assert.equal(maskEmail('gautamgb@gmail.com'), 'g***@gmail.com');
  assert.equal(maskEmail('firstname.lastname@acmecorp.co.uk'), 'f***@acmecorp.co.uk');
});

test('local parts of 1-2 chars are masked ENTIRELY (an initial would be most of the address)', () => {
  assert.equal(maskEmail('a@b.com'), '***@b.com');
  assert.equal(maskEmail('ab@b.com'), '***@b.com');
  assert.equal(maskEmail('abc@b.com'), 'a***@b.com');
});

test('a plus-tag does not survive (it is user-identifying)', () => {
  assert.equal(maskEmail('someone+mcpindex-signup@gmail.com'), 's***@gmail.com');
});

test('non-address shapes are masked rather than passing through', () => {
  // No '@' at all, or '@' at position 0, means we cannot identify a domain - reveal nothing.
  for (const junk of ['', 'not-an-email', '@nolocal.com']) {
    assert.equal(maskEmail(junk), '***', `${junk} must reveal nothing`);
  }
  // A trailing '@' still has a local part to hide, and there is no domain to keep.
  assert.equal(maskEmail('trailing@'), 't***@');
});

test('the local part NEVER appears in the output', () => {
  const cases = [
    'gautamgb@gmail.com',
    'firstname.lastname@acmecorp.co.uk',
    'someone+tag@gmail.com',
    'a.very.long.local.part.indeed@example.org',
    'UPPER@Example.COM',
  ];
  for (const email of cases) {
    const local = email.slice(0, email.lastIndexOf('@'));
    const out = maskEmail(email);
    // The full local part must be gone. A single leading initial is the documented allowance.
    assert.ok(!out.includes(local), `${out} still contains the local part of ${email}`);
    assert.ok(out.includes('***'), `${out} is not masked`);
    if (local.length > 2) {
      assert.ok(out.startsWith(local[0]!), 'the one allowed character is the first initial');
      assert.ok(!out.includes(local.slice(1)), 'nothing past the initial may survive');
    }
  }
});
