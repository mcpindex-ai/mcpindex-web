# Changelog

All notable changes to `mcp-server-mcpindex` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
