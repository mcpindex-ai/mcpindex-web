'use client';

// The /scan tool. Everything here runs in the browser: your config/tools are
// parsed and graded client-side with the gate's own vendored classifier, and the
// input is never sent anywhere. See lib/scan/*.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Mark } from './Mark';
import { analyze, type Analysis } from '@/lib/scan/analyze';
import { classifyTools, summarize } from '@/lib/scan/summarize';
import { SAMPLE_TOOLS, SAMPLE_CONFIG_JSON } from '@/lib/scan/samples';
import { CLIENTS, pathHelp, type OS } from '@/lib/scan/paths';
import type { ScannedTool } from '@/lib/scan/types';

const SAMPLE_SUMMARY = summarize([], classifyTools(SAMPLE_TOOLS));
const SAMPLE_ANALYSIS: Analysis = { kind: 'summary', data: SAMPLE_SUMMARY, source: 'sample' };
// A real tools/list dump so the "sample toolset" chip loads visible input (not just an empty box).
const SAMPLE_TOOLS_JSON = JSON.stringify({ tools: SAMPLE_TOOLS }, null, 2);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // a config is a few KB; anything this big is a mistake.

const EMPTY = '·';

// ------------------------------------------------------------------- labels
const SIDE_EFFECT: Record<string, string> = {
  none: 'read-only',
  'local-write': 'writes locally',
  outbound: 'sends outbound',
  destructive: 'destructive',
};
const REVERSIBILITY: Record<string, string> = {
  reversible: 'reversible',
  'hard-to-reverse': 'hard to reverse',
  irreversible: 'irreversible',
};
const EGRESS: Record<string, string> = { none: EMPTY, internal: 'internal', external: 'off-machine' };

function toneOf(t: ScannedTool): 'high' | 'warn' | 'calm' {
  if (t.reversibility === 'irreversible' || t.sideEffect === 'destructive') return 'high';
  if (t.egress === 'external' || t.sideEffect === 'local-write' || t.notes.length > 0) return 'warn';
  return 'calm';
}

const LABEL = 'font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]';
const BTN =
  'font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-ink)] border border-[var(--color-rule)] px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
const CHIP =
  'font-mono text-[11px] text-[var(--color-cite)] border border-[var(--color-rule)] bg-white px-2 py-0.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors';
// Primary CTA: same filled-accent pattern as the header/install buttons, whose
// resting+hover contrast pair is enforced by `npm run check:contrast`.
const CTA =
  'font-mono text-[12.5px] uppercase tracking-[0.14em] text-white bg-[var(--color-accent-strong)] px-5 py-2.5 hover:bg-[var(--color-accent-deep)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:bg-[var(--color-accent-deep)] disabled:cursor-wait';

function Stat({ n, label, tone }: { n: number; label: string; tone?: 'accent' | 'ink' }) {
  return (
    <div className={`rule-l px-4 py-3 ${tone === 'accent' ? 'bg-[var(--color-accent-soft)]' : ''}`}>
      <div className="text-[26px] leading-none font-medium text-[var(--color-ink)]">{n}</div>
      <div className={`mt-1.5 ${LABEL}`}>{label}</div>
    </div>
  );
}

export function ScanTool() {
  const [text, setText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState('');
  // One message slot under the input. 'error' = something failed; 'info' = we're
  // waiting on the user (a red alert would be a lie there).
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [client, setClient] = useState(CLIENTS[0]);
  const [os, setOs] = useState<OS>('mac');
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const selectAfterFill = useRef(false);

  // Leave clipboard-filled text SELECTED, after the value is actually committed
  // (selecting inside the click handler would run against the pre-render value).
  // The nudge tells people to press ⌘V, so a read that lands after they've read
  // it would otherwise paste a second copy INTO the first - two documents, invalid
  // JSON, and exactly the dead end this button exists to remove. Selected means a
  // stray ⌘V replaces instead of appends.
  useEffect(() => {
    if (!selectAfterFill.current) return;
    selectAfterFill.current = false;
    textRef.current?.focus();
    textRef.current?.select();
  }, [text]);

  // Derived, not stored. Deferred so re-parsing a large pasted dump on each keystroke
  // never blocks typing (the result is a pure function of the text; empty -> sample).
  const deferredText = useDeferredValue(text);
  const analysis = useMemo<Analysis>(
    () => (deferredText.trim() ? analyze(deferredText) : SAMPLE_ANALYSIS),
    [deferredText],
  );
  const help = useMemo(() => pathHelp(client, os), [client, os]);

  function run(next: string) {
    setNotice(null);
    setText(next);
  }

  function fail(text: string) {
    setNotice({ tone: 'error', text });
    textRef.current?.focus();
  }

  function onFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setNotice({ tone: 'error', text: 'That file is too large to scan in your browser. An mcp.json is usually a few KB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => run(String(reader.result ?? ''));
    reader.onerror = () => fail("Couldn't read that file. Try opening it and pasting the text instead.");
    reader.readAsText(file);
  }

  // Read the clipboard on an explicit click. Three browsers, three behaviors:
  // Chrome leaves readText() PENDING while its permission prompt is up (and
  // forever if the prompt is dismissed), Safari needs the gesture, Firefox never
  // exposes readText to page scripts at all. So: never block on the promise -
  // after a beat, re-enable the button, say what's happening, and focus the box
  // so the keyboard paste is one keystroke away in every one of those cases.
  async function pasteFromClipboard() {
    setNotice(null);
    setReading(true);
    const nudge = setTimeout(() => {
      setReading(false);
      setNotice({
        tone: 'info',
        text: 'Waiting on your browser - click Allow on the clipboard prompt, or just press ⌘V (Ctrl+V) in the box below.',
      });
      textRef.current?.focus();
    }, 1200);

    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        fail('Your clipboard is empty. Copy your mcp.json first, then press the button again.');
        return;
      }
      // A late "Allow" must not clobber whatever the user did while waiting.
      if (!textRef.current?.value.trim()) {
        selectAfterFill.current = true;
        run(clip);
      }
    } catch {
      fail('Your browser blocked clipboard access. The box below is focused - press ⌘V (Ctrl+V) to paste.');
    } finally {
      clearTimeout(nudge);
      setReading(false);
    }
  }

  async function copy(value: string, tag: string) {
    const done = () => {
      setCopied(tag);
      setTimeout(() => setCopied(''), 1400);
    };
    try {
      await navigator.clipboard.writeText(value);
      done();
    } catch {
      // Clipboard API blocked (insecure context, webview, denied): fall back to execCommand,
      // and if that also fails, tell the user rather than silently doing nothing.
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) done();
        else failed();
      } catch {
        failed();
      }
    }

    function failed() {
      setCopied(`${tag}:failed`);
      setTimeout(() => setCopied(''), 1800);
    }
  }

  // Button label: confirmation on success, a scoped failure hint, else the idle label.
  function copyLabel(tag: string, idle: string) {
    if (copied === tag) return 'copied ✓';
    if (copied === `${tag}:failed`) return 'copy failed - select manually';
    return idle;
  }

  const summary = analysis.kind === 'summary' ? analysis.data : null;
  const source = analysis.kind === 'summary' ? analysis.source : null;
  const c = summary?.counts;

  const cardPath = c
    ? `/scan/card?tools=${c.tools}&irrev=${c.irreversible}&egress=${c.egressExternal}&unpinned=${c.unpinned}`
    : '';

  return (
    <div className="rule-t rule-b rule-l rule-r bg-white elevate">
      {/* header */}
      <div className="rule-b px-5 py-2.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)]">
        <span className="flex items-center gap-2 text-[var(--color-ink)]">
          <Mark size={14} />
          <span className="text-[var(--color-mute)]">/scan</span>
        </span>
        <span className="hidden sm:inline">runs in your browser · nothing uploaded</span>
      </div>

      {/* input */}
      <div className="px-5 py-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={`border border-dashed px-4 py-4 text-center transition-colors ${
            dragOver ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-rule)]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={pasteFromClipboard} disabled={reading} className={CTA}>
              {reading ? 'reading clipboard…' : 'test my mcp.json'}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className={BTN}>
              choose a file
            </button>
          </div>
          <p className="mt-3 text-[13px] text-[var(--color-cite)]">
            …or drag your <code className="font-mono text-[12px]">mcp.json</code> here. It is read in your browser
            and never uploaded.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>

        <label htmlFor="scan-input" className={`block mt-5 mb-2 ${LABEL}`}>
          …or paste anything from your MCP setup
        </label>
        <textarea
          id="scan-input"
          ref={textRef}
          value={text}
          onChange={(e) => run(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={'{ "mcpServers": { … } }   a config, a fragment, or a tools/list dump'}
          className="w-full bg-white border border-[var(--color-rule)] px-3 py-2 font-mono text-[13px] leading-[1.5] text-[var(--color-ink)] placeholder-[var(--color-mute)] focus:border-[var(--color-accent)] focus-visible:outline-none resize-y"
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`${LABEL} mr-1 self-center`}>try</span>
          <button type="button" className={CHIP} onClick={() => run(SAMPLE_TOOLS_JSON)}>
            sample tools
          </button>
          <button type="button" className={CHIP} onClick={() => run(SAMPLE_CONFIG_JSON)}>
            sample config
          </button>
          {text.trim() && (
            <button type="button" className={CHIP} onClick={() => run('')}>
              clear
            </button>
          )}
        </div>

        {notice && (
          <p
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`mt-3 font-mono text-[11px] ${
              notice.tone === 'error' ? 'text-rose-700' : 'text-[var(--color-accent-strong)]'
            }`}
          >
            {notice.text}
          </p>
        )}

        {/* Where's my file? */}
        <details className="mt-5 rule-t pt-4">
          <summary className={`${LABEL} cursor-pointer select-none hover:text-[var(--color-accent-strong)]`}>
            Where&apos;s my file?
          </summary>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CLIENTS.map((cl) => (
              <button
                key={cl}
                type="button"
                onClick={() => setClient(cl)}
                className={`${CHIP} ${cl === client ? 'border-[var(--color-accent)] text-[var(--color-accent-strong)]' : ''}`}
              >
                {cl}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['mac', 'win', 'linux'] as OS[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOs(o)}
                className={`${CHIP} ${o === os ? 'border-[var(--color-accent)] text-[var(--color-accent-strong)]' : ''}`}
              >
                {o}
              </button>
            ))}
          </div>
          {help && (
            <div className="mt-3 border border-[var(--color-rule)] bg-[var(--color-accent-soft)]/40 px-3 py-2">
              <div className="font-mono text-[12px] text-[var(--color-ink)] break-all">{help.path}</div>
              <button
                type="button"
                onClick={() => copy(help.reveal, 'reveal')}
                className="mt-2 font-mono text-[11px] text-[var(--color-cite)] hover:text-[var(--color-accent-strong)] underline decoration-[var(--color-rule)] underline-offset-4"
              >
                {copyLabel('reveal', 'copy reveal command')}
              </button>
              <p className="mt-1.5 font-mono text-[10px] text-[var(--color-mute)]">
                paths vary by version; open the file and drag or paste it above
              </p>
            </div>
          )}
        </details>
      </div>

      {/* results (announced to assistive tech when they appear/change) */}
      <div aria-live="polite">
      {analysis.kind === 'invalid' && (
        <div className="rule-t px-5 py-4 font-mono text-[12px] text-[var(--color-mute)]">
          {analysis.reason === 'double-paste' ? (
            <>
              The box holds more than one config - looks like a paste landed on top of another. Two documents
              stacked aren&apos;t valid JSON, and we won&apos;t guess which one you meant.{' '}
              <button
                type="button"
                onClick={() => {
                  run('');
                  textRef.current?.focus();
                }}
                className="underline decoration-[var(--color-rule)] underline-offset-4 text-[var(--color-accent-strong)] hover:text-[var(--color-accent-deep)]"
              >
                Clear the box
              </button>{' '}
              and paste once.
            </>
          ) : (
            <>
              That doesn&apos;t look like JSON yet. Paste your whole <code>mcp.json</code> (comments and trailing
              commas are fine), or try a sample above.
            </>
          )}
        </div>
      )}
      {analysis.kind === 'unknown' && (
        <div className="rule-t px-5 py-4 font-mono text-[12px] text-[var(--color-mute)]">
          Parsed the JSON, but found no MCP servers or tools in it. Expecting an{' '}
          <code>mcpServers</code> / <code>servers</code> block, or a <code>tools/list</code> dump.
        </div>
      )}

      {summary && c && (
        <div className="rule-t">
          {source === 'sample' && (
            <div className="px-5 pt-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
              sample data - drag your own config to scan it
            </div>
          )}

          {/* headline numbers */}
          {summary.level === 'tool' ? (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 rule-t border-[var(--color-rule)] divide-y sm:divide-y-0">
              <Stat n={c.tools} label="tools your agent can call" />
              <Stat n={c.irreversible} label="can't be undone" />
              <Stat n={c.egressExternal} label="send data off-machine" />
              <Stat n={c.unpinned} label="unpinned contracts" tone="accent" />
            </div>
          ) : null}
          {summary.level === 'tool' && (
            <p className="px-5 pt-2 font-mono text-[10.5px] leading-[1.5] text-[var(--color-mute)]">
              unpinned = not yet watched for drift. a fresh scan pins nothing, so this equals your tool count
              until the gate is installed - it is a state, not a finding.
            </p>
          )}
          {summary.level !== 'tool' && (
            <div
              className={`mt-3 grid grid-cols-2 ${
                c.insecureRemotes > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
              } rule-t border-[var(--color-rule)] divide-y sm:divide-y-0`}
            >
              <Stat n={c.servers} label="MCP servers connected" />
              <Stat n={c.remoteServers} label="remote - can change on you" tone="accent" />
              <Stat n={c.localServers} label="spawn a local process" />
              <Stat n={c.serversWithSecrets} label="carry a credential" />
              {c.insecureRemotes > 0 && (
                <Stat n={c.insecureRemotes} label="reached over plaintext http" tone="accent" />
              )}
            </div>
          )}

          {/* the bridge to the gate */}
          <div className="rule-t px-5 py-4">
            <p className="text-[14px] leading-[1.55] text-[var(--color-ink)]">
              {summary.level === 'tool' ? (
                <>
                  <strong>{c.unpinned} unpinned contracts.</strong> This is Monday&apos;s picture. Any of these
                  tools can change what it declares between runs, with nothing in your repo to diff.
                </>
              ) : (
                <>
                  <strong>{c.remoteServers} remote server{c.remoteServers === 1 ? '' : 's'}</strong> can change
                  behavior server-side after you connected them, with nothing in your repo to diff.
                </>
              )}{' '}
              mcpindex pins each contract and HOLDs the call when it drifts.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={BTN}
                onClick={() => copy('curl -fsSL https://mcpindex.ai/install.sh | sh', 'install')}
              >
                {copyLabel('install', 'copy install ↗')}
              </button>
              <Link href="/demo" className={`${CHIP} py-1.5`}>
                see a HOLD →
              </Link>
            </div>
            <p className="mt-2 font-mono text-[10.5px] text-[var(--color-mute)]">
              deterministic contract-diff, not a safety verdict · fails open · advisory
            </p>
          </div>

          {/* server-level -> nudge to the richer per-tool view */}
          {summary.level === 'server' && (
            <div className="rule-t px-5 py-3 font-mono text-[11px] leading-[1.6] text-[var(--color-cite)]">
              This is the server-level view. For the per-tool blast radius, paste a{' '}
              <code>tools/list</code> dump above.{' '}
              <button
                type="button"
                onClick={() => copy('uvx --from mcpindex-gate mcpindex-report --json', 'dump')}
                className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                {copyLabel('dump', 'copy the one-liner')}
              </button>{' '}
              that produces one.
            </div>
          )}

          {/* detail table */}
          <div className="rule-t overflow-x-auto">
            {summary.level === 'tool' ? (
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className={LABEL}>
                    <th scope="col" className="px-5 py-2 font-normal">tool</th>
                    <th scope="col" className="px-3 py-2 font-normal">action</th>
                    <th scope="col" className="px-3 py-2 font-normal">effect</th>
                    <th scope="col" className="px-3 py-2 font-normal">reversibility</th>
                    <th scope="col" className="px-3 py-2 font-normal">egress</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.tools.map((t, i) => {
                    const tone = toneOf(t);
                    const dot =
                      tone === 'high' ? 'bg-rose-500' : tone === 'warn' ? 'bg-[var(--color-accent)]' : 'bg-stone-300';
                    return (
                      <tr key={`${t.name}-${i}`} className="rule-t align-top">
                        <td className="px-5 py-2.5 font-mono text-[12.5px] text-[var(--color-ink)]">
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
                            {t.name}
                          </span>
                          {t.notes.length > 0 && (
                            <span className="mt-1 block font-sans text-[11px] text-rose-700">{t.notes.join('; ')}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[12px] text-[var(--color-cite)]">{t.actionType}</td>
                        <td className="px-3 py-2.5 text-[12.5px] text-[var(--color-cite)]">
                          {SIDE_EFFECT[t.sideEffect] ?? t.sideEffect}
                        </td>
                        <td className="px-3 py-2.5 text-[12.5px] text-[var(--color-cite)]">
                          {REVERSIBILITY[t.reversibility] ?? t.reversibility}
                        </td>
                        <td className="px-3 py-2.5 text-[12.5px] text-[var(--color-cite)]">
                          {EGRESS[t.egress] ?? t.egress}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className={LABEL}>
                    <th scope="col" className="px-5 py-2 font-normal">server</th>
                    <th scope="col" className="px-3 py-2 font-normal">transport</th>
                    <th scope="col" className="px-3 py-2 font-normal">detail</th>
                    <th scope="col" className="px-3 py-2 font-normal">credentials</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.servers.map((s, i) => (
                    <tr key={`${s.name}-${i}`} className="rule-t align-top">
                      <td className="px-5 py-2.5 font-mono text-[12.5px] text-[var(--color-ink)]">{s.name}</td>
                      <td className="px-3 py-2.5 text-[12.5px] text-[var(--color-cite)]">
                        {s.transport === 'remote' ? 'remote (can drift)' : s.transport === 'local' ? 'local process' : 'unknown'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11.5px] text-[var(--color-mute)] break-all max-w-[280px]">
                        {s.url ?? s.command ?? EMPTY}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-[var(--color-cite)]">
                        {s.secretKeys.length > 0 ? s.secretKeys.join(', ') : EMPTY}
                        {s.insecureTransport ? (
                          <span className="block text-[var(--color-accent-strong)]">over plaintext http</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* share card (tool-level, counts only) */}
          {summary.level === 'tool' && c.tools > 0 && (
            <div className="rule-t px-5 py-4">
              <div className={`${LABEL} mb-3`}>share these numbers</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardPath}
                alt={`mcpindex scan: ${c.tools} tools, ${c.irreversible} irreversible, ${c.egressExternal} off-machine, ${c.unpinned} unpinned`}
                className="w-full max-w-[520px] border border-[var(--color-rule)]"
                width={1200}
                height={630}
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => copy(`${window.location.origin}${cardPath}`, 'card')}
                className="mt-2 block font-mono text-[11px] text-[var(--color-cite)] hover:text-[var(--color-accent-strong)] underline decoration-[var(--color-rule)] underline-offset-4"
              >
                {copyLabel('card', 'copy card image link')}
              </button>
              <p className="mt-1.5 font-mono text-[10px] text-[var(--color-mute)]">
                counts only - no tool names or schemas are in the link
              </p>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
