#!/usr/bin/env node
// Remove drift install identities from Upstash (see lib/driftIdentity.ts for the schema).
// Per identity it deletes:  drift:identity:<id> (hash) + SREM drift:identities <id>
// and, defensively, oauth:gh:<github_hash> if that identity ever linked GitHub.
//
// Requires the Upstash REST creds in the environment (same vars the app uses):
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (or KV_REST_API_URL / KV_REST_API_TOKEN)
//
// Usage:
//   node scripts/remove-drift-identity.mjs                       # DRY-RUN on the 2 known test ids
//   node scripts/remove-drift-identity.mjs --apply               # actually delete the 2 test ids
//   node scripts/remove-drift-identity.mjs --apply <id> [<id>…]  # delete specific install_ids
//
// Safe to re-run (idempotent). Dry-run is the default so nothing is deleted by accident.

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('ERROR: set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_*).');
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TARGETS = ids.length
  ? ids
  : ['00000000000000000000000000000000', '6392e14fd7793adfa2abc8e47038fcc5']; // the 2 audit test ids

const INSTALL_ID = /^[0-9a-f]{32}$/;

// Upstash REST: single command per call -> POST [ "CMD", "arg", ... ] to the base URL.
async function cmd(...args) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Upstash ${args[0]} failed: ${res.status} ${await res.text()}`);
  return (await res.json()).result;
}

console.error(apply ? '=== APPLYING deletions ===' : '=== DRY-RUN (no --apply; nothing deleted) ===');
for (const id of TARGETS) {
  if (!INSTALL_ID.test(id)) {
    console.error(`  SKIP ${id}: not a 32-hex install_id`);
    continue;
  }
  const idKey = `drift:identity:${id}`;
  const exists = await cmd('EXISTS', idKey); // 1/0
  const inSet = await cmd('SISMEMBER', 'drift:identities', id); // 1/0
  const githubHash = await cmd('HGET', idKey, 'github_hash').catch(() => null); // '' or hash or null

  console.error(`\n  ${id}`);
  console.error(`    drift:identity key exists: ${exists} | in drift:identities set: ${inSet} | github_hash: ${githubHash ? 'set' : 'none'}`);

  if (!apply) {
    console.error('    would: DEL', idKey, '| SREM drift:identities', id, githubHash ? `| DEL oauth:gh:${githubHash}` : '');
    continue;
  }

  await cmd('DEL', idKey);
  await cmd('SREM', 'drift:identities', id);
  if (githubHash) await cmd('DEL', `oauth:gh:${githubHash}`);

  // verify
  const stillExists = await cmd('EXISTS', idKey);
  const stillInSet = await cmd('SISMEMBER', 'drift:identities', id);
  const ok = stillExists === 0 && stillInSet === 0;
  console.error(`    deleted. verify -> exists:${stillExists} inSet:${stillInSet}  ${ok ? '✓ GONE' : '✗ CHECK MANUALLY'}`);
}
console.error(`\nDone.${apply ? '' : ' Re-run with --apply to actually delete.'}`);
