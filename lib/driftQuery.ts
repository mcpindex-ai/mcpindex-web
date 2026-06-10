// Fleet drift-query lookup (M3, read side). Answers "has mcpindex's CRAWLER observed this tool's
// contract drift?" from the Upstash cache the mini32 drain maintains:
//   - SET  `drift:corroborated`      -- tool_fps the central CRAWL observed drifting (the only
//                                       unforgeable, public-registry-only first-party observer;
//                                       forgeable install reports never enter this set)
//   - HASH `drift:corr:meta:<fp>`    -- { sources, safety_relevant, last_seen, server_fp } (all
//                                       CRAWL-derived; sources=1 today, crawl only)
//
// READ-ONLY + fail-OPEN: a Redis miss/error returns `drifted: null` ("unknown"), NEVER a
// false `drifted: false` ("clean"). Absence from the SET is a real `false` = "not observed
// drifting by the crawl" (NOT a verified all-clear; a private/un-crawled tool is never here).
// The SDK treats only `drifted: true` as an advisory
// (AD-6-safe: it never moves PROCEED/HOLD). No tool data here -- a tool_fp is the same salted
// fingerprint the SDK already emits under opt-in telemetry.

import { Redis } from '@upstash/redis';
import { coerceChangeKinds } from './changeKinds';

export const FP_RE = /^[0-9a-f]{32}$/;
export const MAX_FPS = 256; // batch cap

export type DriftAny =
  | {
      drifted: true;
      sources: number;
      safety_relevant: boolean;
      last_seen: string | null;
      change_kinds: readonly string[]; // what changed; [] when meta is missing/old
    }
  | { drifted: false }
  | { drifted: null }; // unknown (cache unavailable) -- fail-open

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  _redis = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
  return _redis;
}

export function metaToResult(meta: Record<string, unknown> | null): DriftAny {
  // SET membership means the central crawl saw this tool's contract drift (the unforgeable
  // first-party observer); `sources` = 1 (the crawl) + any corroborating installs. The meta hash
  // is decorative detail. A hit with missing/expired meta still reports drifted:true with the
  // honest floor sources:1 (the crawl observation itself) -- never a false clean, never inflated.
  if (!meta) return { drifted: true, sources: 1, safety_relevant: false, last_seen: null, change_kinds: [] };
  const sources = Number(meta.sources);
  return {
    drifted: true,
    sources: Number.isFinite(sources) && sources >= 1 ? sources : 1,
    safety_relevant: meta.safety_relevant === '1' || meta.safety_relevant === 1 || meta.safety_relevant === true,
    last_seen: typeof meta.last_seen === 'string' ? meta.last_seen : null,
    change_kinds: coerceChangeKinds(meta.change_kinds), // allowlist-validated; [] when absent/old
  };
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
    // Membership first (the cheap hot check); then detail only for the hits.
    const members = await Promise.all(fps.map((fp) => r.sismember('drift:corroborated', fp)));
    const hits: string[] = [];
    fps.forEach((fp, i) => {
      if (members[i] === 1) hits.push(fp);
      else out[fp] = { drifted: false };
    });
    if (hits.length) {
      const metas = await Promise.all(
        hits.map((fp) => r.hgetall<Record<string, unknown>>(`drift:corr:meta:${fp}`)),
      );
      hits.forEach((fp, i) => {
        out[fp] = metaToResult(metas[i]);
      });
    }
    return out;
  } catch {
    // fail-open: a Redis hiccup is "unknown", never a false clean
    for (const fp of fps) out[fp] = { drifted: null };
    return out;
  }
}
