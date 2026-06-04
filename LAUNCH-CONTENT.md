# LAUNCH CONTENT — publish on go-live only

This branch (`eval/web-demo`) carries the **launch-state** re-frame of mcpindex.ai.
It is written for the state where everything BUILT is DEPLOYED + LIVE. Per the
value-prop-bible PUBLISH-COUPLING rule, it ships **in lockstep with the deploy** —
it does NOT go live on mcpindex.ai until GB's explicit go.

## Framing (authoritative source: ~/mcpindex-launch/value-prop-bible.md)

- **(A) DEPLOY-HELD → present tense.** The one-click install (`install.sh` / uvx /
  `.mcpb`), the full tiered ladder (tier-0 deterministic contract-diff → tier-1
  cloud corpus lookup → tier-2 LLM consult → tier-3 behavioral verifier), the
  HTTP/gateway path, multi-tenant/Pro/Enterprise, and the conformance probe are
  code-complete and described as LIVE.
- **(B) MATURITY-HELD → kept honest.** Deploying does NOT make these true:
  the verdict is a contract-diff, not a safety oracle; `calibrated=false` until
  calibrated; D3 graduation stays `pre_graduation` (15/150); conformance is
  monitored, not enforced; the directory screen stays advisory/semantic-only;
  the behavioral tier CLEARS or REFUTES a change, it never proves a tool safe.

## Honesty guard

`scripts/check-graduation-honesty.mjs` is reconciled to launch-state: it still
forbids the (B) over-claims (enforcement, graduation flips, "safe"/"blocks
attacks"/"tamper-proof", `calibrated=true`, behavioral-tier-proves-safety) and
now ALLOWS the (A) present-tense capability claims. It runs in `npm run build`.

**Do not** flip robots/deploy config from this note alone — publication is
coupled to the deploy, gated on GB's go.
