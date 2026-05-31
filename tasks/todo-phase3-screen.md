# Phase 3 — Live "screen any tool" demo (/api/v1/screen)

**Stage: MVP.** First interactive runtime feature: the belief moment ("paste a tool
description, watch it get caught") + the (consented) corpus flywheel. Deliberately skip:
auth, multi-region rate-limit, heavy bot defense, paid tiers.

## Goal
A homepage demo where a visitor pastes/picks an MCP tool description and gets a live judge
finding (flagged line highlighted), backed by a new `/api/v1/screen` route that calls the
Groq judge. Honest by construction: advisory, no calibrated ALLOW.

## Architectural decisions (NEED APPROVAL — picks marked)

### AD-1. Paste logging vs the privacy promise  **← YOUR CALL (the real fork)**
Privacy page promises we don't persist task descriptions sent to /api/v1/*. The flywheel wants
to capture pastes. Options:
- (A) **No persistence at all** — live screen only; honors the promise verbatim; no flywheel
  harvest from the demo. Zero privacy change.
- (B) **Opt-in contribution (recommended)** — default no-persist; an explicit unchecked
  "Contribute this example to improve detection" box. Only checked pastes are stored
  (description + verdict, no IP/PII). Update the privacy page to scope this exception.
- (C) Persist all pastes — REJECTED: breaks the stated promise; off-brand for a trust product.
- **Pick: (B).** Preserves the promise, still grows the corpus from consented examples.
- **Tradeoff:** smaller flywheel than silent harvesting — correct trade for a trust brand.

### AD-2. Where the live judge runs  **← decided**
GroqJudge is Python (mcpindex-trust); the Next route can't import it. Pick: **TS route calls
Groq directly**, mirroring the frozen system prompt + model (`llama-3.3-70b-versatile`) from
providers.py. Document the mirror + that it must stay in sync with the canonical judge.
Tradeoff: prompt duplication across repos (drift risk) — acceptable for an advisory demo;
note the canonical source in a comment.

### AD-3. Output shape  **← decided**
Extend the screen prompt to return `{malicious, reason, quote}` where `quote` = the verbatim
offending line, so the UI can highlight it (the canonical judge returns only malicious+reason).
Map to the same advisory surface: never ALLOW; flagged → REVIEW + the highlighted span.

### AD-4. Rate-limit + abuse + cost  **← decided**
Rely on the existing proxy.ts per-IP /api/v1/* limit + a hard request cap: max description
length (~8KB, mirrors judge schema truncation), reject empties, POST only. Add an Upstash-backed
per-IP/day cap ONLY if abuse appears (Upstash is in deps; defer wiring for MVP).
Tradeoff: in-memory proxy limit is per-instance (serverless) — weak but present; length cap +
Groq's own limits bound cost for MVP.

### AD-5. Groq key in Vercel  **← decided (user action)**
Route reads `MCPINDEX_GROQ_API_KEY` server-side. User adds it to Vercel prod env (self-serve;
secret can't transit the agent). Route is **fail-closed**: no key → 503 "screening unavailable"
(never a fake pass). So deploying before the key is set is safe.

## Plan (checkable)  — BUILT + REVIEWED 2026-05-30 (not yet pushed)
- [x] `lib/screen.ts`: Groq judge call, frozen-prompt mirror + `quote` extension,
      {malicious,reason,quote} parse, fail-closed on every error path.
- [x] `app/api/v1/screen/route.ts`: POST {description, contribute?}; 8KB length-cap (413),
      validate (400), advisory finding shape (PARTIAL/REVIEW, never ALLOW), 503 fail-closed.
- [x] Contribution store: opt-in only (contribute===true) -> console.log [screen-contribution]
      (no IP/PII), inspectable in Vercel logs. (Upstash/dedicated store = later upgrade.)
- [x] Demo UI: new `components/ScreenDemo.tsx` — textarea + example chips (poisoned/benign),
      opt-in checkbox (default UNCHECKED), highlighted flagged-line, integrity!=safety framing.
      Mounted on homepage as §02 "Screen a tool" (sections renumbered §02..§05).
- [x] Privacy page: scoped opt-in-contribution clause added.
- [x] SECURITY-AUDITOR: SHIP, 0 HIGH. (LOW: per-instance rate limit, unscrubbed contribution
      log, off-Vercel IP fallback.) Credential/fail-closed/SSRF/privacy-match all PASS.
- [x] Verified: tsc clean; build ok (/api/v1/screen dynamic); LIVE local test with key —
      poisoned -> FAIL+verbatim quote, benign -> PASS, missing -> 400, too-long -> 413.
- [x] Post-verification review: SHIP, 0 HIGH/MEDIUM. 3 LOW FIXED (textarea label assoc,
      aria-live on results, response type-guard) + added "avoid pasting secrets" hint.
- [x] CLOSED + LIVE-CONFIRMED 2026-05-30: lib/ratelimit.ts — Upstash-backed shared per-IP limit
      (10/min) + global daily Groq ceiling (5000/day circuit-breaker), fail-open if Upstash
      unconfigured/errors. Wired before the Groq call -> 429. Upstash provisioned via Vercel
      Marketplace (KV_* creds; code reads both KV_*/UPSTASH_*). Prod burst test: 10x200 + 2x429
      scope:ip = cap enforcing. NOTE: needed a fresh deploy (empty commit 6741816) to BIND the
      creds — env vars apply at deploy time, integration did not auto-redeploy.
- [x] CLOSED: x-forwarded-for spoofing — Vercel docs confirm Vercel OVERWRITES the header and
      does not forward external IPs (no spoofing on Vercel, non-Enterprise). IP-trust holds.
- [x] DONE: MCPINDEX_GROQ_API_KEY set in Vercel Production; Phase 3 merged to main (014cdff) +
      pushed; deploy verifying live.
- [ ] USER TO CONFIRM: Groq key is scoped Production-only (NOT Preview/All) so preview deploys
      fail-closed (no preview backdoor to Groq spend). Optional: enable preview Deployment Protection.
- [ ] NOTE: Upstash rate-limit only enforces if UPSTASH_REDIS_REST_URL/TOKEN are set in Vercel;
      otherwise it fails open to proxy.ts. Confirm those env vars exist for the global cap to bite.

## Out of scope
Auth, paid tiers, Upstash rate-limit wiring (unless abused), multi-language judge, the
deterministic conformance leg.
