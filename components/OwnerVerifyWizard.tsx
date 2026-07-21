'use client';

// Browser owner-verification WIZARD. The primary, in-page path for the /claim flow:
// it ties together the self-serve web LOGIN (lib/webLoginContract + /api/auth/login)
// and the same-origin owner PROXY (/api/owner/[action]) into one step state-machine,
// so an owner can prove control, attest read-only tools, run a preview behavioral
// check, and consent to publish without ever leaving the page or touching curl.
//
// HONESTY (the trust-product cardinal rule): everything this wizard requests results
// in a PREVIEW OBSERVATION ("no contract drift observed"), owner-attested and
// human-reviewed - NEVER a certification and never a claim the server is safe, secure,
// or verified-safe. Wording is chosen to pass scripts/check-graduation-honesty.mjs.
//
// SECURITY: the api_key lives only in component state (+ sessionStorage for the
// multi-step session, never localStorage), is never logged, and is clearable. The
// postMessage receiver trusts a delivered key ONLY when all three hold: same-origin,
// the exact popup window we opened, and the shared message type (see acceptKeyFrom()).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mark } from './Mark';
import { WEB_LOGIN_MESSAGE_TYPE } from '@/lib/webLoginContract';

// ---------------------------------------------------------------- shared styles
const LABEL = 'font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]';
const BTN =
  'font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-ink)] border border-[var(--color-rule)] px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
const BTN_PRIMARY =
  'font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-accent-strong)] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-1.5 hover:border-[var(--color-accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
const CHIP =
  'font-mono text-[11px] text-[var(--color-cite)] border border-[var(--color-rule)] bg-white px-2 py-0.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
const INPUT =
  'w-full bg-white border border-[var(--color-rule)] px-3 py-2 font-mono text-[13px] leading-[1.5] text-[var(--color-ink)] placeholder-[var(--color-mute)] focus:border-[var(--color-accent)] focus-visible:outline-none';

// The api_key grammar the proxy enforces (app/api/owner/[action]/route.ts). Validating
// the delivered/pasted key here fails a malformed value fast and keeps a non-key string
// from ever being treated as one.
const API_KEY_RE = /^mcpk_[A-Za-z0-9_-]{8,256}$/;
const SERVER_ID_RE = /^[A-Za-z0-9._/-]{1,200}$/;
const SESSION_KEY = 'mcpindex_owner_wizard_key';

// ---------------------------------------------------------------- step metadata
const STEPS = [
  'Get your key',
  'Server ID',
  'Verify control',
  'Tools',
  'Attest',
  'Behavioral check',
  'Submit',
] as const;

type OwnerTool = { name: string; definition_hash: string; probe_safe: boolean };
type PreviewState = 'clean' | 'drift' | 'inconclusive';

type ProxyResult = { ok: boolean; status: number; data: Record<string, unknown> };

// A claimable server as resolved from the public registry search. The owner picks one and the
// wizard derives BOTH the registry id and the remote origin from it - so the owner never has to
// know their exact `io.github.you/...` id or figure out where to serve the challenge.
type ServerHit = { serverId: string; slug: string; title: string; remoteUrl: string; remoteOrigin: string };

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

// Map a registry result to a ServerHit. Handles both shapes: the claimable finder returns a flat
// `remote`; the /api/v1/search deep-link returns `installs.remote`. `name` is the registry id.
function toServerHit(r: Record<string, unknown>): ServerHit | null {
  const serverId = typeof r.name === 'string' ? r.name : '';
  if (!serverId) return null;
  const installs = (r.installs ?? {}) as Record<string, unknown>;
  const remoteUrl =
    typeof r.remote === 'string' ? r.remote : typeof installs.remote === 'string' ? installs.remote : '';
  const slug = typeof r.slug === 'string' ? r.slug : '';
  const title = typeof r.title === 'string' && r.title ? r.title : serverId;
  return { serverId, slug, title, remoteUrl, remoteOrigin: originOf(remoteUrl) };
}

// Map the proxy's HTTP status to the exact per-step guidance the task calls for. The
// upstream {error} string (already re-emitted as JSON by the proxy) is shown alongside.
function statusHint(status: number): string {
  switch (status) {
    case 401:
      return 'key invalid - sign in again (or paste a fresh key)';
    case 403:
      return 'verify ownership first - complete the domain-control step above';
    case 404:
      return 'server not in the registry, or it has no HTTP remote - only registry-listed servers with a reachable HTTP remote are claimable';
    case 409:
      return 'recently submitted - there is a short cooldown; try again later';
    case 429:
      return 'slow down - too many requests; wait a moment and retry';
    case 400:
      return 'the request was rejected - check the server id and your key';
    default:
      return 'the request could not be completed';
  }
}

function errorLine(r: ProxyResult): string {
  const err = typeof r.data?.error === 'string' ? r.data.error : '';
  const hint = statusHint(r.status);
  return err ? `${hint} (${r.status}: ${err})` : `${hint} (${r.status})`;
}

// Deterministic, honest attestation tag: probe-attest-<date>-<tool>-human-<who>. The
// literal `-human-` segment is REQUIRED by the owner API (machine/self tags are rejected)
// and records that a HUMAN confirmed the tool is read-only-safe to probe.
function sanitize(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'x'
  );
}
function buildAttestation(toolName: string, confirmedBy: string, date: string): string {
  return `probe-attest-${date}-${sanitize(toolName)}-human-${sanitize(confirmedBy)}`;
}

// ------------------------------------------------------------- countdown helper
function useCountdown(iso: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  const end = Date.parse(iso);
  if (Number.isNaN(end)) return null;
  const ms = end - now;
  if (ms <= 0) return 'expired';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ------------------------------------------------------------------- component
export default function OwnerVerifyWizard() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // KEY (never logged; state + sessionStorage only, never localStorage).
  const [apiKey, setApiKey] = useState('');
  const [pasteKey, setPasteKey] = useState('');
  const [awaitingKey, setAwaitingKey] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [keyError, setKeyError] = useState('');
  const popupRef = useRef<Window | null>(null);

  // SERVER — searched + picked from the registry so the owner never types an exact id or looks up
  // their remote origin: the pick supplies both (serverId + remoteOrigin).
  const [serverId, setServerId] = useState('');
  const [remoteOrigin, setRemoteOrigin] = useState(''); // origin of the picked server's remote URL
  const [serverQuery, setServerQuery] = useState('');
  const [serverResults, setServerResults] = useState<ServerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false); // fallback: type the registry id directly

  // CHALLENGE
  const [challenge, setChallenge] = useState<{ token: string; wellKnownPath: string; expiresAt: string } | null>(
    null,
  );
  const countdown = useCountdown(challenge?.expiresAt ?? null);

  // TOOLS. `checked` is keyed by list INDEX, not tool name: MCP does not forbid two tools
  // sharing a name, and a name-keyed map would collapse their checkbox state into one.
  const [tools, setTools] = useState<OwnerTool[] | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [ack, setAck] = useState(false);

  // ATTEST
  const [confirmedBy, setConfirmedBy] = useState('');
  const [attestResult, setAttestResult] = useState<{ attested: boolean; count: number } | null>(null);

  // BEHAVIORAL
  const [behavior, setBehavior] = useState<{
    state: PreviewState;
    statement: string;
    perTool: Array<{ name: string; summary: string }>;
  } | null>(null);

  // PUBLISH
  const [consent, setConsent] = useState(false);
  const [published, setPublished] = useState<{ status: string; statement: string } | null>(null);

  // Per-step error surface.
  const [error, setError] = useState('');

  // ---- key restore (session only) ------------------------------------------
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      // Restore the session key on mount (not a lazy useState initializer: sessionStorage is
      // unavailable during SSR, and seeding initial state from it would hydration-mismatch).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored && API_KEY_RE.test(stored)) setApiKey(stored);
    } catch {
      /* sessionStorage unavailable (private mode / disabled): key just won't persist */
    }
  }, []);

  const storeKey = useCallback((key: string) => {
    setApiKey(key);
    setKeyError('');
    try {
      sessionStorage.setItem(SESSION_KEY, key);
    } catch {
      /* non-fatal: key still lives in component state for this session */
    }
  }, []);

  const clearKey = useCallback(() => {
    setApiKey('');
    setPasteKey('');
    // Clearing the key means starting over (often for a DIFFERENT server), so reset the whole
    // flow back to step 0. Stale downstream results (a prior server's behavioral observation or
    // publish status) must NOT carry into the next run - for a trust product, showing server A's
    // "no drift observed" while the user is now on server B is a correctness/integrity bug.
    setStep(0);
    setServerId('');
    setRemoteOrigin('');
    setServerQuery('');
    setServerResults([]);
    setSearching(false);
    setManualMode(false);
    setChallenge(null);
    setTools(null);
    setChecked({});
    setAck(false);
    setConfirmedBy('');
    setAttestResult(null);
    setBehavior(null);
    setConsent(false);
    setPublished(null);
    setError('');
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // ---- server pick (locks in serverId + remoteOrigin from one registry result) ----------
  const pickServer = useCallback((hit: ServerHit) => {
    setServerId(hit.serverId);
    setRemoteOrigin(hit.remoteOrigin);
    setServerQuery(hit.title || hit.serverId);
    setServerResults([]);
    setManualMode(false);
    setError('');
  }, []);

  const changeServer = useCallback(() => {
    setServerId('');
    setRemoteOrigin('');
    setServerResults([]);
  }, []);

  // ---- debounced registry search (kills the "what's my id / my origin" friction) --------
  // All state writes happen inside the debounce timer / async callbacks, never synchronously in
  // the effect body; stale results are hidden at render by the query-length guard, so there is no
  // synchronous clear to do here. When a server is locked in / manual mode, the search box isn't
  // rendered at all, so no search runs.
  useEffect(() => {
    const q = serverQuery.trim();
    if (serverId || manualMode || q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      // Claimable-only, name-ranked finder - so the owner's own server surfaces instead of being
      // buried under unrelated servers that share a common token like "github".
      fetch(`/api/registry/claimable?q=${encodeURIComponent(q)}&limit=8`, { signal: ctrl.signal })
        .then((res) => res.json())
        .then((data: { results?: Array<Record<string, unknown>> }) => {
          const hits = (data.results ?? []).map(toServerHit).filter((h): h is ServerHit => h !== null);
          setServerResults(hits);
        })
        .catch(() => {
          /* aborted / network: leave prior results */
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [serverQuery, serverId, manualMode]);

  // ---- deep-link prefill: /claim?server=<slug> (from the server page's "Verify it" link) ----
  useEffect(() => {
    let slug = '';
    try {
      slug = new URLSearchParams(window.location.search).get('server')?.trim() ?? '';
    } catch {
      slug = '';
    }
    if (!slug) return;
    const ctrl = new AbortController();
    // Exact slug lookup (?slug=) - deterministic, never a wrong-server fallback.
    fetch(`/api/v1/search?slug=${encodeURIComponent(slug)}`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data: { results?: Array<Record<string, unknown>> }) => {
        const row = (data.results ?? [])[0];
        const hit = row ? toServerHit(row) : null;
        // Only auto-select a claimable server (one with a resolvable remote origin).
        if (hit && hit.remoteOrigin) pickServer(hit);
      })
      .catch(() => {
        /* ignore: user can still search manually */
      });
    return () => ctrl.abort();
  }, [pickServer]);

  // ---- postMessage receiver (LOAD-BEARING SECURITY) -------------------------
  // Trust a delivered key ONLY when ALL THREE hold (see lib/webLoginContract RECEIVER
  // CONTRACT). The listener is installed only while a popup is in flight and removed on
  // receipt / on unmount, so no dangling same-origin channel survives the sign-in.
  //
  // Origin check: we compare against window.location.origin, NOT siteOrigin(). The
  // callback posts with targetOrigin = siteOrigin() (server-resolved, correct per env),
  // so the browser only DELIVERS the message when our origin equals it - meaning a
  // delivered event.origin always equals window.location.origin. siteOrigin() called in
  // THIS client bundle resolves to the prod default (process.env is not inlined), which
  // would wrongly reject preview deploys; the webLoginContract header documents exactly
  // this and directs the wizard to validate against its own window.location.origin.
  useEffect(() => {
    if (!awaitingKey) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return; // (1) same-origin
      if (e.source !== popupRef.current) return; // (2) the exact popup we opened
      const data = e.data as { type?: unknown; key?: unknown } | null;
      if (!data || data.type !== WEB_LOGIN_MESSAGE_TYPE) return; // (3) the shared type
      const key = data.key;
      if (typeof key !== 'string' || !API_KEY_RE.test(key)) return; // shape-valid key only
      storeKey(key);
      setAwaitingKey(false);
      try {
        popupRef.current?.close();
      } catch {
        /* popup may already be closed */
      }
      popupRef.current = null;
    }
    window.addEventListener('message', onMessage);
    // Recover if the popup is closed/dismissed without delivering a key (or the message
    // is dropped, e.g. a misconfigured site origin): otherwise awaitingKey would stay true
    // forever and both sign-in buttons would be permanently disabled. The closed-poll is the
    // primary recovery; the timeout is a backstop for when the popup handle is unavailable
    // (COOP can sever it so .closed never flips).
    const poll = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        popupRef.current = null;
        setAwaitingKey(false);
        setKeyError('sign-in did not complete - try again, or paste your key.');
      }
    }, 500);
    const timeout = setTimeout(() => {
      popupRef.current = null;
      setAwaitingKey(false);
      setKeyError('sign-in timed out - try again, or paste your key.');
    }, 300_000);
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, [awaitingKey, storeKey]);

  function signIn(provider: 'github' | 'google') {
    setKeyError('');
    setPopupBlocked(false);
    const url = `/api/auth/login/start?mode=web&provider=${provider}`;
    const win = window.open(url, 'mcpindex-login', 'popup,width=520,height=680');
    if (!win) {
      setPopupBlocked(true);
      return;
    }
    popupRef.current = win;
    setAwaitingKey(true);
  }

  function submitPastedKey() {
    const k = pasteKey.trim();
    if (!API_KEY_RE.test(k)) {
      setKeyError('that does not look like an mcpindex key - it starts with mcpk_');
      return;
    }
    storeKey(k);
    setPasteKey('');
  }

  // ---- proxy call ----------------------------------------------------------
  const callOwner = useCallback(
    async (action: string, extra: Record<string, unknown> = {}): Promise<ProxyResult> => {
      const res = await fetch(`/api/owner/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Trim the server id at the boundary: a leading/trailing space from a copy-paste
        // passes the wizard's own trimmed validation but would fail the proxy's charset
        // regex, 400-ing every step with a misleading "check the server id" error.
        body: JSON.stringify({ apiKey, serverId: serverId.trim(), ...extra }),
      });
      let data: Record<string, unknown> = {};
      try {
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        data = {};
      }
      return { ok: res.ok, status: res.status, data };
    },
    [apiKey, serverId],
  );

  // ---- step actions --------------------------------------------------------
  async function requestChallenge() {
    if (!SERVER_ID_RE.test(serverId.trim())) {
      setError('enter a valid registry server id (e.g. io.github.you/your-server)');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const r = await callOwner('challenge');
      if (!r.ok) {
        setError(errorLine(r));
        return;
      }
      const d = r.data;
      setChallenge({
        token: String(d.token ?? ''),
        wellKnownPath: String(d.well_known_path ?? '/.well-known/mcpindex-challenge'),
        expiresAt: String(d.expires_at ?? ''),
      });
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOwnership() {
    setError('');
    setBusy(true);
    try {
      const r = await callOwner('verify-ownership');
      if (!r.ok) {
        setError(errorLine(r));
        return;
      }
      if (r.data.authorized === true) {
        setStep(3);
        void loadTools();
      } else {
        setError(
          'not found at your well-known path yet - re-check that the exact token is served at your remote origin, then retry',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadTools() {
    setError('');
    setBusy(true);
    try {
      const r = await callOwner('tools');
      if (!r.ok) {
        setError(errorLine(r));
        setTools([]);
        return;
      }
      const raw = Array.isArray(r.data.tools) ? (r.data.tools as unknown[]) : [];
      const parsed: OwnerTool[] = raw.map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        return {
          name: typeof o.name === 'string' ? o.name : '',
          definition_hash: typeof o.definition_hash === 'string' ? o.definition_hash : '',
          probe_safe: o.probe_safe === true,
        };
      });
      setTools(parsed);
      // probe_safe:true PRE-CHECKED; probe_safe:false starts unchecked. Keyed by index.
      const init: Record<number, boolean> = {};
      parsed.forEach((t, i) => (init[i] = t.probe_safe));
      setChecked(init);
    } finally {
      setBusy(false);
    }
  }

  const selectedTools = (tools ?? []).filter((_, i) => checked[i]);

  async function attest() {
    if (!confirmedBy.trim()) {
      setError('enter who is confirming (a handle or email) - it is recorded in the attestation');
      return;
    }
    if (selectedTools.length === 0) {
      setError('select at least one read-only tool to attest');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const probe_safe_tools = selectedTools.map((t) => ({
        name: t.name,
        definition_hash: t.definition_hash,
        attestation: buildAttestation(t.name, confirmedBy.trim(), date),
        confirmed_by: confirmedBy.trim(),
      }));
      const r = await callOwner('attest', { probe_safe_tools });
      if (!r.ok) {
        setError(errorLine(r));
        return;
      }
      const attested = r.data.attested === true;
      const count = typeof r.data.count === 'number' ? r.data.count : probe_safe_tools.length;
      setAttestResult({ attested, count });
      // Only advance when something was actually attested: mcpindex can refuse a selected
      // tool (write/destructive) and still return a 2xx envelope with attested:false/count:0,
      // which must not carry the user into a behavioral check over zero attested tools.
      if (attested && count > 0) {
        setStep(5);
      } else {
        setError(
          'none of the selected tools were attested - mcpindex refused them (likely not read-only). Pick read-only tools and retry.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function runBehavior() {
    setError('');
    setBusy(true);
    try {
      const r = await callOwner('verify-behavior');
      if (!r.ok) {
        setError(errorLine(r));
        return;
      }
      const d = r.data;
      const rawState = String(d.state ?? '').toLowerCase();
      const state: PreviewState =
        rawState === 'clean' || rawState === 'drift' ? (rawState as PreviewState) : 'inconclusive';
      const perToolRaw = Array.isArray(d.per_tool)
        ? (d.per_tool as unknown[])
        : Array.isArray(d.tools)
          ? (d.tools as unknown[])
          : [];
      const perTool = perToolRaw.map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        const summary =
          typeof o.summary === 'string'
            ? o.summary
            : typeof o.state === 'string'
              ? o.state
              : typeof o.result === 'string'
                ? o.result
                : typeof o.status === 'string'
                  ? o.status
                  : '';
        return { name: typeof o.name === 'string' ? o.name : '', summary };
      });
      setBehavior({
        state,
        statement: typeof d.statement === 'string' ? d.statement : '',
        perTool,
      });
      setStep(6);
    } finally {
      setBusy(false);
    }
  }

  async function requestPublish() {
    setError('');
    setBusy(true);
    try {
      const r = await callOwner('publish', { consent_publish: true });
      if (!r.ok) {
        setError(errorLine(r));
        return;
      }
      setPublished({
        status: typeof r.data.status === 'string' ? r.data.status : 'review',
        statement: typeof r.data.statement === 'string' ? r.data.statement : '',
      });
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- rendering
  return (
    <div className="rule-t rule-b rule-l rule-r bg-white elevate">
      {/* man-page header */}
      <div className="rule-b px-5 py-2.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)]">
        <span className="flex items-center gap-2 text-[var(--color-ink)]">
          <Mark size={14} />
          <span className="text-[var(--color-mute)]">verify in your browser</span>
        </span>
        <span className="hidden sm:inline">owner-attested · human-reviewed · preview</span>
      </div>

      {/* step indicator */}
      <ol className="rule-b px-5 py-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="progress">
        {STEPS.map((label, i) => {
          const state = i < step ? 'done' : i === step ? 'current' : 'todo';
          return (
            <li
              key={label}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] ${
                state === 'current'
                  ? 'text-[var(--color-accent-strong)]'
                  : state === 'done'
                    ? 'text-[var(--color-cite)]'
                    : 'text-[var(--color-mute)]'
              }`}
            >
              <span className="tabular-nums">{state === 'done' ? '✓' : String(i).padStart(2, '0')}</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>

      {/* per-step error surface */}
      {error && (
        <div role="alert" className="rule-b bg-rose-50 px-5 py-2.5 font-mono text-[11.5px] leading-[1.5] text-rose-700">
          {error}
        </div>
      )}

      {/* ---- STEP 0: GET YOUR KEY -------------------------------------------- */}
      {step === 0 && (
        <div className="px-5 py-6">
          <StepTitle n={0} title="Get your api_key" />
          {apiKey ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-accent-strong)]">
                  key ready
                </span>
                <span className="font-mono text-[11px] text-[var(--color-mute)]">
                  held in this browser session only
                </span>
                <button type="button" onClick={clearKey} className={CHIP}>
                  clear key
                </button>
              </div>
              <div className="mt-5">
                <button type="button" onClick={() => setStep(1)} className={BTN_PRIMARY}>
                  Continue →
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {/* (a) popup sign-in */}
              <div>
                <div className={`${LABEL} mb-2`}>sign in</div>
                <p className="text-[13px] leading-[1.55] text-[var(--color-cite)] mb-3">
                  Opens a popup and mints a free api_key bound to your account. The key is delivered
                  straight to this page and never leaves your browser.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => signIn('github')} disabled={awaitingKey} className={BTN}>
                    Sign in with GitHub
                  </button>
                  <button type="button" onClick={() => signIn('google')} disabled={awaitingKey} className={BTN}>
                    Sign in with Google
                  </button>
                </div>
                {awaitingKey && (
                  <p className="mt-3 font-mono text-[11px] text-[var(--color-mute)]" role="status">
                    waiting for the popup… finish signing in, then this page picks up your key.
                  </p>
                )}
                {popupBlocked && (
                  <p className="mt-3 font-mono text-[11px] text-rose-700">
                    the popup was blocked - allow popups for this site, or paste your key on the right.
                  </p>
                )}
              </div>

              {/* (b) paste fallback */}
              <div className="sm:rule-l sm:pl-6">
                <div className={`${LABEL} mb-2`}>…or paste a key</div>
                <p className="text-[13px] leading-[1.55] text-[var(--color-cite)] mb-3">
                  Popup blocked, or on the CLI? Sign in with{' '}
                  <span className="font-mono text-[12px]">mcpindex login</span> and paste the key here.
                </p>
                <label htmlFor="paste-key" className="sr-only">
                  api_key
                </label>
                <input
                  id="paste-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={pasteKey}
                  onChange={(e) => setPasteKey(e.target.value)}
                  placeholder="mcpk_…"
                  className={INPUT}
                />
                <button type="button" onClick={submitPastedKey} className={`${BTN} mt-3`}>
                  Use this key
                </button>
                {keyError && <p className="mt-2 font-mono text-[11px] text-rose-700">{keyError}</p>}
              </div>
            </div>
          )}
          <p className="mt-6 font-mono text-[10px] leading-[1.6] text-[var(--color-mute)]">
            your key stays in this browser session (never localStorage, never logged, never sent
            anywhere but the mcpindex owner API through the same-origin proxy). use “clear key” to drop
            it.
          </p>
        </div>
      )}

      {/* ---- STEP 1: FIND YOUR SERVER --------------------------------------- */}
      {step === 1 && (
        <div className="px-5 py-6">
          <StepTitle n={1} title="Find your server" />

          {serverId && remoteOrigin ? (
            // Locked-in pick: id + origin are resolved, so the owner never had to know either.
            <div className="mt-4 border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[13px] text-[var(--color-ink)] break-all">
                  {serverQuery || serverId}
                </span>
                <button type="button" onClick={changeServer} className={CHIP}>
                  change
                </button>
              </div>
              <div className="mt-1 font-mono text-[10.5px] text-[var(--color-cite)] break-all">{serverId}</div>
              <div className="mt-1 font-mono text-[11px] text-[var(--color-mute)]">
                you’ll prove control of{' '}
                <span className="text-[var(--color-accent-strong)] break-all">{remoteOrigin}</span>
              </div>
            </div>
          ) : manualMode ? (
            // Fallback: type the registry id directly (origin then falls back to generic guidance).
            <>
              <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
                Enter your MCP-registry id exactly (e.g.{' '}
                <span className="font-mono text-[12px]">io.github.you/your-server</span>). Only servers
                with an HTTP remote are claimable.
              </p>
              <label htmlFor="server-id" className={`block mt-4 mb-1.5 ${LABEL}`}>
                server_id
              </label>
              <input
                id="server-id"
                type="text"
                spellCheck={false}
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
                placeholder="io.github.you/your-server"
                className={INPUT}
              />
              <button
                type="button"
                onClick={() => {
                  setManualMode(false);
                  setServerId('');
                }}
                className="mt-3 font-mono text-[10.5px] text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                ← back to search
              </button>
            </>
          ) : (
            // Primary: search the registry by name; picking fills in the id AND the remote origin.
            <>
              <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
                Search the registry for your server. Pick it and we fill in the id and your remote
                origin automatically - no need to look either up.
              </p>
              <label htmlFor="server-search" className={`block mt-4 mb-1.5 ${LABEL}`}>
                search by name
              </label>
              <input
                id="server-search"
                type="text"
                spellCheck={false}
                autoComplete="off"
                value={serverQuery}
                onChange={(e) => setServerQuery(e.target.value)}
                placeholder="e.g. your server or org name"
                className={INPUT}
              />
              {searching && (
                <p className="mt-2 font-mono text-[11px] text-[var(--color-mute)]" role="status">
                  searching…
                </p>
              )}
              {serverQuery.trim().length >= 2 && serverResults.length > 0 && (
                <ul className="mt-3 rule-t max-h-72 overflow-y-auto">
                  {serverResults.map((h) => (
                    <li key={h.slug || h.serverId} className="rule-b">
                      <button
                        type="button"
                        disabled={!h.remoteOrigin}
                        onClick={() => pickServer(h)}
                        className="w-full text-left px-1.5 py-2.5 disabled:opacity-45 disabled:cursor-not-allowed hover:bg-[var(--color-accent-soft)] transition-colors"
                      >
                        <span className="block font-mono text-[13px] text-[var(--color-ink)] break-all">{h.title}</span>
                        <span className="block mt-0.5 font-mono text-[10px] text-[var(--color-mute)] break-all">
                          {h.serverId}
                        </span>
                        <span
                          className={`block mt-0.5 font-mono text-[10px] break-all ${
                            h.remoteOrigin ? 'text-[var(--color-accent-strong)]' : 'text-[var(--color-mute)]'
                          }`}
                        >
                          {h.remoteOrigin || 'no HTTP remote - not claimable'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {serverQuery.trim().length >= 2 && !searching && serverResults.length === 0 && (
                <p className="mt-3 font-mono text-[11.5px] text-[var(--color-mute)]">
                  no matches yet - keep typing, or{' '}
                  <button
                    type="button"
                    onClick={() => setManualMode(true)}
                    className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
                  >
                    enter the id manually
                  </button>
                  .
                </p>
              )}
              <p className="mt-4 font-mono text-[10.5px] text-[var(--color-mute)]">
                Can’t find it?{' '}
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
                >
                  enter the registry id manually
                </button>
                .
              </p>
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setStep(0)} className={CHIP}>
              ← back
            </button>
            <button type="button" onClick={requestChallenge} disabled={busy || !serverId.trim()} className={BTN_PRIMARY}>
              {busy ? 'requesting…' : 'Request challenge'}
            </button>
          </div>
        </div>
      )}

      {/* ---- STEP 2: VERIFY CONTROL ------------------------------------------ */}
      {step === 2 && challenge && (
        <div className="px-5 py-6">
          <StepTitle n={2} title="Prove control of your origin" />
          {remoteOrigin ? (
            <>
              <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
                Serve the token below as plain text at this exact URL (it’s on your remote’s origin).
                mcpindex fetches it to confirm you control the origin.
              </p>
              <div className="mt-4">
                <div className={`${LABEL} mb-1.5`}>serve the token at this URL</div>
                <TokenField value={`${remoteOrigin}${challenge.wellKnownPath}`} />
              </div>
            </>
          ) : (
            <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
              Serve this exact token as plain text at{' '}
              <span className="font-mono text-[12.5px] text-[var(--color-ink)]">{challenge.wellKnownPath}</span>{' '}
              on the origin of your server’s remote URL - if your remote is{' '}
              <span className="font-mono text-[12.5px]">https://mcp.example.com/sse</span>, the token must
              be readable at{' '}
              <span className="font-mono text-[12.5px]">https://mcp.example.com{challenge.wellKnownPath}</span>.
            </p>
          )}

          <div className="mt-4">
            <div className={`${LABEL} mb-1.5`}>challenge token</div>
            <TokenField value={challenge.token} />
          </div>

          <p className="mt-3 font-mono text-[11px] text-[var(--color-mute)]">
            {countdown === 'expired' ? (
              <span className="text-rose-700">token expired - go back and request a new challenge.</span>
            ) : countdown ? (
              <>expires in {countdown} · serve it within the window, then verify</>
            ) : (
              <>serve it within 15 minutes, then verify</>
            )}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setStep(1)} className={CHIP}>
              ← back
            </button>
            <button
              type="button"
              onClick={() => void requestChallenge()}
              disabled={busy}
              className={CHIP}
            >
              new challenge
            </button>
            <button type="button" onClick={verifyOwnership} disabled={busy} className={BTN_PRIMARY}>
              {busy ? 'checking…' : "I've served it - Verify"}
            </button>
          </div>
        </div>
      )}

      {/* ---- STEP 3: TOOLS --------------------------------------------------- */}
      {step === 3 && (
        <div className="px-5 py-6">
          <StepTitle n={3} title="Pick your read-only tools" />
          {tools === null ? (
            <p className="mt-4 font-mono text-[12px] text-[var(--color-mute)]" role="status">
              loading your live tools…
            </p>
          ) : tools.length === 0 ? (
            <div className="mt-4 border border-[var(--color-rule)] bg-[var(--color-accent-soft)]/40 px-4 py-3">
              <p className="text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
                mcpindex could not observe any tools on this server right now, so there is nothing to
                attest. Confirm the remote is reachable and live, then{' '}
                <button
                  type="button"
                  onClick={() => void loadTools()}
                  className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
                >
                  retry
                </button>
                .
              </p>
            </div>
          ) : (
            <>
              <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
                These are the tools mcpindex currently observes live on your server. Check only the ones
                you have confirmed are <strong className="text-[var(--color-ink)] font-medium">read-only</strong>{' '}
                - safe to send malformed test input to. <span className="font-mono text-[12px]">probe_safe</span>{' '}
                is a heuristic hint, not a guarantee; the read-only judgment is yours.
              </p>
              <ul className="mt-4 rule-t">
                {tools.map((t, i) => (
                  <li key={`${t.name}-${i}`} className="rule-b py-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!checked[i]}
                        onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                        className="mt-1 accent-[var(--color-accent)]"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[13px] text-[var(--color-ink)] break-all">{t.name}</span>
                          {t.probe_safe ? (
                            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] px-1.5 py-0.5">
                              probe_safe
                            </span>
                          ) : (
                            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] border border-[var(--color-rule)] text-[var(--color-mute)] px-1.5 py-0.5">
                              not flagged safe
                            </span>
                          )}
                        </span>
                        {!t.probe_safe && (
                          <span className="mt-1 block text-[11.5px] leading-[1.5] text-[var(--color-mute)]">
                            only check this if you have confirmed the tool is read-only.
                          </span>
                        )}
                        <span className="mt-1 block font-mono text-[10.5px] text-[var(--color-mute)] break-all">
                          {t.definition_hash || '(no definition_hash)'}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <label className="mt-4 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-1 accent-[var(--color-accent)]"
                />
                <span className="text-[13px] leading-[1.5] text-[var(--color-cite)]">
                  I confirm the checked tools are read-only and safe to probe with malformed input.
                </span>
              </label>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  disabled={!ack || selectedTools.length === 0}
                  className={BTN_PRIMARY}
                >
                  Continue to attest ({selectedTools.length}) →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- STEP 4: ATTEST -------------------------------------------------- */}
      {step === 4 && (
        <div className="px-5 py-6">
          <StepTitle n={4} title="Attest the tools you selected" />
          <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
            Each attestation records a human confirmation that the tool is read-only-safe to probe. The
            tag carries the required <span className="font-mono text-[12px]">-human-</span> marker and is
            generated for you; mcpindex re-checks the read-only heuristic on its side and refuses a
            write or destructive tool regardless.
          </p>

          <label htmlFor="confirmed-by" className={`block mt-4 mb-1.5 ${LABEL}`}>
            confirmed_by (your handle or email)
          </label>
          <input
            id="confirmed-by"
            type="text"
            spellCheck={false}
            value={confirmedBy}
            onChange={(e) => setConfirmedBy(e.target.value)}
            placeholder="you@example.com"
            className={INPUT}
          />

          {confirmedBy.trim() && (
            <div className="mt-4">
              <div className={`${LABEL} mb-2`}>will attest {selectedTools.length} tool(s)</div>
              <ul className="rule-t">
                {selectedTools.map((t, i) => (
                  <li key={`${t.name}-${i}`} className="rule-b py-2.5">
                    <div className="font-mono text-[12.5px] text-[var(--color-ink)] break-all">{t.name}</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-mute)] break-all">
                      {buildAttestation(t.name, confirmedBy.trim(), new Date().toISOString().slice(0, 10))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setStep(3)} className={CHIP}>
              ← back
            </button>
            <button
              type="button"
              onClick={attest}
              disabled={busy || !confirmedBy.trim() || selectedTools.length === 0}
              className={BTN_PRIMARY}
            >
              {busy ? 'attesting…' : 'Attest'}
            </button>
          </div>

          {attestResult && (
            <p className="mt-4 font-mono text-[12px] text-[var(--color-cite)]">
              <span className="text-[var(--color-accent-strong)]">▸</span> attested:{' '}
              {String(attestResult.attested)} · count: {attestResult.count}
            </p>
          )}
        </div>
      )}

      {/* ---- STEP 5: BEHAVIORAL CHECK ---------------------------------------- */}
      {step === 5 && (
        <div className="px-5 py-6">
          <StepTitle n={5} title="Run the read-only behavioral check" />
          <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
            mcpindex runs a live read-only check against the tools you attested, comparing observed
            behavior to the definitions you pinned. This can take up to a minute. The result is a{' '}
            <strong className="text-[var(--color-ink)] font-medium">preview observation</strong>, not a
            security or safety guarantee.
          </p>

          {!behavior ? (
            <div className="mt-5">
              <button type="button" onClick={runBehavior} disabled={busy} className={BTN_PRIMARY}>
                {busy ? 'running…' : 'Run the check'}
              </button>
              {busy && (
                <p className="mt-3 font-mono text-[11px] text-[var(--color-mute)]" role="status">
                  this can take up to a minute - it does a live crawl of your attested tools.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center px-3 py-1.5 font-mono text-[13px] tracking-wide border ${
                    behavior.state === 'clean'
                      ? 'border-[var(--color-rule)] bg-white text-[var(--color-cite)]'
                      : 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]'
                  }`}
                >
                  {behavior.state === 'clean'
                    ? 'no contract drift observed'
                    : behavior.state === 'drift'
                      ? 'contract drift observed'
                      : 'inconclusive'}
                </span>
              </div>
              {behavior.statement && (
                <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-ink)]">{behavior.statement}</p>
              )}
              {behavior.perTool.length > 0 && (
                <ul className="mt-4 rule-t">
                  {behavior.perTool.map((t, i) => (
                    <li key={`${t.name}-${i}`} className="rule-b py-2.5 flex flex-wrap items-baseline gap-x-3">
                      <span className="font-mono text-[12.5px] text-[var(--color-ink)] break-all">{t.name}</span>
                      {t.summary && (
                        <span className="font-mono text-[11.5px] text-[var(--color-cite)]">{t.summary}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 font-mono text-[10.5px] leading-[1.55] text-[var(--color-mute)]">
                a preview observation from a read-only check, still being tuned - not a security or
                safety guarantee, and separate from mcpindex’s own screening verdict.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setBehavior(null)} className={CHIP}>
                  re-run
                </button>
                <button type="button" onClick={() => setStep(6)} className={BTN_PRIMARY}>
                  Continue →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- STEP 6: SUBMIT -------------------------------------------------- */}
      {step === 6 && (
        <div className="px-5 py-6">
          <StepTitle n={6} title="Request publish" />
          {published ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center border border-[var(--color-rule)] bg-white px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-cite)]">
                  status: {published.status}
                </span>
              </div>
              {published.statement && (
                <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-ink)]">{published.statement}</p>
              )}
              <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
                Submitted. An mcpindex operator reviews before anything renders on your server page. If
                it is published, it appears as an owner preview - a human-reviewed observation,
                subordinate to the screening verdict, and revoked if the contract later drifts. It is not
                a certification.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
                Explicitly consent to publish the preview observation. Nothing is published without your
                consent, and a human operator still reviews it before it renders.
              </p>
              <label className="mt-4 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 accent-[var(--color-accent)]"
                />
                <span className="text-[13px] leading-[1.5] text-[var(--color-cite)]">
                  I consent to publish this owner preview.
                </span>
              </label>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setStep(5)} className={CHIP}>
                  ← back
                </button>
                <button type="button" onClick={requestPublish} disabled={busy || !consent} className={BTN_PRIMARY}>
                  {busy ? 'submitting…' : 'Request publish'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* footer: honest framing + key control (persistent) */}
      <div className="rule-t px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[10.5px] text-[var(--color-mute)]">
        <span>preview observation · owner-attested · human-reviewed · not a certification</span>
        {apiKey && step > 0 && (
          <button type="button" onClick={clearKey} className="hover:text-[var(--color-accent-strong)] transition-colors">
            clear key
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- subviews
function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-[12px] tabular-nums text-[var(--color-accent-strong)]">
        {String(n).padStart(2, '0')}
      </span>
      <span className="text-[15px] font-medium text-[var(--color-ink)]">{title}</span>
    </div>
  );
}

// Click-to-copy token field (the same dark code-box grammar as CopyField, kept local so
// the token value renders as escaped text only). Degrades to a selectable box on copy failure.
function TokenField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* selectable fallback: the text is selectable in the pre */
    }
  };
  return (
    <div className="relative">
      <pre className="bg-[var(--color-ink)] text-zinc-100 pl-4 pr-16 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
        <code>{value}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy token'}
        className={`absolute top-2 right-2 font-mono text-[10px] uppercase tracking-[0.12em] border px-1.5 py-0.5 transition-colors ${
          copied
            ? 'text-emerald-400 border-emerald-500/60'
            : 'text-zinc-400 hover:text-white border-zinc-700 hover:border-zinc-500'
        }`}
      >
        {copied ? '✓ copied' : 'copy'}
      </button>
    </div>
  );
}
