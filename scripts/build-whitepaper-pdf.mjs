// Build the branded whitepaper PDF from content/whitepaper.md.
//
// This is a DEV-time generator, NOT part of `npm run build` (the build stays
// `check-graduation-honesty && next build`). It produces a committed, static
// public/whitepaper.pdf so the download link on /whitepaper always works -
// independent of any runtime, form, or email. Re-run it whenever the converged
// markdown changes:  node scripts/build-whitepaper-pdf.mjs
//
// Pipeline: strip the markdown's HTML render-directive comments -> pandoc (gfm
// -> html fragment) -> wrap in a branded HTML doc (Ink/Amber palette, the
// bracket Mark cover, a running header/footer) -> headless Chrome --print-to-pdf.
//
// Deps are tools already on the machine (pandoc + Google Chrome), not npm
// packages - keeps the web dependency tree minimal.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const mdPath = path.join(root, 'content/whitepaper.md');
const outPdf = path.join(root, 'public/whitepaper.pdf');

const INK = '#0a0a0a';
const AMBER = '#ea580c';
const MUTE = '#78716c';
const RULE = '#e7e5e4';

function resolveChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('No Chrome/Chromium binary found for PDF rendering.');
}

const rawMd = fs.readFileSync(mdPath, 'utf8');
// Drop the HTML render-directive comments (they are spec notes, not content).
const cleanMd = rawMd.replace(/<!--[\s\S]*?-->/g, '');

// pandoc: GFM (tables, fenced code) -> HTML fragment.
const fragment = execFileSync(
  'pandoc',
  ['--from=gfm', '--to=html5', '--wrap=none'],
  { input: cleanMd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

const css = `
  :root { --ink:${INK}; --amber:${AMBER}; --mute:${MUTE}; --rule:${RULE}; }
  @page {
    size: A4;
    margin: 20mm 17mm 18mm 17mm;
  }
  * { box-sizing: border-box; }
  html, body { background:#fff; }
  body {
    color: var(--ink);
    font-family: "Geist", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    font-size: 10.2pt;
    line-height: 1.5;
    margin: 0;
  }
  code, pre, .mono { font-family: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace; }

  /* Running header + footer: position:fixed repeats on every printed page in Chrome. */
  .runhead, .runfoot {
    position: fixed; left: 0; right: 0;
    font-family: "Geist Mono", ui-monospace, Menlo, monospace;
    font-size: 7.4pt; letter-spacing: 0.08em; color: var(--mute);
    display: flex; align-items: center; gap: 6px;
  }
  .runhead { top: -12mm; border-bottom: 0.5px solid var(--rule); padding-bottom: 3px; }
  .runfoot { bottom: -12mm; border-top: 0.5px solid var(--rule); padding-top: 3px; justify-content: space-between; }
  .hex { color: var(--amber); }

  /* Cover */
  .cover { page-break-after: always; padding-top: 30mm; }
  .cover .mark { margin-bottom: 26mm; }
  .cover .kicker {
    font-family: "Geist Mono", monospace; font-size: 8.5pt; text-transform: uppercase;
    letter-spacing: 0.18em; color: var(--mute); margin-bottom: 12px;
  }
  .cover h1 {
    font-size: 30pt; line-height: 1.08; letter-spacing: -0.02em; font-weight: 600;
    margin: 0 0 18px 0; max-width: 150mm;
  }
  .cover .standfirst { font-size: 13pt; line-height: 1.4; color: var(--ink); font-style: italic; max-width: 150mm; margin: 0 0 10px; }
  .cover .sub { font-size: 10.5pt; line-height: 1.5; color: var(--mute); max-width: 150mm; }
  .cover .version { margin-top: 22mm; font-family: "Geist Mono", monospace; font-size: 9pt; color: var(--ink); }
  .cover .token { color: var(--amber); }

  /* Prose */
  .doc h1 { font-size: 17pt; font-weight: 600; letter-spacing: -0.01em; margin: 16pt 0 6pt; }
  .doc h2 { font-size: 14pt; font-weight: 600; margin: 20pt 0 6pt; padding-top: 8pt; border-top: 0.5px solid var(--rule); page-break-after: avoid; }
  .doc h3 { font-size: 11.5pt; font-weight: 600; margin: 14pt 0 4pt; page-break-after: avoid; }
  .doc h4 { font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: var(--mute); margin: 12pt 0 4pt; }
  .doc p { margin: 6pt 0; }
  .doc a { color: var(--ink); text-decoration: underline; text-decoration-color: var(--rule); }
  .doc strong { font-weight: 600; }
  .doc ul, .doc ol { margin: 6pt 0; padding-left: 16pt; }
  .doc li { margin: 3pt 0; }
  .doc ul li::marker { color: var(--amber); }
  .doc blockquote {
    margin: 8pt 0; padding: 6pt 10pt; border-left: 2px solid var(--amber);
    background: #fff7ed; page-break-inside: avoid;
  }
  .doc blockquote p { margin: 3pt 0; font-size: 9.6pt; }
  .doc hr { border: 0; border-top: 0.5px solid var(--rule); margin: 14pt 0; }
  .doc code { font-size: 8.8pt; background: #fafaf9; border: 0.5px solid var(--rule); border-radius: 3px; padding: 0 3px; }
  .doc pre { background: var(--ink); color: #f4f4f5; padding: 9pt 11pt; overflow-x: auto; font-size: 8.4pt; line-height: 1.45; page-break-inside: avoid; }
  .doc pre code { background: transparent; border: 0; padding: 0; color: inherit; }
  .doc table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 8.2pt; page-break-inside: avoid; }
  .doc th, .doc td { border: 0.5px solid var(--rule); padding: 4pt 6pt; vertical-align: top; text-align: left; }
  .doc th { background: #fafaf9; font-family: "Geist Mono", monospace; font-size: 7.4pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--mute); font-weight: 500; }
  .doc img { max-width: 100%; }
`;

const markSvg = (size, bracket, token) => `
  <svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none">
    <path d="M15 8 H10 V32 H15" stroke="${bracket}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M25 8 H30 V32 H25" stroke="${bracket}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="15" y="18.2" width="10" height="3.6" rx="1.6" fill="${token}"/>
  </svg>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>${css}</style></head>
<body>
  <div class="runhead"><span class="hex">&#x2B21;</span> mcpindex &middot; the trust-to-act layer</div>
  <div class="runfoot"><span>mcpindex.ai/whitepaper</span><span>v1.0 &middot; launch edition</span></div>

  <section class="cover">
    <div class="mark">${markSvg(40, INK, AMBER)}</div>
    <div class="kicker">silent MCP contract drift, caught at the moment of use</div>
    <h1>[ mcpindex ] - the trust-to-act layer for agent tool calls.</h1>
    <p class="standfirst">The tool your agent trusted on Monday can change on Tuesday, silently. mcpindex holds the call before your agent acts.</p>
    <p class="sub">It pins every tool&rsquo;s contract and holds the call the moment that contract moves. A verdict is a change-tripwire, not a safety oracle: a <span class="token">HOLD</span> means the contract moved, not that the call is dangerous.</p>
    <div class="version">Version 1.0 &middot; Launch edition</div>
  </section>

  <main class="doc">${fragment}</main>
</body></html>`;

const tmpHtml = path.join(os.tmpdir(), `whitepaper-${Date.now()}.html`);
fs.writeFileSync(tmpHtml, html, 'utf8');

const chrome = resolveChrome();
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-chrome-'));
fs.rmSync(outPdf, { force: true });
try {
  // Chrome's --headless=new can keep the parent process alive after writing the
  // PDF, so bound it with a timeout and verify the file afterwards rather than
  // trusting a clean exit.
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      `--print-to-pdf=${outPdf}`,
      '--no-margins',
      `file://${tmpHtml}`,
    ],
    { stdio: 'inherit', timeout: 90_000, killSignal: 'SIGKILL' },
  );
} catch (err) {
  if (!fs.existsSync(outPdf)) throw err; // a real failure - no PDF was produced
  // Chrome wrote the PDF but lingered past the timeout: that is the known,
  // benign case. The file check below is the real success gate.
} finally {
  fs.rmSync(tmpHtml, { force: true });
  fs.rmSync(profileDir, { recursive: true, force: true });
}

const bytes = fs.statSync(outPdf).size;
console.log(`[whitepaper-pdf] wrote ${outPdf} (${(bytes / 1024).toFixed(0)} KB)`);
if (bytes < 20 * 1024) {
  console.error('[whitepaper-pdf] WARNING: output is suspiciously small - inspect it.');
  process.exit(1);
}
