#!/usr/bin/env node
// One-off: build data/first-seen.json from every data/snapshot.json committed on a ref, then
// fold in the working-tree snapshot. Needs a full clone (the sync runner checks out depth 1 and
// only does the incremental merge in scripts/sync-registry.mjs).
//
//   node scripts/backfill-first-seen.mjs [ref]      # ref defaults to origin/main

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mergeFirstSeen, readFirstSeen, serializeFirstSeen } from './first-seen.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'data', 'first-seen.json');
const ref = process.argv[2] ?? 'origin/main';

const git = (args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 30, encoding: 'utf8' });

const shas = git(['log', '--format=%H', ref, '--', 'data/snapshot.json']).trim().split('\n').filter(Boolean);
const doc = await readFirstSeen(OUT);
let i = 0;
for (const sha of shas) {
  i++;
  let snap;
  try {
    snap = JSON.parse(git(['show', `${sha}:data/snapshot.json`]));
  } catch (e) {
    console.warn(`skip ${sha.slice(0, 7)}: ${e.message.split('\n')[0]}`);
    continue;
  }
  const added = mergeFirstSeen(doc, snap);
  if (i % 25 === 0 || added) {
    console.log(`${i}/${shas.length} ${sha.slice(0, 7)} ${snap.fetchedAt} +${added} names=${Object.keys(doc.servers).length}`);
  }
}
mergeFirstSeen(doc, JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'snapshot.json'), 'utf8')));
await fs.writeFile(OUT, serializeFirstSeen(doc));
console.log(`Wrote ${OUT}: ${Object.keys(doc.servers).length} names, observed_from ${doc.observed_from}, from ${shas.length} commits`);
