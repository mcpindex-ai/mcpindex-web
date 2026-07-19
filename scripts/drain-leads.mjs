#!/usr/bin/env node
// Recover captured leads from the Upstash `lead:capture` list (see lib/leadCapture.ts).
//
// Requires the Upstash REST creds in the environment (same vars the app uses):
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (or KV_REST_API_URL/KV_REST_API_TOKEN)
//
// Usage:
//   node scripts/drain-leads.mjs                 # print ALL captured leads as JSON
//   node scripts/drain-leads.mjs --undelivered   # only leads Brevo did NOT take (delivery != sent)
//   node scripts/drain-leads.mjs --csv           # CSV to stdout
//   node scripts/drain-leads.mjs --undelivered --csv > undelivered.csv
//
// This only READS. It never deletes — after you replay the undelivered leads into Brevo,
// clear them yourself in the Upstash console (`LTRIM lead:capture <n> -1`) or leave them.

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('ERROR: set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_*).');
  process.exit(1);
}

const undeliveredOnly = process.argv.includes('--undelivered');
const asCsv = process.argv.includes('--csv');

// LRANGE lead:capture 0 -1 via the Upstash REST API.
const res = await fetch(`${url}/lrange/lead:capture/0/-1`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`ERROR: Upstash LRANGE failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const { result } = await res.json();

// @upstash/redis auto-deserializes JSON, but the raw REST API returns strings; normalize both.
const leads = (result ?? [])
  .map((r) => (typeof r === 'string' ? safeParse(r) : r))
  .filter(Boolean)
  .filter((l) => (undeliveredOnly ? l.delivery !== 'sent' : true));

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

if (asCsv) {
  const cols = ['ts', 'source', 'tier', 'delivery', 'email', 'company', 'message'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  console.log(cols.join(','));
  for (const l of leads) console.log(cols.map((c) => esc(l[c])).join(','));
} else {
  console.log(JSON.stringify(leads, null, 2));
}
console.error(
  `\n${leads.length} lead(s)${undeliveredOnly ? ' needing replay (delivery != sent)' : ' total'} in lead:capture.`,
);
