# Changelog

All notable changes to `mcp-server-mcpindex` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.5] - 2026-07-12

### Changed

- **Honesty copy for the advisory screen vs in-path gate.** `check_tool_trust` tool description now states v1 produces REVIEW/UNVERIFIED only (ALLOW/DENY reserved) and that this package is the directory client — not `mcpindex-gate`. Package description and README integration example match: REVIEW/UNVERIFIED first; ALLOW/DENY kept as reserved contract branches.

## [0.3.3] - 2026-06-08

### Changed

- **Recommended install now rides `@latest`.** The docs wire `npx -y mcp-server-mcpindex@latest` so the host fetches the newest discovery server on each restart — no manual upgrade step. This server is the *advisory* recommender (`recommend_mcp_for_task` / `check_tool_trust` / `assess_server`), **not** the in-path drift gate, so it carries no version pin (the gate, `mcpindex-gate`, stays pinned + notify-only on purpose). The startup update notice already prints the exact `npm i -g …@latest` command for anyone who pins.

## [0.3.2] - 2026-06-08

### Changed

- **Update notice is now stderr-only.** Removed the MCP `notifications/message` (`sendLoggingMessage`) from the update-notice path — it was redundant with the stderr line and hosts render it inconsistently (Cursor logged it as a bare ` undefined`). stderr is the universal channel every host (Cursor, Claude Desktop, Claude Code, Gemini CLI) surfaces in its per-server log, so nothing a host actually displayed is lost. Supersedes the 0.3.0 dual-channel behavior.
- The `logging` server capability is **no longer declared** (it existed only to deliver that notification); the server now advertises `tools` only.

## [0.3.1] - 2026-06-08

### Changed

- **No functional change.** Published to validate the 0.3.0 startup update-notice end-to-end in a live host (Cursor/Claude Desktop): a client running an older version now sees `0.3.0 -> 0.3.1 available` in the host's MCP log (the notice rides stderr, which the host surfaces). Confirms the notify-only update path works in the real environment.

## [0.3.0] - 2026-06-08

### Added

- **Update notice on startup.** After the server connects, it does a best-effort check against the npm registry and, if a newer version is published, prints one advisory line to stderr and (if the host enabled MCP logging) sends a `notifications/message` the host may render — including the reminder to **restart your MCP host to load the new version**. The check is time-boxed (~2.5s), fail-silent on any error, fire-and-forget (it can never delay or crash startup), sends no telemetry beyond the standard registry GET, and never follows a redirect off the pinned registry host. Opt out with `MCPINDEX_NO_UPDATE_CHECK=1`.

### Changed

- **The running version is now read from `package.json`** instead of a hardcoded constant (which had drifted to `0.2.1` while the package was `0.2.2`), so the User-Agent and the update check always reflect what npm actually shipped.
- The `logging` server capability is now declared (required to deliver the update notice as an MCP notification).

### Internal

- New `src/update-check.mjs` (pure, injected-`fetch`, unit-tested) + `test/update-check.test.mjs`. `npm run build` now syntax-checks it too.

## [0.2.2] - 2026-05-31

### Changed

- **Repository metadata now points at the monorepo source.** `repository` is `mcpindex-ai/mcpindex-web` with `"directory": "mcp-server-mcpindex"` (the npm-standard convention for a package whose source lives in a monorepo subdirectory), and `bugs` points at that repo's issues. The previously-linked standalone repo `mcpindex-ai/mcp-server-mcpindex` was an orphaned `0.1.0` snapshot (pre-trust, no `trust.mjs`); it has been archived in favor of a single source of truth. No code change - `npm install` behaves identically to `0.2.1`.

### Added

- **`npm run release`** - one-command release (syntax check, tests, CHANGELOG-entry assertion, version, publish, tag) so the source-to-npm step can no longer drift by being done by hand.
- **`npm run check-published`** - fails when the in-tree version is ahead of the published npm version (catches "edited but forgot to publish").

## [0.2.1] - 2026-05-29

### Fixed

- **HTTP `User-Agent` header was pinned to a stale literal `"mcp-server-mcpindex/0.1.0"`** in one code path (`src/index.mjs` `api()` helper), while every other call site interpolated `PKG_VERSION`. Result: outbound discovery requests reported `0.1.0` and trust-verdict calls reported `0.2.0` from the same package version. Now uses `` `mcp-server-mcpindex/${PKG_VERSION}` `` consistently. Affects upstream analytics + rate-limit bucketing if mcpindex.ai ever keys on UA.

## [0.2.0] - 2026-05-28

### Added

- **`check_tool_trust(server_id, tool_name)` MCP tool.** Pre-invocation advisory trust verdict for a specific tool on an MCP server. Returns the v1 verdict contract (directive, status, dimensions, freshness, honest_limits). Fail-CLOSED: returns `UNVERIFIED` + `status: ERROR` when the upstream endpoint is unreachable, returns 404, times out, or returns malformed data. Never coerces to ALLOW.
- **`assess_server(server_id)` MCP tool.** Aggregated pre-flight verdict across all tools on a server. Same verdict shape as `check_tool_trust`. Use for "is THIS server worth integrating?" decisions.
- **`src/trust.mjs` library export.** The trust client is exported as a plain ES module (`checkToolTrust`, `assessServer`, `VERDICT_CONTRACT_VERSION`, `V1_HONEST_LIMITS`) so non-MCP consumers can call it directly.
- **Verdict contract version pin.** `verdict_contract_version: "1.0.0"` is included on every verdict response.
- **v1 honest limits floor.** Every verdict ships with at least `conformance_monitored_not_enforced`, `calibrated_false_v1`, and `advisory_deployment` in `honest_limits`. Upstream cannot remove the floor.
- **README integration guide.** Worked example of wrapping `check_tool_trust` as a pre-invocation gate (LangChain / DSPy / Mastra / Composio / raw LLM-tool-call style), including the fail-CLOSED handling for UNVERIFIED.
- **Test suite.** `node --test test/trust.test.mjs`. Covers the fail-CLOSED invariant (unreachable, 404, timeout, malformed payload, missing args), the happy-path verdict shape, dimension normalization, unknown-directive downgrade, and the honest_limits floor.
- **npm scripts.** `npm run build` (syntax check) and `npm test`.

### Changed

- Package description updated to mention the advisory trust verdicts.
- Embedded server version bumped to `0.2.0`.

### Notes for integrators

`check_tool_trust` is **v1 advisory**. Conformance is monitored, not enforced. The verdict is a recommendation; the agent (or the human reviewing the agent) is the decision-maker. Never treat UNVERIFIED as ALLOW.

## [0.1.0] - 2026-04-30

### Added

- Initial release. Tools: `recommend_mcp_for_task`, `search_mcp_servers`, `get_install_command`, `compare_servers`.
- Stdio MCP transport via `@modelcontextprotocol/sdk`.
- Backend defaults to `https://mcpindex.ai`; override with `MCPINDEX_API_BASE`.
