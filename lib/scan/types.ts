// Data model for the /scan tool. All shapes are plain data so the pure parse +
// summarize functions stay deterministic and testable, and the client component
// just renders them.

export type Transport = 'local' | 'remote' | 'unknown';

/** One MCP server as declared in a config file. Never carries secret VALUES -
 * only the KEY NAMES that look like secrets, so the UI can say "carries a
 * credential" without the value ever leaving the browser (and it never leaves
 * the browser at all - parsing is client-side). */
export interface ScannedServer {
  readonly name: string;
  readonly transport: Transport; // remote = can change server-side; local = spawns a process
  readonly url: string | null;
  readonly command: string | null; // command + args, joined; for local servers
  // Secret-looking KEY NAMES from `env` AND from `headers` (header-derived keys are
  // prefixed `header:`). Remote servers carry their credential in a header far more
  // often than in env, so scanning only `env` reported them as clean.
  readonly secretKeys: readonly string[];
  // Remote over plaintext http:// to a non-loopback host: the credential above and
  // every tool argument cross the network in the clear.
  readonly insecureTransport: boolean;
}

/** One tool, graded by the vendored blast-radius classifier. */
export interface ScannedTool {
  readonly server: string | null;
  readonly name: string;
  readonly actionType: string; // effective_action_type: read/write/delete/send/execute/...
  readonly sideEffect: string; // none | local-write | outbound | destructive
  readonly reversibility: string; // reversible | hard-to-reverse | irreversible
  readonly egress: string; // none | internal | external
  readonly autonomyCeiling: string; // discovery | reversible | needs-approval | never-unattended
  readonly notes: readonly string[]; // human-readable risk notes (e.g. readOnly-hint contradiction)
}

export interface ScanCounts {
  readonly servers: number;
  readonly remoteServers: number; // can change server-side = the drift risk
  readonly localServers: number; // spawn a local process = code-exec surface
  readonly serversWithSecrets: number;
  readonly insecureRemotes: number; // plaintext http:// to a non-loopback host
  readonly tools: number;
  readonly irreversible: number;
  readonly egressExternal: number;
  readonly destructive: number;
  readonly readOnly: number;
  readonly needsApproval: number; // autonomy_ceiling needs-approval | never-unattended
  readonly unpinned: number; // == tools; a fresh scan pins nothing -> the bridge to the gate
}

export interface ScanSummary {
  readonly level: 'server' | 'tool';
  readonly servers: readonly ScannedServer[];
  readonly tools: readonly ScannedTool[];
  readonly counts: ScanCounts;
}
