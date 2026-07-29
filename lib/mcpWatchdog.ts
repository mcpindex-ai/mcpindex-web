import type { McpRequestShape } from './mcpBodyGuard';

/**
 * Slow-request watchdog for /api/mcp.
 *
 * WHY A TIMER AND NOT A COMPLETION LOG. On 2026-07-28 an invocation died at
 * `Vercel Runtime Timeout Error: Task timed out after 60 seconds`, and nothing recorded what
 * the request was. Log retention rolled past it before it could be read, so the request that
 * hung is unrecoverable. Three hypotheses were tested and falsified: malformed request shapes
 * (every shape probed answers in <0.4s), the 26MB snapshot parse (measured 143ms end to end,
 * including a 56ms zod pass), and unbounded external I/O in a tool path (all five
 * MCP-reachable /api/v1 routes make none).
 *
 * A log line placed after the handler cannot diagnose this, because in the failing case the
 * handler never returns - the platform kills the invocation first and the line never runs.
 * The diagnostic has to fire DURING the hang. Hence timers.
 *
 * THE TIMERS MUST BE CLEARED. A pending setTimeout keeps the Node event loop alive, which is
 * the exact mechanism that holds a Vercel invocation open - so an uncleared watchdog would
 * cause the failure it is meant to observe. `disarm()` is called from a `finally`.
 *
 * Two checkpoints rather than one, because they answer different questions:
 *   10s - "slow". Normal is ~0.25s warm, ~2.5s on a cold lambda, and lib/v1Dispatch caps a
 *         single dispatch at 8s, so anything past 10s is already outside every known bound.
 *   50s - "about to be killed". maxDuration is 60. A 50s line with no completion after it
 *         means the request hung to death; a 10s line followed by a completion line means it
 *         was merely slow. Those are different bugs.
 *
 * Everything logged comes from McpRequestShape, which carries no caller content.
 */

const SLOW_MS = 10_000;
const NEAR_KILL_MS = 50_000; // route maxDuration is 60s

function describe(s: McpRequestShape): string {
  return `method=${s.method}${s.tool ? ` tool=${s.tool}` : ''} bytes=${s.bytes}`;
}

/**
 * Arm the watchdog. Returns `disarm`, which MUST be called in a finally - it clears the
 * timers and emits a completion line if the request was slow enough to have tripped one.
 */
export function armMcpWatchdog(shape: McpRequestShape): () => void {
  const t0 = Date.now();
  let tripped = false;

  const warn = (label: string) => {
    tripped = true;
    console.error(
      `mcp-slow ${label}: ${describe(shape)} elapsed=${Date.now() - t0}ms ` +
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
      console.error(`mcp-slow completed: ${describe(shape)} elapsed=${Date.now() - t0}ms`);
    }
  };
}
