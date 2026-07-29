// Cross-implementation conformance for the public slug rule.
//
// The root cause of the wrong-subject defect was two hand-written implementations of a
// multi-pass pipeline: `mergeAdmitted` -> `uniqueByName` -> `disambiguateSlugs` -> `seenSlug`
// here, reimplemented in mcpindex-trust `corpus_eval/tooling/slug_identity.py`. Four separate
// gaps between them were found in one review (identity keys, admitted-row validation,
// whitespace descriptions, and the final slug dedup), and each one keys a verdict where this
// site never looks or deletes one it is still serving.
//
// `lib/slugConformance.json` is TWINNED with `mcpindex-trust/corpus_eval/tooling/
// slug_conformance.json` and carries the expected `name -> slug` map for every case the
// review panel found. Both suites assert their own implementation reproduces it, so a change
// to either side that is not mirrored in the other reddens a build here or there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { disambiguateSlugs, mergeAdmitted, slugify } from './registry';
import type { IndexedServer, ServerSource } from './types';

type Case = {
  id: string;
  registry: string[];
  admitted: string[];
  expected: Record<string, string>;
};

const corpus = JSON.parse(
  readFileSync(new URL('./slugConformance.json', import.meta.url), 'utf8'),
) as { cases: Case[] };

function srv(name: string, source: ServerSource): IndexedServer {
  return {
    source, slug: slugify(name), baseSlug: slugify(name), name, title: name,
    description: 'd', version: '1.0.0',
    category: 'other', publishedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    status: 'active', hasRemote: false, hasPackage: false, primaryTransport: null, envVars: [],
  };
}

/** `loadServers`' slug pipeline, minus the I/O. Must stay in step with it. */
function assign(c: Case): Record<string, string> {
  const merged = mergeAdmitted(
    c.registry.map((n) => srv(n, 'registry')),
    c.admitted.map((n) => srv(n, 'admitted')),
  );
  const seenName = new Set<string>();
  const uniq = merged.filter((s) => (seenName.has(s.name) ? false : (seenName.add(s.name), true)));
  const out: Record<string, string> = {};
  for (const s of disambiguateSlugs(uniq)) out[s.name] = s.slug;
  return out;
}

test('the corpus is not empty and covers the attack (guards against a truncated file)', () => {
  assert.ok(corpus.cases.length >= 14, `expected >=14 cases, got ${corpus.cases.length}`);
  assert.ok(
    corpus.cases.some((c) => c.id.includes('hash-targeting')),
    'the hash-targeting attack case must be present - it is the reason this file exists',
  );
});

for (const c of corpus.cases) {
  test(`slug conformance: ${c.id}`, () => {
    assert.deepEqual(
      assign(c),
      c.expected,
      'this side diverged from the twinned corpus; regenerate BOTH copies or fix the rule',
    );
  });
}

test('every corpus case is injective and carries at most one suffix', () => {
  // Restated here rather than trusted from the generator: the corpus is data, and data can
  // be edited. These two properties are the whole contract.
  for (const c of corpus.cases) {
    const slugs = Object.values(c.expected);
    assert.equal(new Set(slugs).size, slugs.length, `case '${c.id}' shares a slug`);
    for (const s of slugs) {
      assert.ok(s.split('--').length <= 2, `case '${c.id}' has a second suffix: ${s}`);
    }
  }
});
