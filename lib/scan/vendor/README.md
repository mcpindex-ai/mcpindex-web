# Vendored classifier (do not edit logic here)

These files are copied **verbatim** from `@mcp-index/sdk`
(`mcpindex-trust/clients/ts/src/`) so the `/scan` tool can run the gate's own
blast-radius classifier **entirely in the browser** without pulling the SDK's
`@modelcontextprotocol/sdk` peer dependency or any node-only code into the client
bundle.

| file | source | sha1 (src @ ead501e) |
|------|--------|----------------------|
| `lexicon.ts` | sdk `src/lexicon.ts` | 1517d4ab |
| `risk.ts` | sdk `src/risk.ts` | bc550ec0 |
| `actionClass.ts` | sdk `src/actionClass.ts` | 816f13fe |
| `preflight-types.ts` | subset of sdk `src/preflight.ts` | (2 types) |

**Only deviations from source:** (1) import extensions stripped (`./risk.js` ->
`./risk`) for the web's `moduleResolution: bundler`; (2) `actionClass.ts` omits
`actionClassificationEnabled` / `classifyToolDef` (they read `process.env`; the web
tool calls `classify()` directly, so the feature is always-on here). No logic changed.

**The SDK is the source of truth.** `lib/scan/scan.test.ts` pins the classifier
output against known vectors; if the SDK grading changes, that test fails and these
files must be re-copied. To re-vendor: re-run the three `cp` commands and re-apply the
two deviations above.
