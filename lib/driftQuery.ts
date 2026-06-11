// Fleet drift-query lookup (M3, read side). Answers "has mcpindex observed this tool's contract
// drift?" from the Upstash cache the mini32 drain maintains (two disjoint planes):
//   - SET  `drift:corroborated`              -- tool_fps the central CRAWL observed drifting
//   - HASH `drift:corr:meta:<fp>`            -- crawl meta { sources, safety_relevant, ... }
//   - SET  `drift:corroborated:installs`     -- tool_fps reputable installs corroborated (dark
//                                               surface; fps absent from the crawl set by construction)
//   - HASH `drift:corr:meta:installs:<fp>`   -- installs meta { sources, safety_relevant, ... }
//
// READ-ONLY + fail-OPEN: a Redis miss/error returns `drifted: null` ("unknown"), NEVER a
// false `drifted: false` ("clean"). Absence from BOTH sets is a real `false` = "not observed
// drifting" (NOT a verified all-clear). The SDK treats only `drifted: true` as an advisory
// (AD-6-safe: it never moves PROCEED/HOLD). No tool data here -- a tool_fp is the same salted
// fingerprint the SDK already emits under opt-in telemetry.

import { Redis } from '@upstash/redis';
import { coerceChangeKinds } from './changeKinds';

export const FP_RE = /^[0-9a-f]{32}$/;
export const MAX_FPS = 256; // batch cap

export type DriftAny =
  | {
      drifted: true;
      provenance: 'crawl' | 'installs';
      sources: number;
      safety_relevant: boolean;
      last_seen: string | null;
      change_kinds: readonly string[]; // what changed; [] when meta is missing/old
    }
  | { drifted: false }
  | { drifted: null }; // unknown (cache unavailable) -- fail-open

let _redis: Redis | null | undefined;

/** @internal test seam: inject Redis (or null); pass undefined to reset lazy init. */
export function __setDriftQueryRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  _redis = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
  return _redis;
}

function metaToDriftedTrue(
  meta: Record<string, unknown> | null,
  provenance: 'crawl' | 'installs',
): Extract<DriftAny, { drifted: true }> {
  if (!meta) {
    return {
      drifted: true,
      provenance,
      sources: 1,
      safety_relevant: false,
      last_seen: null,
      change_kinds: [],
    };
  }
  const sources = Number(meta.sources);
  return {
    drifted: true,
    provenance,
    sources: Number.isFinite(sources) && sources >= 1 ? sources : 1,
    safety_relevant: meta.safety_relevant === '1' || meta.safety_relevant === 1 || meta.safety_relevant === true,
    last_seen: typeof meta.last_seen === 'string' ? meta.last_seen : null,
    change_kinds: coerceChangeKinds(meta.change_kinds),
  };
}

export function metaToResult(meta: Record<string, unknown> | null): DriftAny {
  // SET membership means the central crawl saw this tool's contract drift (the unforgeable
  // first-party observer). The meta hash is decorative detail. A hit with missing/expired meta
  // still reports drifted:true with the honest floor sources:1 (the crawl observation itself).
  return metaToDriftedTrue(meta, 'crawl');
}

export function metaToResultInstalls(meta: Record<string, unknown> | null): DriftAny {
  // Installs-plane hit: reputable installs corroborated drift on a dark-surface fp the crawl
  // cannot see. Missing meta still reports drifted:true with honest floor sources:1.
  return metaToDriftedTrue(meta, 'installs');
}

/** Look up one or more tool_fps. Fail-open: on no cache, every fp resolves to `{drifted:null}`.
 * Caller is responsible for validating fp shape (FP_RE) before calling. */
export async function lookupCorroborated(fps: string[]): Promise<Record<string, DriftAny>> {
  const out: Record<string, DriftAny> = {};
  const r = redis();
  if (!r) {
    for (const fp of fps) out[fp] = { drifted: null };
    return out;
  }
  try {
    // Crawl plane first (the unforgeable observer); installs only for non-crawl members.
    const members = await Promise.all(fps.map((fp) => r.sismember('drift:corroborated', fp)));
    const crawlHits: string[] = [];
    const nonCrawl: string[] = [];
    fps.forEach((fp, i) => {
      if (members[i] === 1) crawlHits.push(fp);
      else nonCrawl.push(fp);
    });
    if (crawlHits.length) {
      const metas = await Promise.all(
        crawlHits.map((fp) => r.hgetall<Record<string, unknown>>(`drift:corr:meta:${fp}`)),
      );
      crawlHits.forEach((fp, i) => {
        out[fp] = metaToResult(metas[i]);
      });
    }
    if (nonCrawl.length) {
      const installMembers = await Promise.all(
        nonCrawl.map((fp) => r.sismember('drift:corroborated:installs', fp)),
      );
      const installHits: string[] = [];
      nonCrawl.forEach((fp, i) => {
        if (installMembers[i] === 1) installHits.push(fp);
        else out[fp] = { drifted: false };
      });
      if (installHits.length) {
        const installMetas = await Promise.all(
          installHits.map((fp) => r.hgetall<Record<string, unknown>>(`drift:corr:meta:installs:${fp}`)),
        );
        installHits.forEach((fp, i) => {
          out[fp] = metaToResultInstalls(installMetas[i]);
        });
      }
    }
    return out;
  } catch {
    // fail-open: a Redis hiccup is "unknown", never a false clean
    for (const fp of fps) out[fp] = { drifted: null };
    return out;
  }
}
