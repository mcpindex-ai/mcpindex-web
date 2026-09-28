// Locks the two machine-readable AEO surfaces (/llms.txt, /llms-full.txt) that broadcast
// mcpindex's load-bearing honest claims to answer engines. Neither had test coverage, so a
// refactor could silently (a) drift the install commands away from their source constant, or
// (b) inflate a v1 honesty caveat into a false capability claim. These tests fail closed on both.
// The size tripwire converts the unbounded-growth concern on the catalog into a deferred,
// data-triggered decision: it goes red only if a file grows into genuinely harmful territory.
// It fired once, on 2026-09-28 at 10.1MB, and the catalog was split into files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET as llms } from '../../app/llms.txt/route';
import { GET as llmsFull } from '../../app/llms-full.txt/route';
import { GET as llmsFullFile, generateStaticParams } from '../../app/llms-full/[file]/route';
import { gateInstallLine } from '../../lib/install/manifest';
import { loadServers, loadSnapshotMeta } from '../../lib/registry';
import { SOURCE_LIVENESS_CENSUS } from '../../lib/sourceLiveness';
import { VERDICT_CONTRACT_VERSION } from '../../lib/verdictContract';
import { CATALOG_PREAMBLE, paginateCatalog } from '../../lib/llmsCatalog';
import { CATALOG_MAX_PER_WINDOW } from '../../proxy';

async function bodyOf(res: Response): Promise<string> {
  return res.text();
}

test('/llms.txt: canonical install line is generated from source (no hand-drift)', async () => {
  const res = await llms();
  const body = await bodyOf(res);
  // The route renders gateInstallLine({ code: true }); assert its exact output is present,
  // so the install copy can never drift from lib/install/manifest.
  assert.ok(
    body.includes(gateInstallLine({ code: true })),
    'llms.txt install line drifted from gateInstallLine({code:true})',
  );
});

test('/llms.txt: load-bearing honest claims are intact', async () => {
  const body = await bodyOf(await llms());
  for (const phrase of [
    'Not a safety oracle',
    'ALLOW and DENY are reserved in the contract, not emitted today',
    'calibrated=false',
    'held off by default',
    'Unofficial. Not affiliated with Anthropic',
  ]) {
    assert.ok(body.includes(phrase), `llms.txt missing honest claim: "${phrase}"`);
  }
});

test('/llms.txt: structure + content-type', async () => {
  const res = await llms();
  const body = await bodyOf(res);
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  // Edge-cacheable with a long stale-while-revalidate. Both halves are load-bearing: rendering this
  // body costs a cold isolate a ~25MB snapshot parse, so without SWR every TTL expiry puts one
  // fetcher on the origin-render path — which is exactly how an agent-accessibility audit timed out
  // fetching llms.txt while the route was no-store.
  const cc = res.headers.get('cache-control') ?? '';
  assert.match(cc, /s-maxage=3600\b/, 'llms.txt must be edge-cached for an hour');
  assert.match(cc, /stale-while-revalidate=86400\b/, 'llms.txt must keep SWR so a cold render never blocks a fetcher');
  assert.ok(body.startsWith('# mcpindex.ai'), 'llms.txt must open with the H1 title');
  assert.ok(body.includes('/api/mcp'), 'llms.txt must advertise the remote MCP endpoint');
});

test('/llms-full.txt: canonical install line is generated from source', async () => {
  const body = await bodyOf(await llmsFull());
  // The full doc renders gateInstallLine() (no code fences).
  assert.ok(
    body.includes(gateInstallLine()),
    'llms-full.txt install line drifted from gateInstallLine()',
  );
});

test('/llms-full.txt: load-bearing honest claims are intact', async () => {
  const body = await bodyOf(await llmsFull());
  for (const phrase of [
    'Contract states: ALLOW / DENY / REVIEW / UNVERIFIED',
    'ALLOW and DENY are reserved, not produced',
    'calibrated=false',
    'held off by default',
  ]) {
    assert.ok(body.includes(phrase), `llms-full.txt missing honest claim: "${phrase}"`);
  }
});

// Every catalog file the index lists, fetched through the real route handler.
async function catalogFiles(index: string): Promise<{ url: string; res: Response; body: string }[]> {
  const urls = [...index.matchAll(/https:\/\/mcpindex\.ai\/llms-full\/([^\s]+\.txt)/g)];
  return Promise.all(
    urls.map(async ([url, file]) => {
      const res = await llmsFullFile(new Request(url), { params: Promise.resolve({ file }) });
      return { url, res, body: await res.text() };
    }),
  );
}

test('/llms-full.txt: index lists catalog files that together hold every server once', async () => {
  const res = await llmsFull();
  const index = await bodyOf(res);
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  // Same contract as llms.txt: an uncached origin render is a slow path and an egress cost.
  const cc = res.headers.get('cache-control') ?? '';
  assert.match(cc, /s-maxage=3600\b/, 'llms-full.txt must be edge-cached for an hour');
  assert.match(cc, /stale-while-revalidate=86400\b/, 'llms-full.txt must keep SWR so a cold render never blocks a fetcher');
  assert.ok(index.includes('Total servers:'), 'llms-full.txt must state the catalog total');

  const files = await catalogFiles(index);
  assert.ok(files.length > 1, 'llms-full.txt lists no catalog files');
  const version = (await loadSnapshotMeta()).version;
  for (const f of files) {
    assert.equal(f.res.headers.get('x-snapshot-version'), version, `${f.url} serves a different snapshot`);
    assert.equal(f.res.status, 200, `${f.url} is listed but does not resolve`);
    assert.equal(f.res.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.match(f.res.headers.get('cache-control') ?? '', /s-maxage=3600\b.*stale-while-revalidate=86400\b/);
  }
  // One detail link per indexed server across all files, and no server in two files. Tied to
  // loadServers(), NOT getServerCount(): the latter is deliberately registry-only because /stats
  // publishes it under an explicit "official registry" claim, while this catalog lists everything
  // mcpindex indexes, editorially admitted servers included.
  const links = files.flatMap((f) => f.body.match(/https:\/\/mcpindex\.ai\/server\/\S+/g) ?? []);
  const servers = await loadServers();
  assert.equal(links.length, servers.length, 'one detail link per indexed server');
  assert.equal(new Set(links).size, links.length, 'a server appears in more than one catalog file');
  // Source-side collapse moves both sides together; this coarse floor catches that.
  assert.ok(links.length > 10000, `catalog collapsed to ${links.length} servers - snapshot shrank?`);
  // The index no longer inlines server blocks.
  assert.ok(!index.includes('https://mcpindex.ai/server/'), 'llms-full.txt inlines server blocks again');
});

test('/llms-full.txt and every catalog file stay under the size tripwire', async () => {
  // Deferred-decision tripwire, per file. A red here means one file outgrew a one-pass read:
  // lower CATALOG_PAGE_SIZE, or look at what bloated the rows.
  const ONE_MB = 1024 * 1024;
  const HUNDRED_KB = 100 * 1024;
  const index = await bodyOf(await llmsFull());
  const indexBytes = Buffer.byteLength(index, 'utf8');
  assert.ok(indexBytes < ONE_MB, `llms-full.txt index is ${indexBytes} bytes (>1MB tripwire)`);
  let total = 0;
  for (const f of await catalogFiles(index)) {
    const bytes = Buffer.byteLength(f.body, 'utf8');
    total += bytes;
    assert.ok(bytes < ONE_MB, `${f.url} is ${(bytes / ONE_MB).toFixed(2)}MB (>1MB tripwire)`);
  }
  // Lower bound: a regression that guts the catalog fails here.
  assert.ok(total > HUNDRED_KB, `catalog implausibly small (${total} bytes)`);
});

test('a full catalog pull, plus a retry per file, fits one rate-limit window', async () => {
  // proxy.ts counts edge-cache hits too, so a crawler walking every listed file spends one
  // request per file. The catalog grows daily; this goes red before production 429s a pull.
  const files = paginateCatalog(await loadServers()).length;
  assert.ok(
    files * 2 < CATALOG_MAX_PER_WINDOW,
    `${files} catalog files leaves no retry headroom under CATALOG_MAX_PER_WINDOW=${CATALOG_MAX_PER_WINDOW}`,
  );
});

test('/llms-full/<file>: every listed file is prerendered, and nothing else is', async () => {
  // generateStaticParams is what keeps these files prerendered, and a prerendered route is the
  // only kind whose s-maxage/SWR header reaches clients on Vercel. A file the index lists but
  // this misses would fall back to an on-demand render with the header stripped.
  const index = await bodyOf(await llmsFull());
  const listed = [...index.matchAll(/https:\/\/mcpindex\.ai\/llms-full\/(\S+\.txt)/g)].map((m) => m[1]).sort();
  const prerendered = (await generateStaticParams()).map((p) => p.file).sort();
  assert.deepEqual(prerendered, listed);
});

test('/llms-full/<file>: anything that is not a listed catalog file is a plain 404', async () => {
  for (const file of ['other-0.txt', 'other-9999.txt', 'nope-1.txt', 'other-1', '../llms.txt', 'Other-1.txt', 'other-01.txt']) {
    const res = await llmsFullFile(new Request(`https://mcpindex.ai/llms-full/${file}`), {
      params: Promise.resolve({ file }),
    });
    assert.equal(res.status, 404, `${file} should 404`);
    assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.match(res.headers.get('cache-control') ?? '', /s-maxage=\d+/, 'a 404 must be edge-cacheable');
  }
});

// ------------------------------------------------------------ injection-relay boundary
//
// The catalog files inline third-party server text into files built to be fed to LLMs.
// The catalog boundary (lib/llmsCatalog.ts) holds the hostile fixtures in its own unit
// tests; these assertions check the boundary is actually WIRED on the live corpus: every
// file ships the preamble, no control character reaches any export, and no third-party
// value escaped to an unprefixed line inside the catalog.
test('/llms-full: third-party text is framed and line-disciplined in every catalog file', async () => {
  const index = await bodyOf(await llmsFull());
  // Newline is the only permitted control anywhere - including the first-party guide
  // sections of the index, which do not pass through exportLine.
  const controls = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
  assert.ok(!controls.test(index), 'a control character reached llms-full.txt');
  for (const f of await catalogFiles(index)) {
    assert.ok(f.body.includes(CATALOG_PREAMBLE), `${f.url} lost the third-party-text preamble`);
    assert.ok(!controls.test(f.body), `a control character reached ${f.url}`);
    // Everything from the category heading (the only heading ending in a count) is catalog:
    // every indented line there must carry a first-party prefix.
    const catStart = f.body.search(/\n## [^\n]* \(\d+\)\n/);
    assert.ok(catStart > 0, `no category heading in ${f.url}`);
    const escaped = f.body
      .slice(catStart)
      .split('\n')
      .filter((l) => l.startsWith('  ') && l.trim() !== '')
      .filter((l) => !/^ {2}(description|installs|provenance|detail): /.test(l));
    assert.deepEqual(escaped.slice(0, 3), [], `unprefixed third-party line escaped the boundary in ${f.url}`);
  }
});

test('/llms-full.txt: X-Snapshot-Version equals the current snapshot version', async () => {
  const res = await llmsFull();
  // Assert the VALUE, not mere presence: a refactor setting a constant or the wrong source would
  // pass a non-empty check but fail this. (Process _cache is frozen, so meta.version is stable here.)
  const expected = (await loadSnapshotMeta()).version;
  assert.equal(res.headers.get('x-snapshot-version'), expected);
});

// llms.txt is a third copy of the source-liveness census figures, alongside the page
// body and the page metadata. The census test in lib/sourceLiveness.test.ts guards the
// constant against data/source-liveness.json, but nothing guarded that this surface
// actually uses the constant - and answer engines read this file. Pre-debounce figures
// sat in production for four days precisely because each copy was hand-maintained.
test('/llms.txt: every source-liveness figure, including the derived ones, is present',
  async () => {
    const body = await bodyOf(await llms());
    for (const key of ['reposUnreachable', 'reposTotal', 'serversAffected', 'sweepDate',
                       'pctUnreachable', 'ratioPhrase'] as const) {
      assert.ok(
        body.includes(SOURCE_LIVENESS_CENSUS[key]),
        `llms.txt must carry SOURCE_LIVENESS_CENSUS.${key} (${SOURCE_LIVENESS_CENSUS[key]})`,
      );
    }
    // The superseded pre-debounce numbers must never reappear on this surface.
    for (const stale of ['1,834', '2,073']) {
      assert.ok(!body.includes(stale), `llms.txt still contains superseded figure ${stale}`);
    }
  });

// ---------------------------------------------------------------- verdict-contract drift
//
// lib/verdictContract.ts exists because the version "used to be a bare '1.0.0' literal
// repeated across seven emitters" and a bump would half-land. /llms.txt was an EIGHTH copy
// that never got converted: it still announced 1.0.0 while every live trust endpoint
// emitted 1.1.0. That is the worst copy to leave stale - an integrator reads llms.txt
// INSTEAD of calling the API, so the one surface written to be authoritative was the one
// telling agents the wrong contract.

test('/llms.txt states the CURRENT verdict-contract version', async () => {
  const body = await bodyOf(await llms());
  const stated = body.match(/Verdict contract:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
  assert.ok(stated, '/llms.txt no longer states a verdict contract version');
  assert.equal(
    stated[1],
    VERDICT_CONTRACT_VERSION,
    'llms.txt verdict-contract version drifted from lib/verdictContract.ts',
  );
});

test('no published surface states a STALE verdict-contract version', async () => {
  // Catches the general shape, not just the one line that was wrong: any semver printed
  // next to the words "verdict contract" must be the live constant.
  for (const [name, res] of [['llms.txt', await llms()], ['llms-full.txt', await llmsFull()]] as const) {
    const body = await bodyOf(res);
    for (const m of body.matchAll(/verdict[_ -]?contract[_ -]?version["':\s]*([0-9]+\.[0-9]+\.[0-9]+)/gi)) {
      assert.equal(m[1], VERDICT_CONTRACT_VERSION, `${name} carries stale verdict contract ${m[1]}`);
    }
    for (const m of body.matchAll(/Verdict contract:\s*([0-9]+\.[0-9]+\.[0-9]+)/g)) {
      assert.equal(m[1], VERDICT_CONTRACT_VERSION, `${name} carries stale verdict contract ${m[1]}`);
    }
  }
});
