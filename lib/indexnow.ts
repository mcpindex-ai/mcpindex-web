/**
 * IndexNow (Bing + participating engines) — ownership key + URL ping helper.
 *
 * Why: sitemap discovery is slow; IndexNow notifies engines when URLs change.
 * Does NOT notify Google. Key file lives at public/<key>.txt (protocol Option 1).
 * Fail-open: callers decide whether a failed ping blocks their workflow (CLI exits
 * non-zero; library returns a result object and never throws on HTTP errors).
 */

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_HOST = 'mcpindex.ai';
export const INDEXNOW_SITE = `https://${INDEXNOW_HOST}`;

/** Committed key — must match public/<key>.txt body and filename. */
export const INDEXNOW_KEY = '4ff51017917f4e06bc5f09db2bd4efc2';

const KEY_RE = /^[a-zA-Z0-9-]{8,128}$/;

/**
 * High-intent URLs worth an IndexNow ping on ship. Keep small — every crawl
 * counts against Bing quota; do not dump the full sitemap here.
 */
export const INDEXNOW_PRIORITY_URLS: readonly string[] = [
  `${INDEXNOW_SITE}/`,
  `${INDEXNOW_SITE}/install`,
  `${INDEXNOW_SITE}/trust`,
  `${INDEXNOW_SITE}/docs`,
  `${INDEXNOW_SITE}/leaderboard`,
  `${INDEXNOW_SITE}/changelog`,
  `${INDEXNOW_SITE}/search`,
  `${INDEXNOW_SITE}/demo`,
  `${INDEXNOW_SITE}/screen`,
  `${INDEXNOW_SITE}/scan`,
  `${INDEXNOW_SITE}/ledger`,
  `${INDEXNOW_SITE}/guides/mcp-silent-contract-drift`,
  `${INDEXNOW_SITE}/guides/mcp-tool-trust-vs-authentication`,
  `${INDEXNOW_SITE}/guides/is-it-safe-to-let-an-ai-agent-call-an-mcp-tool`,
  `${INDEXNOW_SITE}/guides/how-to-trust-an-mcp-server`,
  `${INDEXNOW_SITE}/guides/audit-your-mcp-json-what-your-agent-can-do`,
];

export type IndexNowPayload = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

export type IndexNowResult = {
  ok: boolean;
  status: number;
  dryRun: boolean;
  submitted: number;
  body: string;
};

export function assertIndexNowKey(key: string): string {
  const trimmed = key.trim();
  if (!KEY_RE.test(trimmed)) {
    throw new Error(
      `INDEXNOW_KEY must be 8–128 chars of [a-zA-Z0-9-]; got length ${trimmed.length}`,
    );
  }
  return trimmed;
}

export function keyLocationFor(key: string, host = INDEXNOW_HOST): string {
  return `https://${host}/${assertIndexNowKey(key)}.txt`;
}

/** Normalize + dedupe; reject URLs that are not on the IndexNow host. */
export function filterIndexNowUrls(
  urls: readonly string[],
  host = INDEXNOW_HOST,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const u = raw.trim();
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      continue;
    }
    // Hostname equality — not startsWith — so mcpindex.ai.evil.com / userinfo bypasses fail.
    if (parsed.protocol !== 'https:' || parsed.hostname !== host) continue;
    const normalized = parsed.href;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function buildIndexNowPayload(
  urls: readonly string[],
  opts?: { key?: string; host?: string },
): IndexNowPayload {
  const key = assertIndexNowKey(opts?.key ?? INDEXNOW_KEY);
  const host = opts?.host ?? INDEXNOW_HOST;
  const urlList = filterIndexNowUrls(urls, host);
  if (urlList.length === 0) {
    throw new Error('IndexNow urlList is empty after host filter');
  }
  if (urlList.length > 10_000) {
    throw new Error('IndexNow allows at most 10,000 URLs per POST');
  }
  return {
    host,
    key,
    keyLocation: keyLocationFor(key, host),
    urlList,
  };
}

export async function submitIndexNow(
  urls: readonly string[],
  opts?: {
    key?: string;
    host?: string;
    dryRun?: boolean;
    fetchImpl?: typeof fetch;
  },
): Promise<IndexNowResult> {
  const payload = buildIndexNowPayload(urls, opts);
  if (opts?.dryRun) {
    return {
      ok: true,
      status: 0,
      dryRun: true,
      submitted: payload.urlList.length,
      body: JSON.stringify(payload, null, 2),
    };
  }
  const fetchImpl = opts?.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    // 200 = accepted; 202 = accepted, key validation pending
    const ok = res.status === 200 || res.status === 202;
    return {
      ok,
      status: res.status,
      dryRun: false,
      submitted: payload.urlList.length,
      body,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      dryRun: false,
      submitted: payload.urlList.length,
      body: message,
    };
  }
}
