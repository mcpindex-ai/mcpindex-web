# Scope B — Filesystem Evidence Surface (mcpindex.ai)

**Stage: MVP.** First real product surface for the evidence reframe. One category (filesystem),
hand-reviewed depth, real judge output. Deliberately NOT production: no cron pipeline, no
multi-category automation, no auth tiers, no calibrated directives. We are proving the
evidence model + distribution on one category before generalizing.

## Goal (one sentence)
Turn the filesystem slice of mcpindex.ai from a quality-score directory into an evidence
surface: every filesystem server page and `/best/filesystem` shows the REAL `cited_span`
findings from the existing LLM judge, the homepage demo catches a filesystem tool live, and
the site stops claiming "both legs execute."

## Strategy context (settled in prior turns — do not relitigate here)
- Primitive = **evidence, not verdict.** Show the manipulative line; do NOT render a confident
  ALLOW from an uncalibrated judge (`calibrated=false` is in the contract).
- Seed category = **filesystem** (max demand × max poison-risk × most legible: "reads ~/.ssh").
- Honesty gate is load-bearing: this is a trust product; an overclaim is fatal.
- Kill criteria (post-ship, not part of build): `/best/filesystem` flat organic/LLM-citation
  traffic in 60d AND <30 demo pastes/week → timing thesis wrong, fall back to pure directory.

---

## Architectural decisions (NEED APPROVAL — picks marked, tradeoffs stated)

### AD-1. Evidence granularity: server-description vs tool-level  **← YOUR CALL**
- **Options:**
  - (A) **Server-description screen** — run the judge on each server's `description` field
    (already in `snapshot.json`). No probing. Coarser: judges marketing copy, not the tool
    descriptions where poison actually hides.
  - (B) **Tool-level screen** — probe each filesystem server (handshake → list tools), judge
    each tool's `description` + `input_schema`. Matches the real threat model (tool-poisoning
    lives in `read_file`/`write_file` tool descriptions). Uses the existing `corpus_eval`
    probe path. Cost: some servers won't connect; operational probing of 20-30 servers.
- **Pick: (B) tool-level**, with (A) as automatic fallback for unreachable servers (clearly
  labeled "description-only screen, tools not reachable"). The product claim is about tool
  descriptions lying; a server-description-only screen would undercut the whole pitch.
- **Tradeoff accepted:** more upfront infra (reuse probe harness) and some servers render a
  weaker "description-only" finding. Worth it for threat-model fidelity.

### AD-2. Verdict store shape & location  **← my call, flag if you disagree**
- **Options:** single `data/verdicts.json` (slug→verdict map) vs per-server files
  `data/verdicts/<slug>.json`.
- **Pick:** single `mcpindex/data/verdicts.json`, keyed by slug, mirroring how `snapshot.json`
  is read once at build. Tiny for 20-30 seeds; scales to thousands fine. Loader reads it in
  `loadVerdictForServer()`.
- **Tradeoff:** larger single file later; revisit to per-file at >~2k verdicts. Fine for MVP.

### AD-3. Status & directive honesty mapping  **← my call, flag if you disagree**
- Real findings today are **integrity-only** (LLM judge); conformance leg NOT populated to web.
- **Pick:**
  - `status: 'PARTIAL'` for every seeded verdict (integrity ran, conformance did not). This is
    the honest contract value — never `EVALUATED`.
  - **Do not emit `ALLOW`.** `directive.decision` = `REVIEW` uniformly (advisory), with the
    rationale stating "semantic screen only; conformance not run; not calibrated."
  - **Severity drives the surface**, not the directive: benign integrity → "No manipulation
    pattern detected (semantic screen)"; suspicious → "⚠ Manipulation pattern found" + the
    `cited_span` quoted. The cited_span is the hero; the directive is muted.
- **Tradeoff:** no satisfying green "ALLOW" badge. Correct — that badge would be the overclaim
  we're killing.

### AD-4. Demo data source (live vs precomputed)  **← my call, flag if you disagree**
- **Pick:** demo reads from a curated set of ~6-10 filesystem examples (mix of benign + the
  poisoned `read_file`/`.ssh` class) precomputed into the verdict store, AND accepts
  paste-your-own which calls the judge live via a new `/api/v1/screen` route (rate-limited,
  no key). Precomputed = instant, reliable belief moment; paste-your-own = the corpus flywheel.
- **Tradeoff:** a live judge route adds a Groq-cost surface + abuse vector. Rate-limit hard
  (per-IP), cap description length (contract already bounds 200k), no persistence of pastes in
  MVP beyond an append-only log for corpus review. Security-auditor must review this route.

---

## Plan (checkable)

### Phase 0 — Day-0 honesty fix (ship-independent, do FIRST)  ✅ DONE 2026-05-30
- [x] Replace "Both legs execute and are recorded" in all 6 locations:
  `app/page.tsx:49`, `app/server/[slug]/page.tsx:486-487`, `app/methodology/page.tsx`,
  `app/about/page.tsx`, `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`.
  Honest framing landed: LLM judge runs today; conformance probe in build; findings
  semantic-only, labeled PARTIAL.
- [x] Fix hardcoded `3,510 servers` in `components/AgentDemo.tsx:141` → `serverCount` prop
  wired from `getServerCount()` in `app/page.tsx`.
- [x] Verify: grep zero "Both legs execute"; grep zero "3,510"; no em-dash; `tsc --noEmit` exit 0.
  (Uncommitted — commit on request.)

### Phase 1 — Evidence pipeline (mcpindex-trust → store)  IN PROGRESS
NOTE: catalog gut-check (2026-05-30) found the official registry excludes the popular
filesystem servers and its long tail is low-signal; user acknowledged and chose to build
the seed anyway. Granularity decision: ship DESCRIPTION-LEVEL screen first (zero untrusted
code execution), deepen to tool-level later (remote via HTTP, local via container).
- [x] Identify genuine filesystem servers (clean filter, not the "directory" categorizer bug):
  34 servers → `mcpindex-trust/scripts/filesystem_targets.json` (5 remote-http, 20 stdio-npm,
  8 stdio-pypi, 1 docker). Slugs match `slugify()`.
- [~] AD-1(B) tool-level probe: DEFERRED to increment 2 (needs container for local-exec).
  Increment 1 = description-level (server description as judge input), zero exec.
- [x] Runner written + wiring verified: `mcpindex-trust/scripts/seed_filesystem.py`
  (frozen GroqJudge, throttled, AD-3 honesty remap baked in). Imports + key-gate smoke pass.
- [x] **RAN 2026-05-30.** Key now in gitignored `mcpindex-trust/.env`. uv does NOT auto-load .env
      here -> must run `uv run --env-file .env python scripts/seed_filesystem.py`.
      Result: 34/34 evaluated, 0 flagged, 0 failed. verdicts.json written + shape-verified
      (all PARTIAL/REVIEW, real dimension+evidence+honest_limits).
- [x] Review: all clean (expected on benign registry descriptions). KEY NUANCE: a PASS means
      "the description isn't lying," NOT "the tool is safe" — e.g. desktop-commander (terminal+fs,
      high capability) PASSes because its description is honest. Phase 2 UI must convey
      integrity != safety, or it over-reassures.
- [x] Exporter = the `project()` fn in the runner → writes `mcpindex/data/verdicts.json`
  keyed by slug, status PARTIAL / decision REVIEW / real dimension+severity+reason preserved.

### Phase 2 — Website wiring  IN PROGRESS (server pages live + build-verified)
- [x] `loadVerdictForServer(slug)`: reads `data/verdicts.json` (cached), normalizes enum case
  to UPPERCASE wire convention, excludes fixtures, returns verdict or `{kind:'unverified'}`.
- [x] Status type gained `PARTIAL`; FreeTierVerdict extended with dimension `evidence`,
  `granularity`, `honest_limits`.
- [x] Severity fix: PASS dims now `info` (was hardcoded CRITICAL by the judge); only FAIL
  carries critical. Exporter fixed + existing store migrated in place.
- [x] `TrustVerdictPanel` renders the evidence quote per dimension + the integrity!=safety note.
- [x] VERIFIED: tsc clean; `next build` ok (10,228 SSG pages); built HTML for a seeded fs
  server contains REVIEW/PARTIAL/evidence; non-seeded server still UNVERIFIED (no regression).
- [x] Shared `lib/verdicts.ts` (canonical reader/types; getVerdict/listScreened/listFixtures/
  isFlagged). Server page refactored to use it (removed inline duplicate).
- [x] `/best/filesystem` reframed as evidence directory (sourced from the verdict store, NOT
  the keyword categorizer) + labeled adversarial-fixtures showcase. "Curated" copy fixed;
  FAQ JSON-LD reflects evidence + integrity!=safety; back-link → /best (was /leaderboard).
  Other 27 categories unchanged. VERIFIED: tsc clean, build ok, rendered HTML confirmed
  (34 screened links, 3 fixtures w/ evidence, database still /100).
- [x] Visual hierarchy inverted: header leads with a compact Trust verdict badge (replaces the
  36px QualityBadge); quality demoted to a small meta stat (full breakdown stays in §03).
  Applies to all server pages (on-thesis: trust over quality). tsc + build + render verified.
- [x] post-verification code review (fresh read-only subagent): verdict SHIP, 0 HIGH, all 4
  honesty invariants verified in code + data. 3 LOW hardening items all FIXED:
  (1) fail-closed enum coercion in normalize (garbage -> REVIEW/ERROR/UNVERIFIED, never ALLOW);
  (2) build-time warn on corrupt (non-ENOENT) store; (3) JSON-LD `<`/`>` escaped. Re-verified
  tsc + build green.

### Phase 3 — Demo reframe
- [ ] `components/AgentDemo.tsx` (filesystem mode): pick-or-paste a tool description; render the
  judge finding (cited_span highlighted) instead of the recommend ranking.
- [ ] New `app/api/v1/screen/route.ts`: live judge call, per-IP rate-limit, length cap,
  append-only paste log for corpus. (SECURITY-AUDITOR REQUIRED — touches an API endpoint +
  request logging + external LLM call.)
- [ ] Precompute the 6-10 demo examples into the store.

### Phase 4 — Verify
- [ ] Build passes (the modified Next.js — heed AGENTS.md / deprecations).
- [ ] Diff behavior: filesystem server page shows real cited_span; a non-filesystem page still
  shows `unverified` (no regression).
- [ ] Confirm zero "ALLOW" / zero "EVALUATED" rendered (only PARTIAL + REVIEW + evidence).
- [ ] security-auditor on `/api/v1/screen` — HIGH findings block done.
- [ ] Post-verification fresh read-only code review (vuln/fluff/design) per Coding Mode.

---

### SHIPPED 2026-05-30
- Branched + committed both repos, post-verification review (SHIP, 0 HIGH, 3 LOW fixed),
  then merged to main + pushed:
  - mcpindex-web main @ 5f7cd73 (Phase 0 + Phase 1 seed + Phase 2 UI + hierarchy). Vercel prod
    deploy dpl_7vwmWmr building; prior good deploy d09e767 is the rollback candidate (zero-downtime).
  - mcpindex-trust main @ 8a496d8 (seeder + .env gitignore protection; .env confirmed ignored on main).
- LIVE CONFIRMED on mcpindex.ai (deploy READY ~330s): /best/filesystem serves the evidence
  directory + fixtures showcase; seeded server pages show Trust badge + PARTIAL/REVIEW;
  homepage + /llms.txt no longer say "Both legs execute". Zero downtime.
- Follow-ups (not blocking): Phase 3 live /api/v1/screen demo (needs Groq key in Vercel then);
  tool-level probing increment (remote via HTTP, local via container); server-page §03 polish.

## Out of scope (explicit — wrong-stage work for MVP)
- Cron/automated re-eval pipeline (manual run for the seed is fine).
- Other 28 categories (stay quality-list).
- Calibrated directives / ALLOW-DENY (blocked on calibration, by design).
- Auth tiers, history, provenance (free-tier projection only).
- The two-axis scatter / full design-system rebuild (separate effort).
- OG image system, 404 page (logged from review; not blocking this surface).

## Open question for you
- AD-1: confirm **tool-level (B)** — it means probing ~25-30 servers, accept some won't connect.
- Scale of seed: I propose **~25-30 servers**. More = stronger directory but longer Phase 1.
