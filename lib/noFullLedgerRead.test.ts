// The full `drift:ledger` blob is retired: the drain no longer publishes it, and a reader that
// still asked for it would see null and quietly render "not published" forever. This fails the
// build if any source file names the bare key again. The split keys (drift:ledger:summary,
// drift:ledger:servers) and the /4 keys (drift:ledger:v4:...) all continue past the colon, so
// they do not match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const DIRS = ['app', 'lib', 'components', 'scripts'];
const EXT = /\.(ts|tsx|mts|mjs|js)$/;
// The bare key as a string literal, in any quote style. Comment lines are skipped: prose about
// the retired key quotes it in backticks.
const BARE_KEY = /(['"`])drift:ledger\1/;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (EXT.test(name) && !name.endsWith('.test.ts')) yield p;
  }
}

test('no source file reads the retired drift:ledger key', () => {
  const hits: string[] = [];
  let scanned = 0;
  for (const d of DIRS) {
    for (const f of files(path.join(ROOT, d))) {
      scanned++;
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!COMMENT.test(line) && BARE_KEY.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`);
        });
    }
  }
  assert.ok(scanned > 50, `scanned only ${scanned} files; the walk is broken`);
  assert.deepEqual(hits, []);
});

test('the pattern catches the bare key and nothing else', () => {
  assert.ok(BARE_KEY.test(`r.get('drift:ledger')`));
  assert.ok(BARE_KEY.test('const K = "drift:ledger";'));
  assert.ok(!BARE_KEY.test(`'drift:ledger:summary'`));
  assert.ok(!BARE_KEY.test('`drift:ledger:v4:${gen}`'));
  assert.ok(COMMENT.test("  // the retired `drift:ledger` blob"));
  assert.ok(!COMMENT.test("  r.get('drift:ledger'); // not a comment line"));
});
