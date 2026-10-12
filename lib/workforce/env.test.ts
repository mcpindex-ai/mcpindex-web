import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { assertLocalOnly, refusedEnv, REFUSED_ENV } from './env';
import { rule0Hits } from './rule0';

test('env refusal: each cloud credential refuses the run, even when empty; names only in the message', () => {
  for (const k of REFUSED_ENV) {
    assert.deepEqual(refusedEnv({ PATH: '/bin', [k]: '' }), [k]);
    assert.throws(() => assertLocalOnly({ [k]: 'sk-secret-value' }, 'http://127.0.0.1:11434/v1'), (e: Error) => e.message.includes(k) && !e.message.includes('sk-secret'));
  }
  assert.deepEqual(refusedEnv({ PATH: '/bin', HOME: '/x' }), []);
});

test('env refusal: the model endpoint must be loopback', () => {
  assert.doesNotThrow(() => assertLocalOnly({}, 'http://127.0.0.1:11434/v1'));
  assert.doesNotThrow(() => assertLocalOnly({}, 'http://localhost:11434/v1'));
  assert.throws(() => assertLocalOnly({}, 'http://mini32.local:11434/v1'), /loopback/);
  assert.throws(() => assertLocalOnly({}, 'https://api.openai.com/v1'), /loopback/);
});

test('env refusal: weekly.sh refuses before any work when a credential is set', () => {
  const clean = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/tmp' } as unknown as NodeJS.ProcessEnv;
  const r = spawnSync('/bin/zsh', ['scripts/workforce/weekly.sh', '--check-env'], { env: { ...clean, GROQ_API_KEY: 'gsk-do-not-print' } as NodeJS.ProcessEnv, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /GROQ_API_KEY/);
  assert.doesNotMatch(r.stderr + r.stdout, /gsk-do-not-print/);
  assert.match(execFileSync('/bin/zsh', ['scripts/workforce/weekly.sh', '--check-env'], { env: clean, encoding: 'utf8' }), /env ok/);
});

test('rule 0 mechanical: non-ASCII and banned vocabulary are caught, plain prose passes', () => {
  assert.deepEqual(rule0Hits('The share fell to a third of eligible servers.'), []);
  assert.deepEqual(rule0Hits('rose \u2014 sharply').map((h) => h.match), ['U+2014']);
  assert.deepEqual(rule0Hits('This underscores a pivotal shift.').map((h) => h.match).sort(), ['pivotal', 'underscore', 'underscores']);
  assert.deepEqual(rule0Hits('Moreover, it rose.').map((h) => h.kind), ['phrase']);
});
