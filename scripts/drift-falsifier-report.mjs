#!/usr/bin/env node
// Drift-telemetry M1 falsifier report. Reads the opt-in / coverage counters from Upstash and
// prints the kill-criterion readout:
//
//     opt-in % = distinct emitting installs (trailing window) / total installs distributed
//
// The NUMERATOR is automated: a HyperLogLog union (PFCOUNT over the trailing daily
// `drift:installs:{day}` keys, which the ingest gives a 35-day TTL). The DENOMINATOR is NOT in
// drift telemetry — the SDK deliberately emits no per-run ping (that would break off-by-default
// zero-egress), so it cannot know how many installs exist. Pass the count of installs you
// distributed via --installs / env DRIFT_TOTAL_INSTALLS (npm/PyPI download stats or your
// design-partner roster). See tasks/todo-mcpindex-drift-flywheel.md "Falsifier measurement".
//
//   node scripts/drift-falsifier-report.mjs --installs 12 [--window-days 28]
//
// Env: UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_URL/TOKEN). READ-ONLY — writes no keys.

import { Redis } from '@upstash/redis';

const KILL_THRESHOLD = 0.3; // < 30% opt-in over the window => stop, do not build M2-M4

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function lastNDays(n, now) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // yyyy-mm-dd in UTC — must match the ingest's `now.toISOString().slice(0,10)` day key.
    out.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

const n = (v) => Number(v) || 0;

async function main() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error(
      'No Upstash creds (UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN). ' +
        'Run with the mcpindex-web project env loaded (e.g. `vercel env pull`).',
    );
    process.exit(2);
  }
  const r = new Redis({ url, token });

  const windowDays = Number(arg('window-days', '28'));
  const totalInstalls = Number(arg('installs', process.env.DRIFT_TOTAL_INSTALLS ?? 'NaN'));
  const dayKeys = lastNDays(windowDays, new Date()).map((d) => `drift:installs:${d}`);

  const [windowInstalls, allTimeInstalls, servers, total, pin, drift, safety] = await Promise.all([
    r.pfcount(...dayKeys), // distinct installs over the window (union of daily HLLs)
    r.pfcount('drift:installs'),
    r.pfcount('drift:servers'),
    r.get('drift:signals:total'),
    r.get('drift:event:pin'),
    r.get('drift:event:drift'),
    r.get('drift:safety_relevant'),
  ]);

  const num = n(windowInstalls);
  console.log('\n  mcpindex drift telemetry — M1 falsifier report');
  console.log('  ' + '-'.repeat(54));
  console.log(`  window:                       trailing ${windowDays} days (UTC)`);
  console.log(`  distinct emitting installs:   ${num}   (numerator — HLL union of daily keys)`);
  console.log(`  all-time emitting installs:   ${n(allTimeInstalls)}`);
  console.log(`  servers covered (distinct):   ${n(servers)}`);
  console.log(
    `  signals total:                ${n(total)}  ` +
      `(pin=${n(pin)}, drift=${n(drift)}, safety-relevant=${n(safety)})`,
  );
  console.log('  ' + '-'.repeat(54));

  if (!Number.isFinite(totalInstalls) || totalInstalls <= 0) {
    console.log('  opt-in %:   UNKNOWN — pass --installs N (total installs distributed).');
    console.log('              The denominator is NOT in drift telemetry (no per-run ping, by design).\n');
    return;
  }
  const rate = num / totalInstalls;
  const verdict =
    rate < KILL_THRESHOLD
      ? `KILL  (< ${KILL_THRESHOLD * 100}% — stop, do not build M2-M4)`
      : 'CONTINUE';
  console.log(`  total installs (denominator): ${totalInstalls}   (--installs, manually tracked)`);
  console.log(`  opt-in %:                     ${(rate * 100).toFixed(1)}%   =>  ${verdict}\n`);
}

main().catch((e) => {
  console.error('drift-falsifier-report failed:', e?.message ?? e);
  process.exit(1);
});
