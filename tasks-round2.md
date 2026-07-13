# mcpindex launch site — Round 2 revision plan

Stage: launch content (publish-coupled). Honor (A) deploy-held present-tense; keep (B) maturity-held honest.

## R2 BLOCKERS
- [ ] R2-B1 Install artifacts not served. Copy deploy/install/{install.sh,install.ps1,uninstall.*} into web/public/. .mcpb does not exist yet -> publish-gate (remove double-click .mcpb claims OR mark roadmap). Add honesty-guard rule: every mcpindex.ai/install.sh|.ps1|.mcpb literal in app/ must resolve to a served asset.
- [x] R2-B2 Package name mismatch. RESOLVED 2026-07-12: installer + site use `mcpindex-gate`; `mcpindex-preflight` is deprecated alias only.
- [ ] R2-B3 Screen conformance over-claim. 325/325 verdicts are REVIEW semantic_only_no_conformance. Scope deterministic-probe claim to the GATE (tier-0); demote screen conformance leg to built-but-not-yet-run. Surfaces: methodology (intro + Conformance probe Dim + metadata "Hybrid eval"), about (~52-58 conformance probe), trust ("How a verdict is produced" + honest limits "conformance monitored not enforced" floor reads as ran), llms.txt L27, llms-full.txt L29. Make /docs the canonical screen wording.
- [ ] R2-B4 Honesty guard hole for screen conformance. Add screen-scope guard: in non-gate context, forbid present-tense "conformance/behavioral probe drives/runs/exercises a tool" unless same paragraph carries held/roadmap/semantic-only cue. Must FAIL on current copy until B3 fixed.
- [ ] R2-B5 VerdictReveal WCAG 2.2.2. Add keyboard-focusable Pause/Play; pause on focus-within; gate auto-advance on !reduced (reduced-motion users step via dots as real <button>s); aria-live=polite on body.

## R2 MAJORS
- [ ] R2-M1 De-risk curl|sh: lead install with auditable uv tool install + manual-wire; curl as convenience; add "inspect first" line.
- [ ] R2-M2 Demote network on home: move §the-network below dark band (or collapse); shrink hero network-count line.
- [ ] R2-M3 ALLOW/DENY not reachable today: state screen emits REVIEW/UNVERIFIED only at v1; ALLOW/DENY unlock with behavioral corpus. Keep styling.
- [ ] R2-M4 Remote/HTTP install path: add §3b subsection — local-gateway routing, headers pass-through, rewritten shape, boundary (HTTPS public-IP today; localhost/LAN/http = ssrf_blocked).
- [ ] R2-M5 Pricing coherence: one sentence — tier-0 protection free+local+unmetered; Pro adds optional cloud tier-1.
- [ ] R2-M6 /trust diligence: sub-processors none-in-default-local; tier-1 egress region; checksum/signature note for installer+wheel; SECURITY.md + disclosure path.
- [ ] R2-M7 /demo og.jpg palette inversion + amber headline. Replace static og.jpg with a dynamic app/demo/opengraph-image.tsx (white bg, ink type, amber on verdict token only). Remove /promo/og.jpg override.

## R2 MINORS (opportunistic, no regressions)
- [ ] Vocabulary bridge clause in §the-network.
- [ ] "How it works ->" hero CTA -> "Read the methodology ->".
- [ ] feeds header "## Drift Gate (in-path, live)" -> "(in-path; tier-0 live, tiers 1-3 held off by default)".
- [ ] accent-text token ~#c2410c for amber-as-text WCAG 1.4.3.
- [ ] "Hybrid eval" label -> drop/roadmap-mark conformance leg.
- [ ] SEO: alternates.canonical on core pages; Organization/WebSite/SoftwareApplication JSON-LD on home; robots references /llms.txt.
- [ ] docs §05 "Limits + guarantees" -> "Limits + API guarantees".
- [ ] UNVERIFIED status/directive taxonomy canonical pairing.

## GATE
- [ ] node scripts/check-graduation-honesty.mjs (green) && npx next build (green). No (A) over-reach, no (B) over-claim, no regressions.
