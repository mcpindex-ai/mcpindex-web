#!/usr/bin/env npx tsx
/**
 * Submit URLs to IndexNow (Bing + partners).
 *
 * Setup (one-time):
 *   1. Key file is committed at public/<INDEXNOW_KEY>.txt (already in repo).
 *   2. Add + verify https://mcpindex.ai in Bing Webmaster Tools:
 *        https://www.bing.com/webmasters/
 *   3. After deploy, confirm key URL returns the key:
 *        curl -sS https://mcpindex.ai/<key>.txt
 *   4. Check receipts: Bing Webmaster → URL Submission → IndexNow
 *
 * IndexNow key ≠ Bing Settings → API Access key. Generate IndexNow keys at
 * https://www.bing.com/indexnow/getstarted or with `openssl rand -hex 16`.
 *
 * Usage:
 *   npm run indexnow:submit -- --dry-run
 *   npm run indexnow:submit
 *   npm run indexnow:submit -- https://mcpindex.ai/guides/new-slug
 *   INDEXNOW_KEY=override npm run indexnow:submit -- --dry-run
 *
 * Only ping URLs that actually changed. Default list is priority pages only.
 */

import {
  INDEXNOW_KEY,
  INDEXNOW_PRIORITY_URLS,
  submitIndexNow,
} from '../lib/indexnow';

function parseArgs(argv: string[]): { dryRun: boolean; urls: string[] } {
  const dryRun = argv.includes('--dry-run');
  const urls = argv.filter((a) => a.startsWith('https://'));
  return { dryRun, urls };
}

async function main(): Promise<void> {
  const { dryRun, urls } = parseArgs(process.argv.slice(2));
  const key = (process.env.INDEXNOW_KEY || INDEXNOW_KEY).trim();
  const list = urls.length > 0 ? urls : [...INDEXNOW_PRIORITY_URLS];

  const result = await submitIndexNow(list, { key, dryRun });

  if (dryRun) {
    console.log(result.body);
    console.log(`\n[dry-run] would submit ${result.submitted} URL(s)`);
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        status: result.status,
        submitted: result.submitted,
        body: result.body || null,
      },
      null,
      2,
    ),
  );

  if (!result.ok) {
    console.error(
      'IndexNow rejected the submission. Check key file is live at keyLocation and URLs are on mcpindex.ai.',
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
