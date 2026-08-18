// Tripwire suite for the /unregistered pages.
//
// The pages' headline claim is "no vendor-published registry entry exists".
// These tests derive that claim from the real corpus on every run, so the day
// a vendor registers, CI fails HERE with instructions instead of the site
// stating something false.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  UNREGISTERED,
  communityServersFor,
  getUnregistered,
  namespaceOfServer,
} from './unregistered';
import type { IndexedServer } from './types';

function loadCorpus(): IndexedServer[] {
  const p = path.join(process.cwd(), 'data', 'server-index.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).servers as IndexedServer[];
}

test('entries are unique and well-formed', () => {
  const slugs = new Set(UNREGISTERED.map((e) => e.slug));
  assert.equal(slugs.size, UNREGISTERED.length);
  for (const e of UNREGISTERED) {
    assert.match(e.slug, /^[a-z0-9-]+$/, e.slug);
    assert.equal(e.token, e.token.toLowerCase(), e.slug);
    assert.ok(e.officialNamespaces.length > 0, e.slug);
    for (const ns of e.officialNamespaces) {
      assert.equal(ns, ns.toLowerCase(), `${e.slug}: ${ns}`);
    }
  }
  assert.equal(getUnregistered('canva')?.name, 'Canva');
});

test('TRIPWIRE: no vendor-owned namespace exists in the corpus for any entry', () => {
  const namespaces = new Set(loadCorpus().map((s) => namespaceOfServer(s.name)));
  const registered: string[] = [];
  for (const e of UNREGISTERED) {
    for (const ns of e.officialNamespaces) {
      if (namespaces.has(ns)) registered.push(`${e.slug}: ${ns}`);
    }
  }
  assert.deepEqual(
    registered,
    [],
    'A vendor registered. Delete its entry from lib/unregistered.ts - its ' +
      '/unregistered page now states something false; the normal /server page ' +
      'takes over.',
  );
});

test('community matcher is token-strict: canva never surfaces canvas servers', () => {
  const corpus = loadCorpus();
  const canva = getUnregistered('canva');
  assert.ok(canva);
  for (const s of communityServersFor(corpus, canva)) {
    assert.ok(
      !/canvas/i.test(s.name),
      `canvas false friend leaked into the canva page: ${s.name}`,
    );
  }
  // And the strictness must not cost real matches: "slack" has community servers.
  const slack = getUnregistered('slack');
  assert.ok(slack);
  assert.ok(communityServersFor(corpus, slack).length > 0);
});
