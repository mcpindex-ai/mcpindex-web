// The public verdict-contract version, and the single place it is declared.
//
// It used to be a bare '1.0.0' literal repeated across seven emitters (the two trust
// routes' hit and miss branches, /screen, /preflight, the well-known descriptor, and the
// docs example). Seven copies of a number that must move together is a version bump that
// half-lands: consumers would see 1.1.0 on one endpoint and 1.0.0 on the next and have no
// way to tell which described the rules they got. Dependency-free on purpose so every
// emitter can import it without pulling the verdict store's module graph.
//
// SEMANTICS, and what a bump means to a consumer:
//   MAJOR - a field changed shape, disappeared, or a value's meaning inverted. Re-read the
//           contract before parsing.
//   MINOR - the response shape is unchanged and existing parsers keep working, but a
//           documented BEHAVIOUR moved. Re-read the field notes for anything you branch on.
//   PATCH - clarifications only; no behaviour a consumer could observe.
//
// 1.1.0 (2026-08-04) - `expires_at` refresh semantics.
//   Was: "screen time + 30 days", stamped once and never renewed, so a verdict aged out
//   even when the server it describes had not changed at all.
//   Now: "last confirmation + 7 days". We re-derive, on every render, whether the
//   description currently published still matches the one the screen judged; when it does
//   and the record was produced under the current screen policy, the window rolls forward
//   and `honest_limits` carries `freshness_confirmed` so the reason is machine-readable.
//   Shape is untouched: same fields, same types. This is MINOR rather than MAJOR because
//   nothing a client parses changed - but it is not PATCH, because the published
//   integration guidance tells integrators to refuse a verdict whose `expires_at` has
//   passed, and that gate now fires far less often. An integrator who wrote that rule is
//   entitled to notice the change rather than discover it.
//
// The npm client (mcp-server-mcpindex) declares its OWN copy of this constant and stamps
// it on its own output rather than validating ours, so it cannot break on a server-side
// bump - but it will keep reporting 1.0.0 until it is republished. Its responses stay
// shape-compatible, so that lag is cosmetic, not a correctness problem.
export const VERDICT_CONTRACT_VERSION = '1.1.0';
