import type { Metadata } from 'next';
import { ArchDiagram } from '@/components/ArchDiagram';
import { Disclose } from '@/components/Disclose';

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Install the in-path drift gate: it HOLDs a call the moment an MCP tool’s contract silently changes, before your agent acts. Plus the free advisory directory - verdict API, drop-in MCP server, and recommend endpoint for discovery.',
  alternates: { canonical: 'https://mcpindex.ai/docs' },
};

export const revalidate = 3600;

const FONT_MONO = '"Geist Mono", ui-monospace, monospace';

export default function DocsPage() {
  return (
    <article className="site-container pt-16 pb-24">
      {/* §00 - Hero */}
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Documentation
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          Install the gate. Or call the network.
        </h1>
        <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
          The wedge is the in-path drift gate: one command pins every MCP tool&rsquo;s contract
          and HOLDs a call the moment that contract silently changes, before your agent acts. No
          key, zero credential custody. Install it below.
        </p>
        <p className="mt-3 text-[14px] leading-[1.55] text-[var(--color-mute)]">
          The rest of this page documents the advisory directory the gate queries: an MCP-native
          API (free, no key, low-latency) that returns a verdict (REVIEW or UNVERIFIED today; ALLOW / DENY are reserved in the contract) on a tool
          and a recommendation endpoint for discovery - direct HTTP, drop-in MCP server, or
          embedded.
        </p>
      </header>

      {/* §01 - Install the gate */}
      <div id="install-the-gate" className="scroll-mt-20" />
      <Section number="01" title="Install the gate">
        <p>
          This is the live, in-path check during use: it pins each MCP
          tool&rsquo;s contract on first sight and HOLDs a call the moment
          that contract silently changes, before your agent acts. It is a
          contract-diff, not a safety verdict (see{' '}
          <Ext href="/methodology">/methodology</Ext>), and it never
          receives your credentials. (The advisory directory further down
          this page is a separate, optional surface: it answers
          &ldquo;which tool, and is it screened&rdquo; before you wire
          anything in.)
        </p>

        <p className="text-[14px] leading-[1.55]" style={{ color: 'var(--color-mute)' }}>
          New here? The <Ext href="/guides/install-the-gate-first-hold">walkthrough</Ext> shows
          install and your first HOLD, start to finish. For every install method - uv, pip, the
          SDK, the full matrix - see <Ext href="/install">/install</Ext>. This page is the
          reference: the one-liner, wiring by hand, and how the gate works.
        </p>

        <div
          className="rule-t pt-5"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          <h3
            className="text-[16px] tracking-tight font-semibold"
            style={{ color: 'var(--color-ink)' }}
          >
            Install (Claude Desktop / Claude Code / Cursor / Gemini CLI / Cline / Zed)
          </h3>
          <p
            className="mt-1 text-[14px] leading-[1.55]"
            style={{ color: 'var(--color-mute)' }}
          >
            The auditable path: install the package, then let the wizard rewrite
            your host config so each MCP server launches <em>behind</em> the gate.
            Auto-wire covers Claude Desktop, Claude Code, Cursor, Gemini CLI
            (<Mono>~/.gemini/settings.json</Mono>), Cline, Zed, Windsurf, and VS Code.
            The <Mono>curl | sh</Mono> one-liner does the same thing in one step
            - inspect it first if you prefer:
          </p>
          <pre className="mt-3 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-snug">
            <code>{`# auditable path - install the package, then run the wiring wizard
uv tool install mcpindex-gate

# convenience: the same install + host-config rewrite in one command.
# inspect it before you run it - it only rewrites your MCP host config,
# and uninstall.sh restores it:
curl -fsSL https://mcpindex.ai/install.sh | less   # read it first
curl -fsSL https://mcpindex.ai/install.sh | sh     # then run it

# Windows (PowerShell): https://mcpindex.ai/install.ps1`}</code>
          </pre>
          <p
            className="mt-3 text-[14px] leading-[1.55]"
            style={{ color: 'var(--color-mute)' }}
          >
            The PyPI package is <Mono>mcpindex-gate</Mono>. (The older name{' '}
            <Mono>mcpindex-preflight</Mono> is EOL, frozen at 0.7.0 - do not use it
            for new installs.) Prefer to wire it by hand? Rewrite each MCP server
            entry so the agent launches that server{' '}
            <em>behind</em> the gate: keep the server&rsquo;s original command as the
            gate&rsquo;s argument. The example below wraps a stdio server (
            <Mono>before</Mono> &rarr; <Mono>after</Mono>); the same shape works in
            Cursor (<Mono>.cursor/mcp.json</Mono>) and Zed{' '}
            (<Mono>~/.config/zed/settings.json</Mono>). Restart the client after
            editing.
          </p>
          <pre className="mt-3 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-snug">
            <code>{`# claude_desktop_config.json - route an existing server through the gate

// before: the agent talks to the server directly
"filesystem": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"]
}

// after: the gate launches the server and checks each tool's contract in-path.
// The original command becomes --upstream-command; each original arg becomes a
// separate --upstream-arg=VALUE (the =VALUE form is required - a dash-leading
// arg like -y does not survive a bare passthrough).
"filesystem": {
  "command": "uvx",
  "args": ["--from", "mcpindex-gate", "python", "-m", "tooling.cse.proxy",
           "--mcpindex-stdio",
           "--upstream-command", "npx",
           "--upstream-arg=-y",
           "--upstream-arg=@modelcontextprotocol/server-filesystem",
           "--upstream-arg=/data"]
}`}</code>
          </pre>
          <p
            className="mt-2 text-[13px] leading-[1.5]"
            style={{ color: 'var(--color-mute)' }}
          >
            Easier: let the one-click installer write this for you - it
            rewrites every server entry, which is fiddly to do by hand. The gate
            forwards to your original server and checks the contract on every
            call. Zero credentials change hands: a stdio server&rsquo;s original{' '}
            <Mono>env</Mono> and an http server&rsquo;s original{' '}
            <Mono>headers</Mono> ride through to your server untouched - the
            gate reads only the public tool contracts, never your tokens. The
            one-click installer (<Mono>install.sh</Mono> /{' '}
            <Mono>install.ps1</Mono>) does this rewrite for you across every
            detected host.
          </p>
        </div>

        <div
          className="rule-t pt-5"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          <h3
            className="text-[16px] tracking-tight font-semibold"
            style={{ color: 'var(--color-ink)' }}
          >
            Remote / HTTP MCP servers
          </h3>
          <p
            className="mt-1 text-[14px] leading-[1.55]"
            style={{ color: 'var(--color-mute)' }}
          >
            The example above wraps a stdio server. An <Mono>http</Mono> /{' '}
            <Mono>url</Mono> entry (a remote server like a hosted GitHub MCP) is
            routed through a local gateway instead: the gate rewrites the entry to
            point your client at a loopback gateway, and the gateway forwards to
            the upstream with your original <Mono>headers</Mono> threaded through
            untouched - same zero-custody posture, just over HTTP.
          </p>
          <p
            className="mt-2 text-[13px] leading-[1.5]"
            style={{ color: 'var(--color-mute)' }}
          >
            One boundary to know: today the gateway gates only{' '}
            <strong style={{ color: 'var(--color-ink)' }}>HTTPS upstreams that resolve to a public IP</strong>.
            A plain-<Mono>http</Mono>, <Mono>localhost</Mono>, or LAN upstream is
            rejected (<Mono>ssrf_blocked</Mono>), not silently passed through -
            gating those is on the roadmap. So a remote HTTPS server is gated like
            any stdio one; a local HTTP server is not yet covered.
          </p>
        </div>

        <div
          className="rule-t pt-5"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          <h3
            className="text-[16px] tracking-tight font-semibold"
            style={{ color: 'var(--color-ink)' }}
          >
            SDK: wrap an already-authenticated session
          </h3>
          <p
            className="mt-1 text-[14px] leading-[1.55]"
            style={{ color: 'var(--color-mute)' }}
          >
            For a server-side agent or custom orchestrator, wrap the MCP client
            session you already authenticated. One line; no per-server config, no
            token handling - the wrapper reuses the session&rsquo;s own
            transport. <Mono>list_tools</Mono> / <Mono>call_tool</Mono> stay
            drop-in.
          </p>
          <pre className="mt-3 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-snug">
            <code>{`// TypeScript - npm i @mcp-index/sdk
import { wrap, PreflightPin } from "@mcp-index/sdk";

const guarded = wrap(session, { pin: new PreflightPin(), serverId: "your-server" });
// use guarded.list_tools() / guarded.call_tool(...) exactly as before`}</code>
          </pre>
          <pre className="mt-2 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-snug">
            <code>{`# Python - pip/uv: mcpindex-gate
from mcpindex_gate import wrap, PreflightPin

session = wrap(session, pin=PreflightPin(), server_id="your-server")`}</code>
          </pre>
          <p
            className="mt-2 text-[13px] leading-[1.5]"
            style={{ color: 'var(--color-mute)' }}
          >
            Persistence differs by runtime. In Python, pass{' '}
            <Mono>PreflightPin(path=…)</Mono> to persist the baseline across
            restarts (so drift while the agent is offline is still caught on the
            next call). The TypeScript <Mono>PreflightPin</Mono> is in-memory only
            (it takes no <Mono>path</Mono>); for durable pins in TS, run the tool
            behind the standalone gate/proxy, which keeps its own on-disk pin store.
            On a hold the wrapper raises (Python) or rejects with a{' '}
            <Mono>PreflightHold</Mono> (TypeScript), or calls your{' '}
            <Mono>on_hold</Mono> / <Mono>onHold</Mono> handler; the wrapped session
            is never called on a hold.
          </p>
          <p
            className="mt-2 text-[13px] leading-[1.5]"
            style={{ color: 'var(--color-mute)' }}
          >
            On Mastra? A dedicated package wires the advisory screen in as a{' '}
            <Mono>beforeToolCall</Mono> hook (a different check from the drift pin
            above - it asks whether a tool is vetted, not whether its contract
            drifted): <Mono>npm i @mcp-index/mastra</Mono>, warn or enforce.
          </p>
        </div>

        <div
          className="rule-t pt-5"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          <h3
            className="text-[16px] tracking-tight font-semibold"
            style={{ color: 'var(--color-ink)' }}
          >
            Postures and what a HOLD does
          </h3>
          <ul className="mt-2 space-y-2 text-[14px] leading-[1.55]" style={{ color: 'var(--color-cite)' }}>
            <li>
              <Mono>Monitor</Mono> - notify and proceed (awareness, no
              friction).
            </li>
            <li>
              <Mono>Guard</Mono> (default) - hold the unambiguously
              breaking and dangerous changes; auto-accept a proven-benign drift
              (added optional param, byte-identical description) and re-pin so
              cosmetic churn never raises a false alarm.
            </li>
            <li>
              <Mono>Strict</Mono> - hold on any drift.
            </li>
          </ul>
          <p
            className="mt-2 text-[13px] leading-[1.5]"
            style={{ color: 'var(--color-mute)' }}
          >
            A HOLD stops the call before your agent acts and surfaces what changed
            (the exact ChangeKind, the before/after on a description change). It is
            fail-closed: a tool the gate cannot verify holds rather than proceeds.
            You review, then re-pin if the change is expected. On an ambiguous
            change, the third-door behavioral verifier - a built in-path seam
            that is held off by default and requires explicit opt-in - can
            exercise the changed tool to clear or refute the change. It clears or
            refutes; it does not prove a tool safe.
          </p>
        </div>

        <div
          className="rule-t pt-5"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          <h3
            className="text-[16px] tracking-tight font-semibold"
            style={{ color: 'var(--color-ink)' }}
          >
            Blast-radius grade (on by default)
          </h3>
          <p
            className="mt-1 text-[14px] leading-[1.55]"
            style={{ color: 'var(--color-mute)' }}
          >
            Alongside the contract-diff, the gate labels what each call would do
            before your agent acts - <Mono>action_type</Mono> (read, write,
            delete, send), whether it can be undone (<Mono>reversibility</Mono>),
            and whether it leaves the machine (<Mono>egress</Mono>) - plus a
            static autonomy ceiling. A read and an irreversible delete look
            identical to an agent until something labels them; this is that label.
            It is on by default in <Mono>@mcp-index/sdk</Mono> and{' '}
            <Mono>mcpindex-gate</Mono>.
          </p>
          <p
            className="mt-2 text-[13px] leading-[1.5]"
            style={{ color: 'var(--color-mute)' }}
          >
            The grade is read statically from the tool&rsquo;s declared contract
            - it never runs the tool - so it is deterministic, needs no
            network, and carries no argument values (every field is a typed enum or
            hash). It is advisory and fail-closed: when the contract is ambiguous it
            grades toward the more dangerous class. It says what a call{' '}
            <em>would</em> do, not whether the contract is safe; your orchestrator
            owns whether to allow, pause, or require approval.
          </p>
        </div>

        <div
          className="rule-t pt-5"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          <h3
            className="text-[16px] tracking-tight font-semibold"
            style={{ color: 'var(--color-ink)' }}
          >
            Ambient presence (on by default)
          </h3>
          <p
            className="mt-1 text-[14px] leading-[1.55]"
            style={{ color: 'var(--color-mute)' }}
          >
            The clients leave a quiet trace that mcpindex is working: the first time
            each tool is used in a session, one dim line on <Mono>stderr</Mono>{' '}
            - <Mono>mcpindex &middot; noted github/delete_repo -
            delete, irreversible</Mono> - then silence on every repeat call, plus a
            one-line session summary. It is local-only: no network, nothing
            persisted, and it never touches <Mono>stdout</Mono> or changes a gate
            decision.
          </p>
          <p
            className="mt-2 text-[13px] leading-[1.5]"
            style={{ color: 'var(--color-mute)' }}
          >
            The first line shows how to turn it off
            (<Mono>silence: MCPINDEX_AMBIENT_NOTICE=off</Mono>); the cadence tunes via{' '}
            <Mono>MCPINDEX_AMBIENT_NOTICE_MODE</Mono>{' '}
            (<Mono>first_touch</Mono> / <Mono>summary</Mono> / <Mono>every</Mono> /{' '}
            <Mono>off</Mono>), and it stays quiet in CI and under{' '}
            <Mono>DO_NOT_TRACK</Mono>. To render it in your own UI instead, pass an{' '}
            <Mono>on_invocation</Mono> callback (Python) / <Mono>onInvocation</Mono>{' '}
            (TS) to <Mono>wrap()</Mono>.
          </p>
        </div>
        <div className="rule-t pt-5" style={{ borderColor: 'var(--color-rule)' }}>
          <h3 className="text-[16px] tracking-tight font-semibold" style={{ color: 'var(--color-ink)' }}>
            Drift network (opt-in, off by default)
          </h3>
          <p className="mt-1 text-[14px] leading-[1.55]" style={{ color: 'var(--color-mute)' }}>
            mcpindex crawls the public MCP registry every day and records which tool contracts
            silently change. Turn the network on with{' '}
            <Mono>MCPINDEX_DRIFT_TELEMETRY=detection</Mono> (off by default) and the gate asks it, on
            each pin, whether the crawler already caught this contract drifting - warning you on
            the first call. A contract-diff advisory: it rides alongside the verdict and never moves
            PROCEED or HOLD. Surfaced by <Mono>renderVerdict</Mono> and the{' '}
            <Mono>fleetAdvisory</Mono> field on the verdict.
          </p>
          <p className="mt-2 text-[13px] leading-[1.5]" style={{ color: 'var(--color-mute)' }}>
            Under the same flag the gate emits one one-way salted-fingerprint signal on a pin or a
            drift and queries <Mono>/api/v1/drift/any</Mono>; it never sends a schema, argument,
            description, URL, or server/tool name, and fails open (never blocks a call). Every drift
            the crawler catches is public in the <Mono>/ledger</Mono>. Full disclosure on{' '}
            <Ext href="/privacy">privacy</Ext>.
          </p>
        </div>
      </Section>

      {/* §02 - The shape */}
      <p className="mt-14 text-[14px] leading-[1.55]" style={{ color: 'var(--color-mute)' }}>
        The rest of this page documents the advisory directory the gate above can optionally
        query - a separate, free surface: search, recommend, and trust-verdict lookups
        over HTTP or as its own MCP server.
      </p>
      <Section number="02" title="The shape">
        <p>
          Five components in the request path; a refresh job keeps the catalog current.
        </p>
        <ArchDiagram />
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mute)]">
          Diagram = advisory directory path (secondary). The in-path gate is Job 1 - see §00-§01.
        </p>
        <p>
          Top-down: a request originates in your agent client and passes through an
          adapter into the API. The trust path returns an advisory screen verdict for a
          given tool (v1: REVIEW or UNVERIFIED - a semantic integrity check, not a safety
          clearance); the discovery path ranks an indexed catalog of MCP servers and
          returns picks with install commands. The catalog is rebuilt daily from an
          upstream source. The in-path gate (install via mcpindex-gate) is a separate
          path: it sits between host and server and can HOLD on contract drift.
        </p>
        <p>
          What you don&rsquo;t need to care about as a caller: which storage layer
          backs the catalog, where the refresh worker runs, what compute hosts the API.
          The contracts are the verdict endpoint (trust) and the recommendation endpoint
          (discovery); everything else is internal.
        </p>
      </Section>

      {/* §03 - Three ways to use it */}
      <Section number="03" title="Ways to use the directory">
        <p>
          Everything in this section is the <strong>advisory directory</strong> (discovery and
          trust lookups), <em>not</em> the in-path gate. If you came to install the gate, that is
          §01 above; <Mono>npm install -g mcp-server-mcpindex</Mono> below installs the directory
          client, not the gate. Pick the shape that matches where your agent lives.
        </p>

        <div
          className="rule-t rule-b rule-l rule-r border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-4 py-3"
          style={{ borderColor: 'var(--color-accent)' }}
        >
          <div
            className="font-mono text-[10.5px] uppercase tracking-[0.16em]"
            style={{ color: 'var(--color-accent)' }}
          >
            One call · pick + trust
          </div>
          <p className="mt-1.5 text-[14px] leading-[1.55]" style={{ color: 'var(--color-cite)' }}>
            <Mono>/api/v1/preflight?task=…</Mono> returns ranked recommendations plus the
            rank-1 server&rsquo;s advisory verdict in one round trip. Prefer that over
            separate recommend + trust calls when your agent is choosing a tool.
            Compare two servers via the MCP tool <Mono>compare_servers</Mono> (or multiple{' '}
            <Mono>/api/v1/server/…</Mono> fetches).
          </p>
          <pre className="mt-3 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-snug">
            <code>{`curl "https://mcpindex.ai/api/v1/preflight?task=read+pdf+to+s3"`}</code>
          </pre>
        </div>

        <UseCase
          letter="A"
          title="Direct HTTP API"
          who="For server-side agents, custom orchestrators, anything outside an MCP client."
          codeLines={[
            `# trust: advisory screen verdict (REVIEW/UNVERIFIED at v1)`,
            `curl "https://mcpindex.ai/api/v1/trust/server/<slug>"`,
            ``,
            `# screen: paste a description, get a live verdict (POST)`,
            `curl -X POST "https://mcpindex.ai/api/v1/screen" \\`,
            `  -H "content-type: application/json" \\`,
            `  -d '{"description":"Reads a file and returns its contents."}'`,
            ``,
            `# discovery: find a tool for a task`,
            `curl "https://mcpindex.ai/api/v1/recommend?task=read+pdf+to+s3"`,
            ``,
            `# pre-flight: discovery + the rank-1 server's verdict in one call`,
            `curl "https://mcpindex.ai/api/v1/preflight?task=read+pdf+to+s3"`,
            ``,
            `# search: full-text registry search (?q= required; &category= &limit= optional)`,
            `curl "https://mcpindex.ai/api/v1/search?q=postgres&limit=10"`,
            ``,
            `# diff: what changed in the registry since a date`,
            `curl "https://mcpindex.ai/api/v1/diff?since=2026-06-01"`,
            ``,
            `# server: the full record for one server by slug`,
            `curl "https://mcpindex.ai/api/v1/server/<slug>"`,
            ``,
            `# fleet drift query: has this tool's contract drifted? (crawler-corroborated)`,
            `curl "https://mcpindex.ai/api/v1/drift/any?fp=<tool_fingerprint>"`,
            ``,
            `# drift ledger: contract changes the crawler observed (fingerprint-only)`,
            `curl "https://mcpindex.ai/api/v1/ledger"`,
          ]}
          notes="trust returns a stored verdict (REVIEW or UNVERIFIED today; ALLOW / DENY are reserved in the contract); screen runs the live LLM judge on a pasted description and returns a fresh PARTIAL verdict; recommend returns ranked picks; preflight composes the two - the top servers plus the rank-1 server's advisory verdict in one round trip (verdict is null when that server is not yet screened - treat as not-cleared); search and diff query the registry; server returns one full record; drift/any answers whether a tool's contract drifted (crawler-corroborated; powers warns-you-on-call-1) and ledger lists the public drift record. All JSON, same shapes an MCP client gets."
        />
        <UseCase
          letter="B"
          title="Drop-in MCP server"
          who="For Claude Desktop, Cursor, Cline, Zed. Install once, the agent finds the rest from inside the loop."
          codeLines={[`npm install -g mcp-server-mcpindex`]}
          notes="The package is a thin client to the same API. Zero config in most clients - see the wiring step below."
        />
        <UseCase
          letter="C"
          title="Embedded in your platform"
          who="For platforms (Composio, Mastra, Toolhouse, IDE plays) that want MCP discovery as a feature."
          codeLines={[
            `// Server-side, your code:`,
            `const res = await fetch("https://mcpindex.ai/api/v1/recommend?task=" +`,
            `  encodeURIComponent(userTask));`,
            `const { recommendations } = await res.json();`,
          ]}
          notes="Using Mastra? npm i @mcp-index/mastra ships this advisory screen as a beforeToolCall hook (warn or enforce), no wiring. Attribution appreciated. Email hello@mcpindex.ai if you want a higher rate limit."
        />
        <UseCase
          letter="D"
          title="Embeddable verdict badge"
          who="For READMEs and server listings - a live SVG that always agrees with the verdict page."
          codeLines={[
            `<!-- Markdown (GitHub-style; extension-less, keys off Content-Type) -->`,
            `[![mcpindex](https://mcpindex.ai/api/v1/badge/<slug>)](https://mcpindex.ai/server/<slug>)`,
          ]}
          notes="The badge reads the same verdict the site pages and the trust API use, so the three never disagree. States are screened / flagged / review / re-check due, and a fail-closed gray not screened for an unknown slug - never green, never a fake pass, never a broken image."
        />
      </Section>

      {/* §04 - Wire it to your client */}
      <div id="wire-it-to-your-client" className="scroll-mt-20" />
      <Section number="04" title="What the directory client exposes">
        <p>
          The directory MCP client (<Mono>mcp-server-mcpindex</Mono>) is discovery +
          advisory trust - <em>not</em> the in-path gate (that is §01). Install it from{' '}
          <Ext href="/install">/install</Ext>: one-click for Cursor and VS Code, or pick your
          host for the exact command or config (Claude Desktop, Claude Code, Gemini CLI, Zed,
          Cline). Restart the client after wiring.
        </p>
        <p>
          Once installed, the six tools are available in any agent loop:{' '}
          <Mono>recommend_mcp_for_task</Mono>, <Mono>search_mcp_servers</Mono>,{' '}
          <Mono>get_install_command</Mono>, <Mono>compare_servers</Mono>,{' '}
          <Mono>check_tool_trust</Mono>, <Mono>assess_server</Mono>. Ask your agent
          something like &ldquo;find me an MCP server that can read PDFs and write to
          S3&rdquo; and watch it call <Mono>recommend_mcp_for_task</Mono> automatically.
        </p>
      </Section>

      {/* §05-06 - Tier-3 API depth; collapsed for scanability */}
      <div className="mt-14 space-y-6">
        <Disclose summary="05 · Anatomy of a response (JSON shapes)">
          <div className="space-y-4 text-[15px] leading-[1.6]">
        <p>
          The trust endpoints (<Mono>/api/v1/trust/server/…</Mono> and{' '}
          <Mono>/api/v1/trust/tool/…</Mono>) return the verdict: a decision
          (REVIEW or UNVERIFIED today; ALLOW / DENY are reserved in the contract, not produced at v1), the
          dimensions behind it with severity, the screen granularity (description-level
          today, tool-level for a few), a freshness window, and the honest limits shipped
          on every verdict. See one rendered on a{' '}
          <Ext href="/server/ai-moxt-mcp-workspace">server page</Ext> or in the{' '}
          <Ext href="/methodology">methodology</Ext>.
        </p>
        <pre className="overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[11.5px] leading-snug">
          <code>{`{
  "verdict_contract_version": "1.0.0",
  "subject": { "server_id": "community/quickpay-mcp", "tool_name": null },
  "status": "PARTIAL",              // EVALUATED | PARTIAL | STALE | ERROR
  "directive": "REVIEW",            // REVIEW/UNVERIFIED today; ALLOW/DENY reserved
  "granularity": "description-level",   // what was screened: "description-level" | "tool-level"
  "dimensions": [
    { "id": "mcpindex.integrity.description", "verdict": "PASS", "severity": "INFO" }
  ],
  "expires_at": "2026-06-07T00:00:00Z",   // re-screen after this; trust decays
  "honest_limits": [
    "conformance_monitored_not_enforced",
    "calibrated_false_v1",
    "advisory_deployment"
  ]
}`}</code>
        </pre>
        <p>
          A server that has not been screened returns the same shape, fail-closed:{' '}
          <Mono>status: &quot;ERROR&quot;</Mono>, <Mono>directive: &quot;UNVERIFIED&quot;</Mono>,
          empty <Mono>dimensions</Mono>, and an added{' '}
          <Mono>no_verdict_data_in_v1_advisory</Mono> honest limit. An agent must treat
          UNVERIFIED as fail-closed - never as permission to proceed.
        </p>
        <p className="text-[13.5px]" style={{ color: 'var(--color-mute)' }}>
          At v1 the screen produces only <Mono>REVIEW</Mono> (a semantic-only read) or{' '}
          <Mono>UNVERIFIED</Mono> (not yet on file). <Mono>ALLOW</Mono> and <Mono>DENY</Mono>{' '}
          are in the contract and the response shape, but a real <Mono>ALLOW</Mono> requires
          the behavioral conformance probe, which is gated to the D3 labeled-corpus milestone
          and has not run on the public corpus yet. Treat the example above as the illustrative
          shape, not the common case today.
        </p>
        <p>
          The recommendation endpoint (discovery) returns a tight JSON envelope. Three
          picks ranked by composite score, each with reasoning, install commands per
          registry type, and the live MCP Quality Score.
        </p>
        <pre className="overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[11.5px] leading-snug">
          <code>{`{
  "task": "read pdf and save to s3",
  "recommendations": [
    {
      "rank": 1,                                  // composite-rank position (1-3)
      "slug": "io-github-foo-pdf-mcp",            // url-safe ident, used in the per-server page
      "name": "io.github.foo/pdf-mcp",            // canonical registry name
      "title": "PDF Tools MCP Server",            // display name
      "description": "Generate PDF from HTML…",   // one-line description from the registry
      "category": "docs",                         // inferred category (28 total)
      "qualityScore": 95,                         // 0-100, see /methodology
      "reasoning": "Matches \\"pdf\\" in docs-category server.",  // why it ranked
      "installs": {
        "npm": "@foo/pdf-mcp",                    // present if registry has an npm package
        "pypi": null,
        "docker": null,
        "remote": null                            // present if registry has a remote URL
      },
      "url": "https://mcpindex.ai/server/io-github-foo-pdf-mcp"
    },
    /* … 2 more ranked picks … */
  ],
  "note": "v0 ranker - heuristic score blends keyword match (70%) with MCP Quality Score (30%). See /methodology."
}`}</code>
        </pre>
          </div>
        </Disclose>

        <Disclose summary="06 · Limits + API guarantees">
          <ul className="space-y-3 text-[15px] leading-[1.6]">
          <Limit
            label="Rate"
            body="60 requests / minute / IP across /api/v1/*, free, no key, same limit for everyone. The live screen endpoint (/api/v1/screen) is tighter - 10 / minute / IP plus a global daily ceiling, since each call runs an LLM. 429 with Retry-After when exceeded. Email hello@mcpindex.ai if a real integration needs more."
          />
          <Limit
            label="Schema stability"
            body={
              <>
                <Mono>/api/v1/*</Mono> is versioned. Breaking changes ship behind{' '}
                <Mono>/api/v2</Mono>; v1 stays available for at least 6 months after v2
                lands. Field additions are not breaking and ship to v1.
              </>
            }
          />
          <Limit
            label="Cache"
            body="Responses are cached at the edge with stale-while-revalidate fallback. Repeat queries within minutes are essentially free; the first call after a cache miss adds modest latency."
          />
          <Limit
            label="Fallback"
            body={
              <>
                If the API is unreachable, fall back to <Mono>/llms.txt</Mono> and{' '}
                <Mono>/llms-full.txt</Mono> for static reference data. The MCP server
                package surfaces a clear error to the agent rather than fabricating
                results.
              </>
            }
          />
          <Limit
            label="Data freshness"
            body="Catalog rebuilt nightly. Integrity checks reject obviously partial refreshes before they go live. Worst-case staleness: 24 hours."
          />
          <Limit
            label="Authentication"
            body="None - every endpoint is public and free, same rate limit for everyone. Multi-tenant deployments have their own tenant-identity mechanism (see /whitepaper), unrelated to API rate limits."
          />
          </ul>
        </Disclose>
      </div>

      {/* §07 - How this compares */}
      <Section number="07" title="How this compares">
        <p>
          Five common ways an agent (or developer) finds an MCP server today. mcpindex.ai
          is the only one that hits all four traits an agent at inference time actually
          needs.
        </p>

        <div className="mt-4 site-table-wrap rule-t rule-b rule-l rule-r">
          <table
            className="w-full min-w-[640px] sm:min-w-0 border-collapse text-[13.5px]"
            style={{ color: 'var(--color-cite)' }}
          >
            <thead>
              <tr
                className="text-left"
                style={{ borderBottom: '1px solid var(--color-rule)' }}
              >
                <Th label="Method" />
                <Th label="Agent-callable" align="center" />
                <Th label="Ranked picks" align="center" />
                <Th label="Install-ready" align="center" />
                <Th label="Stays current" align="center" />
              </tr>
            </thead>
            <tbody>
              <Row
                method="mcpindex.ai"
                methodNote="recommendation API + drop-in MCP server"
                isPrimary
                cells={[
                  { value: 'yes', tone: 'pos' },
                  { value: 'yes', tone: 'pos', note: 'composite score' },
                  { value: 'yes', tone: 'pos', note: 'per-client config' },
                  { value: 'daily', tone: 'pos' },
                ]}
              />
              <Row
                method="Anthropic official registry"
                methodNote="registry.modelcontextprotocol.io"
                cells={[
                  { value: 'yes', tone: 'pos', note: 'raw HTTP' },
                  { value: 'no', tone: 'neg', note: 'paginated list' },
                  { value: 'partial', tone: 'mid', note: 'in payload' },
                  { value: 'live', tone: 'pos' },
                ]}
              />
              <Row
                method="Human directories"
                methodNote="PulseMCP · Smithery · Glama · MCP.so"
                cells={[
                  { value: 'no', tone: 'neg', note: 'browsing UX' },
                  { value: 'partial', tone: 'mid', note: 'hand-curated' },
                  { value: 'partial', tone: 'mid' },
                  { value: 'daily', tone: 'pos' },
                ]}
              />
              <Row
                method="awesome-mcp-servers (GitHub)"
                methodNote="punkpeye/awesome-mcp-servers"
                cells={[
                  { value: 'no', tone: 'neg' },
                  { value: 'no', tone: 'neg', note: 'flat list' },
                  { value: 'varies', tone: 'mid' },
                  { value: 'weekly', tone: 'mid', note: 'PR-driven' },
                ]}
              />
              <Row
                method="Ask the LLM directly"
                methodNote='e.g. "Claude, what MCP servers exist for X?"'
                cells={[
                  { value: 'yes', tone: 'pos' },
                  { value: 'no', tone: 'neg', note: 'hallucination-prone' },
                  { value: 'no', tone: 'neg' },
                  { value: 'training cutoff', tone: 'neg' },
                ]}
              />
            </tbody>
          </table>
        </div>

        <p className="mt-6">
          The honest framing: the table above is the discovery axis. mcpindex.ai sits on
          top of the Anthropic registry for discovery, not as a replacement; the registry
          is the canonical source of truth. The reason mcpindex exists is the second axis
          these tools don&rsquo;t have at all: an in-path gate that pins each tool contract
          and HOLDs the call when it silently drifts - plus an advisory screen so you can
          check a description before you wire the server.
        </p>

        <p className="text-[13.5px]" style={{ color: 'var(--color-mute)' }}>
          Footnote on &ldquo;ranked picks&rdquo;: the registry returns servers in
          publication order; PulseMCP and Smithery offer hand-curated featured
          collections but no programmatic per-task ranking. mcpindex.ai computes a
          composite score (search match × MCP Quality Score) per request - see{' '}
          <Ext href="/methodology">/methodology</Ext> for the algorithm.
        </p>
      </Section>

      {/* §08 - Where to next */}
      <Section number="08" title="Where to next">
        <ul className="space-y-1.5 text-sm">
          <li>
            <Ext href="/api/v1/recommend?task=postgres+with+read+only+mode">
              /api/v1/recommend
            </Ext>{' '}
            - try the API live with any natural-language task
          </li>
          <li>
            <Ext href="/screen">/screen</Ext> - paste a tool description and watch the
            live LLM judge return a verdict
          </li>
          <li>
            <Ext href="/methodology">/methodology</Ext> - open MCP Quality Score
            methodology, source on GitHub
          </li>
          <li>
            <Ext href="/leaderboard">/leaderboard</Ext> - top 50 servers ranked by
            Quality Score
          </li>
          <li>
            <Ext href="/changelog.rss">/changelog.rss</Ext> - RSS feed of new servers
            indexed each day
          </li>
          <li>
            <Ext href="https://github.com/mcpindex-ai/mcpindex-web/tree/main/mcp-server-mcpindex">
              github.com/mcpindex-ai/mcpindex-web/…/mcp-server-mcpindex
            </Ext>{' '}
            - npm package source, MIT
          </li>
        </ul>
        <p
          className="mt-6 text-xs"
          style={{ color: 'var(--color-mute)' }}
        >
          Found a gap, a typo, or a wiring question that isn&rsquo;t answered here?{' '}
          <a
            href="mailto:hello@mcpindex.ai"
            className="underline hover:no-underline"
            style={{ color: 'var(--color-accent)' }}
          >
            hello@mcpindex.ai
          </a>
          .
        </p>
      </Section>
    </article>
  );
}

/* ─── Layout primitives ───────────────────────────────────────── */

function Section({
  title,
  children,
}: {
  number?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <div className="border-t pt-6" style={{ borderColor: 'var(--color-rule)' }}>
        <h2
          className="text-[22px] tracking-tight font-medium"
          style={{ color: 'var(--color-ink)' }}
        >
          {title}
        </h2>
      </div>
      <div
        className="mt-3 space-y-4 text-[15px] leading-[1.6]"
        style={{ color: 'var(--color-cite)' }}
      >
        {children}
      </div>
    </section>
  );
}

function UseCase({
  letter,
  title,
  who,
  codeLines,
  notes,
}: {
  letter: string;
  title: string;
  who: string;
  codeLines: string[];
  notes?: string;
}) {
  return (
    <div
      className="rule-t pt-5"
      style={{ borderColor: 'var(--color-rule)' }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ fontFamily: FONT_MONO, color: 'var(--color-accent)' }}
        >
          {letter}
        </span>
        <h3
          className="text-[16px] tracking-tight font-semibold"
          style={{ color: 'var(--color-ink)' }}
        >
          {title}
        </h3>
      </div>
      <p
        className="mt-1 text-[14px] leading-[1.55]"
        style={{ color: 'var(--color-mute)' }}
      >
        {who}
      </p>
      <pre className="mt-3 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-snug">
        <code>{codeLines.join('\n')}</code>
      </pre>
      {notes && (
        <p
          className="mt-2 text-[13px] leading-[1.5]"
          style={{ color: 'var(--color-mute)' }}
        >
          {notes}
        </p>
      )}
    </div>
  );
}

function Limit({
  label,
  body,
}: {
  label: string;
  body: React.ReactNode;
}) {
  return (
    <li className="row-kv">
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.16em] pt-0.5"
        style={{ fontFamily: FONT_MONO, color: 'var(--color-ink)' }}
      >
        {label}
      </span>
      <p className="text-[14.5px] leading-[1.55]" style={{ color: 'var(--color-cite)' }}>
        {body}
      </p>
    </li>
  );
}

function Th({ label, align }: { label: string; align?: 'center' | 'left' }) {
  return (
    <th
      className="px-2 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.16em]"
      style={{
        fontFamily: FONT_MONO,
        color: 'var(--color-mute)',
        textAlign: align ?? 'left',
      }}
    >
      {label}
    </th>
  );
}

type Tone = 'pos' | 'mid' | 'neg';
type CellSpec = { value: string; tone: Tone; note?: string };

function Row({
  method,
  methodNote,
  isPrimary,
  cells,
}: {
  method: string;
  methodNote: string;
  isPrimary?: boolean;
  cells: CellSpec[];
}) {
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--color-rule)',
        backgroundColor: isPrimary ? 'var(--color-accent-soft)' : 'transparent',
      }}
    >
      <td className="px-2 py-3 align-top">
        <div
          className="font-semibold text-[13.5px]"
          style={{ color: 'var(--color-ink)' }}
        >
          {method}
        </div>
        <div
          className="mt-0.5 text-[10.5px]"
          style={{ fontFamily: FONT_MONO, color: 'var(--color-mute)' }}
        >
          {methodNote}
        </div>
      </td>
      {cells.map((c, i) => (
        <Cell key={i} {...c} />
      ))}
    </tr>
  );
}

function Cell({ value, tone, note }: CellSpec) {
  const color =
    tone === 'pos'
      ? 'var(--color-accent)'
      : tone === 'neg'
        ? '#9a3412'
        : 'var(--color-cite)';
  const symbol = tone === 'pos' ? '✓' : tone === 'neg' ? '·' : '~';
  return (
    <td className="px-2 py-3 text-center align-top">
      <div
        className="text-[14px] font-semibold"
        style={{ color, fontFamily: FONT_MONO }}
      >
        <span aria-hidden className="mr-1">
          {symbol}
        </span>
        {value}
      </div>
      {note && (
        <div
          className="mt-0.5 text-[10px]"
          style={{ fontFamily: FONT_MONO, color: 'var(--color-mute)' }}
        >
          {note}
        </div>
      )}
    </td>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="text-[12.5px]"
      style={{ fontFamily: FONT_MONO, color: 'var(--color-ink)' }}
    >
      {children}
    </code>
  );
}

function Ext({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const isExternal = href.startsWith('http');
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
      className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
      style={{ color: 'var(--color-cite)' }}
    >
      {children}
    </a>
  );
}
