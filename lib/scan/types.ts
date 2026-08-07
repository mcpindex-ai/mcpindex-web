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

  // ---- blast radius: what this server could do, all provable from the config text.
  // Deliberately NOT here: any claim about whether the contract is STABLE. Transport
  // does not predict that (a loopback service on a live checkout changes daily), and
  // a version pin does not see it - 74% of observed drift kept its declared version.
  // Change-capability can be proven; its absence cannot. Only the gate answers that.

  // Where it talks. 'process' = spawned locally over stdio; 'loopback' = a service
  // on this machine; 'internet' = reachable off-machine. This is a REACH fact, not
  // a stability ranking.
  readonly reach: Reach;
  // Secret-bearing keys whose value is a LITERAL in the file, not a `${ENV_REF}`.
  // A subset of secretKeys, and the sharpest finding a config scan can produce: a
  // live token in a file that syncs to iCloud and lands in dotfiles repos.
  readonly secretsInFile: readonly string[];
  // Resolves its code from a public registry at every launch (`npx pkg`, `uvx pkg`,
  // `@latest`, an untagged image). One-sided: true is proven, false means only that
  // this config does not show it.
  readonly fetchesAtLaunch: boolean;
  // Filesystem breadth granted by a path argument. 'broad' is claimed only for
  // unmistakable cases (/, ~, $HOME, a bare volume root) - a wrong 'broad' is an
  // accusation, so the bias is toward 'unknown'.
  readonly pathScope: PathScope;
  // Already behind mcpindex's own proxy. `upstream` is the real server it wraps -
  // without unwrapping, the report shows users the gate talking about itself.
  readonly gated: boolean;
  readonly upstream: string | null;
}

export type Reach = 'process' | 'loopback' | 'internet' | 'unknown';
export type PathScope = 'broad' | 'narrow' | 'unknown';

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
  // ---- blast radius (server level)
  readonly secretsInFile: number; // a live credential sitting in the config file
  readonly fetchAtLaunch: number; // resolve code from a public registry every launch
  readonly internetReach: number; // can talk off-machine
  readonly loopbackServers: number; // a service on this machine, not off it
  readonly broadFileAccess: number; // handed a path that spans far more than a project
  readonly gatedServers: number; // already behind the gate
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
