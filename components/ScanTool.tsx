'use client';

// The /scan tool. Everything here runs in the browser: your config/tools are
// parsed and graded client-side with the gate's own vendored classifier, and the
// input is never sent anywhere. See lib/scan/*.
//
// The page reads in two beats, and the hairline between them is the whole point:
//
//   INPUT      get the config in (paste / file / drop / type)
//   ---------- preflight: what we parsed, and the one button that acts on it
//   REPORT     the product of a scan, always attributed - yours or the sample
//
// The analysis itself is instant and local, so the button is not there to start
// a computation. It exists because a report that is ALWAYS on screen cannot
// answer "did it run, and is this mine?" - the sample and your results looked
// identical apart from one small label. Gating the report on an explicit act
// makes its presence the answer.

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
// Primary action: same filled-accent pattern as the header/install buttons, whose
// resting+hover contrast pair is enforced by `npm run check:contrast`. It sits on
// the ink strip, so DISABLED cannot be a grey fill - white on --color-mute is
// ~4.0:1. It empties out to an outline instead, with zinc-500 label (4.6:1 on ink).
// The transparent resting border keeps that swap from shifting layout.
const CTA =
  'font-mono text-[12.5px] uppercase tracking-[0.14em] text-white bg-[var(--color-accent-strong)] border border-transparent px-5 py-2.5 hover:bg-[var(--color-accent-deep)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:bg-transparent disabled:border-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed';
const LINKY =
  'underline decoration-[var(--color-rule)] underline-offset-4 text-[var(--color-accent-strong)] hover:text-[var(--color-accent-deep)]';
// On the ink strip the accent flips: plain --color-accent is the readable accent
// on ink (5.56:1), where -strong would fail at 3.82:1. See globals.css.
const LINKY_ON_INK =
  'underline decoration-zinc-600 underline-offset-4 text-[var(--color-accent)] hover:text-white';

function Stat({ n, label, tone }: { n: number; label: string; tone?: 'accent' | 'ink' }) {
  return (
    <div className={`rule-l px-4 py-3 ${tone === 'accent' ? 'bg-[var(--color-accent-soft)]' : ''}`}>
      <div className="text-[26px] leading-none font-medium text-[var(--color-ink)]">{n}</div>
      <div className={`mt-1.5 ${LABEL}`}>{label}</div>
    </div>
  );
}

/** What the preflight strip says about the current input, before any scan. It
 * reports the PARSE (did we understand the file, and how much of it), never the
 * analysis - the analysis is what the button is for. */
type Preflight =
  | { readonly state: 'empty' }
  | { readonly state: 'ready'; readonly parsed: string }
  | { readonly state: 'problem'; readonly text: string; readonly offerClear?: boolean };

/** Touch, in the only sense that matters here: no hardware keyboard, and an
 * on-screen one that covers the page when an input takes focus. Read at call
 * time, never at module load - this component server-renders. */
function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

function preflightOf(analysis: Analysis | null): Preflight {
  if (analysis === null) return { state: 'empty' };
  if (analysis.kind === 'summary') {
    const c = analysis.data.counts;
    const n = analysis.data.level === 'tool' ? c.tools : c.servers;
    const noun = analysis.data.level === 'tool' ? 'tool' : 'server';
    return { state: 'ready', parsed: `${n} ${noun}${n === 1 ? '' : 's'} parsed` };
  }
  if (analysis.kind === 'unknown') {
    return { state: 'problem', text: 'no MCP servers or tools in it - expecting an mcpServers block or a tools/list dump' };
  }
  if (analysis.reason === 'double-paste') {
    return { state: 'problem', text: 'two configs in the box - a paste landed on top of another', offerClear: true };
  }
  return { state: 'problem', text: 'not JSON yet - paste the whole file, comments and trailing commas are fine' };
}

export function ScanTool() {
  const [text, setText] = useState('');
  // The scanned input, kept alongside its result so the report can be attributed
  // and so an edit after scanning is detectable. null = nothing scanned yet.
  const [report, setReport] = useState<{ input: string; analysis: Analysis; sample: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState('');
  // Transient message about GETTING the input (clipboard, file). Outranks the
  // preflight read of the text itself, because it is the newer event.
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [reading, setReading] = useState(false);
  // Where the current box contents came from, when it wasn't the keyboard.
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [client, setClient] = useState(CLIENTS[0]);
  const [os, setOs] = useState<OS>('mac');
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const reportRef = useRef<HTMLHeadingElement>(null);
  const selectAfterFill = useRef(false);

  // Leave clipboard-filled text SELECTED, after the value is actually committed
  // (selecting inside the click handler would run against the pre-render value).
  // A clipboard read that lands after the user has already pressed ⌘V would
  // otherwise stack a second copy INTO the first - two documents, invalid JSON.
  // Selected means a stray ⌘V replaces instead of appends.
  useEffect(() => {
    if (!selectAfterFill.current) return;
    selectAfterFill.current = false;
    textRef.current?.focus();
    textRef.current?.select();
  }, [text]);

  // Derived, not stored. Deferred so re-parsing a large pasted dump on each keystroke
  // never blocks typing (the result is a pure function of the text).
  const deferredText = useDeferredValue(text);
  const parsed = useMemo<Analysis | null>(
    () => (deferredText.trim() ? analyze(deferredText) : null),
    [deferredText],
  );
  const preflight = useMemo(() => preflightOf(parsed), [parsed]);
  const help = useMemo(() => pathHelp(client, os), [client, os]);

  const stale = report !== null && report.input !== text;
  // One CTA triggers every evaluation, so it is live whenever the input can be
  // scanned - including a re-scan of input already scanned. A control that is
  // THE way to run the tool must never be missing when there is something to run.
  const scannable = preflight.state === 'ready';

  function edit(next: string) {
    setNotice(null);
    setLoadedFrom(null);
    setText(next);
  }

  /** Fill the box from somewhere other than the keyboard, and say where from -
   * without an auto-scan, the filled box is the only proof the load worked, and
   * on a 3 KB config that is easy to miss. */
  function load(value: string, from: string) {
    setNotice(null);
    setText(value);
    setLoadedFrom(from);
  }

  function fail(message: string) {
    setNotice({ tone: 'error', text: message });
    // Focus is a help on a desktop (the keyboard paste is one keystroke away) and
    // a hindrance on a phone, where it throws up the on-screen keyboard over the
    // message the user is trying to read.
    if (!isCoarsePointer()) textRef.current?.focus();
  }

  /** The commitment moment. Takes the value explicitly: callers that just set the
   * text (paste, file, drop, sample) would otherwise scan the pre-render state. */
  function scan(value: string) {
    const result = analyze(value);
    if (result.kind !== 'summary') return; // the strip already says what is wrong
    setNotice(null);
    // Attribution is decided by what was scanned, not by which control started it:
    // load the sample and edit one line and it becomes yours, with no state to
    // go stale. Calling the shipped sample "your setup" would be the exact lie
    // this redesign exists to remove.
    setReport({
      input: value,
      analysis: result,
      sample: value === SAMPLE_CONFIG_JSON || value === SAMPLE_TOOLS_JSON,
    });
    // Move focus to the report. On a long page the payload lands below the fold,
    // and for keyboard/screen-reader users an unannounced swap is no event at all.
    requestAnimationFrame(() => reportRef.current?.focus());
  }

  function onFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setNotice({ tone: 'error', text: 'that file is too large to scan in your browser - an mcp.json is usually a few KB' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => load(String(reader.result ?? ''), file.name);
    reader.onerror = () => fail("couldn't read that file - open it and paste the text instead");
    reader.readAsText(file);
  }

  // Read the clipboard on an explicit press. Four behaviors to survive:
  //
  //   Chrome   leaves readText() PENDING while its permission prompt is up, and
  //            pending forever if the prompt is dismissed.
  //   Safari   (incl. iOS) resolves only after the user taps its own native
  //            Paste callout, which can sit there for several seconds.
  //   Firefox  never exposes readText to page scripts at all - it rejects.
  //   iOS      has no ⌘V, and focusing an input raises the keyboard, which can
  //            DISMISS the very Paste callout we are waiting on.
  //
  // So: never block on the promise, and on touch never steal focus or talk about
  // keystrokes. The nudge waits longer there, because tapping through a native
  // callout is slower than clicking Allow with a mouse.
  async function pasteFromClipboard() {
    const touch = isCoarsePointer();
    setNotice(null);
    setReading(true);
    const nudge = setTimeout(
      () => {
        setReading(false);
        setNotice({
          tone: 'info',
          text: touch
            ? 'waiting on your browser - tap Paste when it asks, or touch and hold the box and tap Paste'
            : 'waiting on your browser - click Allow on the clipboard prompt, or press ⌘V (Ctrl+V) in the box',
        });
        if (!touch) textRef.current?.focus();
      },
      touch ? 6000 : 1200,
    );

    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        fail('your clipboard is empty - copy your mcp.json first, then press the button again');
        return;
      }
      // A late "Allow" must not clobber whatever the user did while waiting.
      if (!textRef.current?.value.trim()) {
        // Selecting exists to stop a stray ⌘V stacking a second copy - a keyboard
        // hazard that does not exist on touch, where select() only raises a
        // selection callout over the text the user wants to read.
        selectAfterFill.current = !touch;
        load(clip, 'your clipboard');
      }
    } catch {
      fail(
        touch
          ? 'your browser would not hand over the clipboard - touch and hold the box below, then tap Paste'
          : 'your browser blocked clipboard access - the box is focused, press ⌘V (Ctrl+V) to paste',
      );
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

  // What is on screen below the rule: your scan, or the sample that ships with the page.
  const shown = report?.analysis ?? SAMPLE_ANALYSIS;
  const isSample = report === null || report.sample;
  const summary = shown.kind === 'summary' ? shown.data : null;
  const c = summary?.counts;

  // Counts only - no server names, tool names or URLs ever reach the link.
  const cardPath = !c
    ? ''
    : summary?.level === 'tool'
      ? `/scan/card?tools=${c.tools}&irrev=${c.irreversible}&egress=${c.egressExternal}&unpinned=${c.unpinned}`
      : `/scan/card?servers=${c.servers}&remote=${c.remoteServers}&local=${c.localServers}&creds=${c.serversWithSecrets}`;
  const cardAlt =
    summary?.level === 'tool'
      ? `mcpindex scan: ${c?.tools} tools, ${c?.irreversible} irreversible, ${c?.egressExternal} off-machine, ${c?.unpinned} unpinned`
      : `mcpindex scan: ${c?.servers} MCP servers, ${c?.remoteServers} remote, ${c?.localServers} local, ${c?.serversWithSecrets} carrying a credential`;
  const hasCard = !!c && (summary?.level === 'tool' ? c.tools > 0 : c.servers > 0);

  return (
    <div
      className={`rule-t rule-b rule-l rule-r bg-white elevate transition-colors ${
        dragOver ? 'bg-[var(--color-accent-soft)]' : ''
      }`}
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
    >
      {/* header */}
      <div className="rule-b px-5 py-2.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)]">
        <span className="flex items-center gap-2 text-[var(--color-ink)]">
          <Mark size={14} />
          <span className="text-[var(--color-mute)]">/scan</span>
        </span>
        <span className="hidden sm:inline">runs in your browser · nothing uploaded</span>
      </div>

      {/* ---------------------------------------------------------- beat 1: input */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={pasteFromClipboard} disabled={reading} className={BTN}>
            {reading ? 'reading clipboard…' : 'paste from clipboard'}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={BTN}>
            choose a file
          </button>
          {/* Swapped in CSS, not in JS: a coarse pointer has nothing to drag with,
              but branching on it during render would break hydration. */}
          <span className="font-mono text-[11px] text-[var(--color-mute)]">
            <span className="[@media(pointer:coarse)]:hidden">
              {dragOver ? 'drop it anywhere in this panel' : 'or drop your mcp.json anywhere in this panel'}
            </span>
            <span className="hidden [@media(pointer:coarse)]:inline">or open it with “choose a file”</span>
          </span>
        </div>
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

        <label htmlFor="scan-input" className={`block mt-4 mb-2 ${LABEL}`}>
          your config
        </label>
        <textarea
          id="scan-input"
          ref={textRef}
          value={text}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter scans, the convention for "submit from a textarea".
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && scannable) {
              e.preventDefault();
              scan(text);
            }
          }}
          rows={5}
          spellCheck={false}
          placeholder={'{ "mcpServers": { … } }   a config, a fragment, or a tools/list dump'}
          className="w-full bg-white border border-[var(--color-rule)] px-3 py-2 font-mono text-[13px] leading-[1.5] text-[var(--color-ink)] placeholder-[var(--color-mute)] focus:border-[var(--color-accent)] focus-visible:outline-none resize-y"
        />

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <details>
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
                  paths vary by version; open the file and drop or paste it above
                </p>
              </div>
            )}
          </details>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className={LABEL}>no config handy?</span>
            <button type="button" className={CHIP} onClick={() => load(SAMPLE_CONFIG_JSON, 'the sample config')}>
              sample config
            </button>
            <button type="button" className={CHIP} onClick={() => load(SAMPLE_TOOLS_JSON, 'the sample toolset')}>
              sample tools
            </button>
            {text.trim() && (
              <button type="button" className={CHIP} onClick={() => edit('')}>
                clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------- the preflight strip + the act */}
      <div className="rule-t px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 bg-[var(--color-ink)]">
        <p role="status" className="font-mono text-[11.5px] leading-[1.6] text-zinc-400 min-w-[16rem] flex-1">
          {notice ? (
            <span className={notice.tone === 'error' ? 'text-rose-400' : 'text-[var(--color-accent)]'}>
              {notice.text}
            </span>
          ) : stale ? (
            <>
              <Status tone="accent">input changed</Status> the report below is from what you scanned before
            </>
          ) : preflight.state === 'ready' ? (
            report ? (
              <>
                <Status tone="ink">scanned ✓</Status> {preflight.parsed} · nothing left this tab
              </>
            ) : (
              <>
                <Status tone="accent">ready</Status> {preflight.parsed}
                {loadedFrom ? ` · loaded from ${loadedFrom}` : ''} · press scan
              </>
            )
          ) : preflight.state === 'problem' ? (
            <>
              <Status tone="rose">can&apos;t read that</Status> {preflight.text}
              {preflight.offerClear && (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => {
                      edit('');
                      textRef.current?.focus();
                    }}
                    className={LINKY_ON_INK}
                  >
                    clear and paste once
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <Status tone="mute">nothing to scan yet</Status> add your mcp.json above
            </>
          )}
        </p>
        {/* The one control that evaluates anything, however the config arrived.
            Always on screen so it is never a thing you have to rediscover. */}
        <button type="button" onClick={() => scan(text)} disabled={!scannable} className={CTA}>
          {stale ? 'rescan my setup' : report && !stale ? 'scan again' : 'scan my setup'}
        </button>
      </div>

      {/* ------------------------------------------------------- beat 2: the report */}
      {summary && c && (
        <div className="rule-t">
          <div
            className={`px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] ${
              isSample ? 'bg-[var(--color-accent-soft)] text-[var(--color-mute)]' : 'text-[var(--color-ink)]'
            }`}
          >
            <h2 ref={reportRef} tabIndex={-1} className="font-mono font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">
              {isSample ? 'sample setup - not your config' : 'your setup'}
            </h2>
            <span className="normal-case tracking-normal text-[11px] text-[var(--color-mute)]">
              {report === null ? (
                preflight.state === 'ready' ? (
                  'press scan to replace this with yours'
                ) : (
                  'a realistic toolset, so the page is never empty'
                )
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setReport(null);
                    edit('');
                    // Starting over means the box, not the heading focus left behind
                    // by the scan that is being thrown away.
                    textRef.current?.focus();
                  }}
                  className={LINKY}
                >
                  clear and start over
                </button>
              )}
            </span>
          </div>

          {/* headline numbers */}
          {summary.level === 'tool' ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 rule-t border-[var(--color-rule)] divide-y sm:divide-y-0">
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
              className={`grid grid-cols-2 ${
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

          {/* share card - both grades of report, counts only */}
          {hasCard && (
            <div className="rule-t px-5 py-4">
              <div className={`${LABEL} mb-3`}>share these numbers</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardPath}
                alt={cardAlt}
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
  );
}

/** The one word that carries the state, set apart from the sentence that explains
 * it. Uppercase is reserved for this word alone - a whole uppercase line reads as
 * shouting and stops being scannable. */
function Status({ tone, children }: { tone: 'accent' | 'ink' | 'rose' | 'mute'; children: React.ReactNode }) {
  const color =
    tone === 'accent'
      ? 'text-[var(--color-accent)]'
      : tone === 'ink'
        ? 'text-white'
        : tone === 'rose'
          ? 'text-rose-400'
          : 'text-zinc-400';
  return <span className={`uppercase tracking-[0.16em] ${color}`}>{children} ·</span>;
}
