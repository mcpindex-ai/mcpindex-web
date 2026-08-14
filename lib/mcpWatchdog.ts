/**
 * Slow-request watchdog for /api/mcp.
 *
 * WHY A TIMER AND NOT A COMPLETION LOG. Invocations die at
 * `Vercel Runtime Timeout Error: Task timed out after 60 seconds` and nothing recorded what
 * the request was. In the failing case the handler never returns - the platform kills the
 * invocation first, so any line placed after it never runs. The diagnostic has to fire
 * DURING the hang.
 *
 * WHY IT COVERS PHASES. The first version armed only around the mcp-handler dispatch, i.e.
 * AFTER `await req.text()`. On 2026-07-30 a 60s timeout fired on a deployment carrying that
 * version and logged NOTHING (verified: the deployment was live 32 minutes at the time, and
 * 43 other /api/mcp requests logged normally). A silent watchdog during a hang is evidence,
 * not a failure: it rules the instrumented window out.
 *
 * The uninstrumented windows were the body read and the non-POST verbs, so both are covered
 * now:
 *   body-read - a client that sends headers with a Content-Length and then stalls the body
 *               hangs at `await req.text()` forever. That is before the batch guard, before
 *               the descriptor, and was before the old watchdog. It fits every observation:
 *               users=1, unreproducible by request shape (the shape never arrives), invisible
 *               to a guard that never runs.
 *   dispatch  - GET and DELETE route to mcp-handler directly and never entered postHandler,
 *               so they had no watchdog at all.
 *
 * THE TIMERS MUST BE CLEARED. A pending setTimeout keeps the Node event loop alive, which is
 * the exact mechanism that holds a Vercel invocation open - so an uncleared watchdog would
 * cause the failure it is meant to observe. `disarm()` is called from a `finally`.
 *
 * Two checkpoints, because they answer different questions. 10s is already outside every
 * known bound (normal is ~0.25s warm, ~2.5s cold, and lib/v1Dispatch caps a single dispatch
 * at 8s). 50s sits just under the 60s maxDuration: a 50s line with nothing after it means the
 * request hung to death, while a 10s line FOLLOWED by a completion line means it was merely
 * slow. Those are different bugs.
 */

const SLOW_MS = 10_000;
const NEAR_KILL_MS = 50_000; // route maxDuration is 60s

/**
 * PII-SAFE watchdog context.
 *
 * Every field is a closed vocabulary or a number: HTTP verbs, JSON-RPC method names, our own
 * six tool names, and byte counts. `params.arguments` - the user's prose - has no field here
 * and must never gain one. That is the whole reason this is a typed record rather than a
 * free-form string a caller could interpolate a body into.
 */
export type McpWatchdogContext = {
  /** Which window is being timed. Says WHERE it stalled, which is the point. */
  phase: 'body-read' | 'dispatch';
  /** POST | GET | DELETE. */
  httpMethod: string;
  /** body-read only: the header, which is all we know before the body arrives. -1 if absent. */
  contentLength?: number;
  /** dispatch only: JSON-RPC method, e.g. tools/call. */
  rpcMethod?: string;
  /** dispatch only: one of our own tool names. */
  tool?: string;
  /** dispatch only: actual body length once read. */
  bytes?: number;
};

function describe(c: McpWatchdogContext): string {
  const bits = [`phase=${c.phase}`, `http=${c.httpMethod}`];
  if (c.contentLength !== undefined) bits.push(`content-length=${c.contentLength}`);
  if (c.rpcMethod) bits.push(`method=${c.rpcMethod}`);
  if (c.tool) bits.push(`tool=${c.tool}`);
  if (c.bytes !== undefined) bits.push(`bytes=${c.bytes}`);
  return bits.join(' ');
}

/**
 * Arm the watchdog. Returns `disarm`, which MUST be called in a finally - it clears the
 * timers and emits a completion line if the request was slow enough to have tripped one.
 */
export function armMcpWatchdog(ctx: McpWatchdogContext): () => void {
  const t0 = Date.now();
  let tripped = false;

  const warn = (label: string) => {
    tripped = true;
    console.error(
      `mcp-slow ${label}: ${describe(ctx)} elapsed=${Date.now() - t0}ms ` +
        `(nothing after this line means it hung to the platform ceiling)`,
    );
  };

  const slow = setTimeout(() => warn('10s'), SLOW_MS);
  const nearKill = setTimeout(() => warn('50s-near-kill'), NEAR_KILL_MS);

  return () => {
    clearTimeout(slow);
    clearTimeout(nearKill);
    // Only speak if we already warned. A fast request stays silent so this costs nothing on
    // the happy path, and the presence of a completion line is what distinguishes
    // "slow but finished" from "hung".
    if (tripped) {
      console.error(`mcp-slow completed: ${describe(ctx)} elapsed=${Date.now() - t0}ms`);
    }
  };
}

/** Content-Length as a number for logging; -1 when absent (chunked or no body). */
export function contentLengthOf(req: Request): number {
  const raw = req.headers.get('content-length');
  if (!raw) return -1;
  const n = Number(raw);
  return Number.isFinite(n) ? n : -1;
}
