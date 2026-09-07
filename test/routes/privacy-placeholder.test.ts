import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The crawl-disclosure section on /privacy is the only page that tells a server operator
// what we take from them. It was added because nothing on the site said so. These assert
// the load-bearing sentences are still there, and that no editing placeholder ships.
test('privacy page ships no unfilled placeholder', () => {
  const src = readFileSync('app/privacy/page.tsx', 'utf8');
  for (const marker of ['TO BE FILLED', 'TODO', 'FIXME', 'XXX:']) {
    assert.equal(src.includes(marker), false, `app/privacy/page.tsx still carries ${marker}`);
  }
});

test('privacy page keeps the crawl disclosure', () => {
  const src = readFileSync('app/privacy/page.tsx', 'utf8');
  for (const phrase of [
    'If you operate a server we list',
    'key and not anonymity',
    'opt-out flag on this path today',
    'Delist policy',
  ]) {
    assert.ok(
      src.includes(phrase),
      `app/privacy/page.tsx lost the crawl-disclosure sentence: "${phrase}". It is the only ` +
        'surface that tells a server operator what is collected from them.',
    );
  }
});
