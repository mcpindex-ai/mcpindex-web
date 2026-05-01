# READY_TO_LAUNCH

Single checklist of everything that needs your accounts before mcpindex.ai goes live. The code is shipped — these are the manual steps Claude can't automate.

Total time: ~3-4 hours over 2-3 days (LLC + DNS take overnight to settle).

---

## DAY 0 — local verification (~10 min)

```bash
cd /Volumes/GB990Pro/GBCode/mcpindex
npm run dev
# open http://localhost:3000
```

Spot-check these surfaces render:
- [ ] `/` — landing page with live demo, type "read pdf to s3", confirm 3 results render
- [ ] `/leaderboard` — top 50 servers
- [ ] `/best/database` — curated category page
- [ ] `/server/<any-slug>` — per-server detail
- [ ] `/llms.txt` — plain text
- [ ] `/.well-known/mcp-index.json` — JSON
- [ ] `/api/v1/recommend?task=postgres` — JSON
- [ ] `/api/v1/search?q=github` — JSON
- [ ] `/changelog.rss` — XML

If anything fails, run `npx tsc --noEmit` to catch errors first.

---

## DAY 1 — accounts (~90 min)

### 1. GitHub org
- [ ] Create org `mcpindex-ai` at https://github.com/organizations/new (free)
- [ ] Create two repos under it:
  - `mcpindex-web` (private initially; flip to public on launch day) — for the Next.js site
  - `mcp-server-mcpindex` — public from the start
- [ ] Don't push yet (do that Day 3 after Vercel is wired)

### 2. Vercel project
- [ ] Go to https://vercel.com/new
- [ ] Import the (still-empty) `mcpindex-ai/mcpindex-web` repo, OR drag-and-drop the local `/Volumes/GB990Pro/GBCode/mcpindex` directory
- [ ] Framework Preset: **Next.js** (do NOT leave on Other — it 404s; see `feedback_vercel_nextjs_supabase_deploy_gotchas.md`)
- [ ] Deployment Protection: **OFF** for production (otherwise the site requires login)
- [ ] **Spending limit: $0 hard cap** — Settings → Usage → set spend limit. Site degrades gracefully on overage instead of charging.
- [ ] Domain: Settings → Domains → add `mcpindex.ai`

### 3. Domain DNS (~10 min config + overnight propagation)
- [ ] In your registrar (where mcpindex.ai is held), point DNS at Vercel:
  - `A` record → `76.76.21.21`
  - `CNAME` for `www` → `cname.vercel-dns.com`
- [ ] **Auto-renew: ON** at registrar
- [ ] **Prepay 2 years** to avoid lapse during the 6-month flip window
- [ ] Defensive bundle (~$30 total): register `mcpindex.com` + `mcpindex.dev` and 301-redirect to `mcpindex.ai`. Skip `mcpregistry.ai` ($90+) — overspend.

### 4. UptimeRobot (~3 min)
- [ ] Free account at https://uptimerobot.com
- [ ] Monitor: HTTP keyword, URL `https://mcpindex.ai/api/registry-count`, keyword `"servers":`, interval 60 min
- [ ] Alert contact: your email — only on **down** events

### 5. X / Twitter handle
- [ ] Register `@mcpindex` (or closest available — `@mcpindexai`, `@mcp_index`)
- [ ] Bio: "agent-native index of MCP servers · mcpindex.ai · drop-in MCP server for Claude/Cursor/Cline/Zed"
- [ ] Profile pic: the SVG icon at `app/icon.svg` (re-saved as 400×400 PNG)
- [ ] No posting cadence required — handle exists for branding only

### 6. Loops (waitlist + newsletter)
- [ ] Free account at https://loops.so
- [ ] Create one form for waitlist; copy the form ID
- [ ] Create one transactional template for the weekly newsletter
- [ ] Drop API key + form ID + template ID into Vercel env vars (see §Env vars below)

### 7. (Optional) OpenAI key
- [ ] Only needed if/when you upgrade `/api/v1/search` to embeddings — the current keyword search works fine for v0
- [ ] Add `OPENAI_API_KEY` to Vercel env vars when ready

### 8. (Optional) Upstash Redis
- [ ] Only needed for production-grade rate-limiting. Current middleware uses in-memory (per-instance) — fine for launch traffic
- [ ] Add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` later

### 9. LLC formation (parallel — do this Day 0 so it clears by Day 7)
- [ ] Northwest Registered Agent — Wyoming single-member LLC, ~$300, ~3 days to clear
- [ ] Use it as the legal owner of the domain + npm package + Vercel account from Day 1
- [ ] EIN issued automatically; add to your records
- [ ] Acquirers will pay 20-40% more for clean LLC ownership vs. individual

---

## DAY 2 — env vars + cron + push (~30 min)

### Vercel env vars to set
Settings → Environment Variables → Production:

| Key | Value | Purpose |
| --- | --- | --- |
| `CRON_SECRET` | random 32-char string | Auth for `/api/cron/*` endpoints |
| `LOOPS_API_KEY` | from Loops dashboard | Newsletter delivery |
| `LOOPS_NEWSLETTER_ID` | template ID | Which template to send |
| `LOOPS_BROADCAST_LIST` | list email | Who receives newsletter |
| `LOOPS_WAITLIST_FORM_ID` | form ID | Waitlist storage |
| `OPENAI_API_KEY` | (later, for v1) | Semantic search |

### Push the code
```bash
cd /Volumes/GB990Pro/GBCode/mcpindex
git init
git add .
git commit -m "init: mcpindex.ai v0"
git branch -M main
git remote add origin git@github.com:mcpindex-ai/mcpindex-web.git
git push -u origin main
```

Vercel auto-deploys on push.

### Push the npm package
```bash
cd mcp-server-mcpindex
git init
git add .
git commit -m "init: mcp-server-mcpindex 0.1.0"
git branch -M main
git remote add origin git@github.com:mcpindex-ai/mcp-server-mcpindex.git
git push -u origin main

# Then publish to npm:
npm login   # one-time
npm publish --access public
```

### Verify cron is wired
- [ ] Vercel dashboard → Settings → Cron Jobs — confirm two entries (sync-registry daily, send-newsletter Mondays)
- [ ] Manual trigger once: `curl -H "Authorization: Bearer $CRON_SECRET" https://mcpindex.ai/api/cron/sync-registry` (should return JSON with counts)

---

## DAY 3 — LAUNCH (~4 hours active)

This is the only day that requires real-time presence. Block it out.

### 9am ET (or whenever you can stay reachable for 4 hrs)
- [ ] Submit Show HN — copy from `launch/show-hn.md`
- [ ] Submit PR to `awesome-mcp-servers` — copy from `launch/awesome-pr.md`
- [ ] Submit to PulseMCP, Smithery, Glama, MCP.so, official registry — `launch/submissions.md`

### Within 1 hour
- [ ] Reddit posts: r/ClaudeAI, r/LocalLLaMA, r/cursor — `launch/reddit-*.md`
- [ ] Indie Hackers — `launch/indie-hackers.md`
- [ ] Tweet from `@mcpindex` + personal handle — `launch/tweet.md`
- [ ] LinkedIn — `launch/linkedin.md`

### Within 4 hours
- [ ] Reply to top Show HN comments — script in `launch/show-hn.md`
- [ ] DM 5 high-influence MCP early adopters — `launch/dm-mcp-builders.md`
- [ ] Single-shot DM to Anthropic DevRel — `launch/dm-anthropic.md`
- [ ] Newsletter pitches — `launch/pitch-newsletter.md`

### Same week
- [ ] Schedule Product Hunt for following Tuesday — `launch/product-hunt.md`

---

## DAY 21 — FIRST ACQUIRER OUTREACH (~30 min)

Send 5 emails to Tier 1-2 of the acquirer ladder:
- [ ] 2 from `launch/email-A-defensive.md` (PulseMCP, Glama)
- [ ] 3 from `launch/email-B-strategic.md` (Composio, Cursor, Mastra)
- [ ] 1 from `launch/email-C-anthropic-postlaunch.md` (Anthropic DevRel)

Update bracketed `[N]` numbers from `https://mcpindex.ai/stats`.

## DAY 60 — SECOND OUTREACH

- [ ] 3 emails to remaining Tier 3 (Smithery, MCP.so, the holdout from Day 21)
- [ ] Update numbers, mention any traction milestones

## DAY 90 — THIRD OUTREACH

- [ ] Tier 4 (Snyk, Socket, Sourcegraph) — single shot each
- [ ] Re-pitch Anthropic if no reply

## DAY 150 — HARD KILL

If best offer < $8K floor:
- [ ] List on https://atom.com at $15K BIN
- [ ] Walk away

If best offer ≥ $8K:
- [ ] Use Cooley GO asset purchase agreement template: https://www.cooleygo.com/documents/asset-purchase-agreement-template/
- [ ] Sign via DocuSign
- [ ] Transfer: domain (registrar), npm package (npm transfer), GitHub repos, Vercel project, Loops list

---

## NEVER YOUR PROBLEM (don't get sucked in)

These are explicitly out of scope per the post-ship operating model:

- GitHub issues — ignore. Auto-close after 30 days inactive.
- Twitter engagement — handle is for branding only.
- Customer support — there are no customers.
- Server moderation — registry is Anthropic's.
- npm package maintenance — pinned 0.1.0; only patch if broken.
- Newsletter writing — fully auto-generated from registry diff.
- Quality Score disputes — methodology is open + open-source. "Open a PR" is the answer.

---

## EMERGENCY CONTACT POINTS

- Site down: UptimeRobot emails you. Likely cause: Vercel free tier overage (check Settings → Usage). Bump cap or wait 24h for reset.
- Registry API change: cron run logs in Vercel dashboard. Snapshot stays at last-good for 24h.
- npm package abuse: revoke and republish a patch. ~10 min.
- Domain expiry: should not happen with auto-renew + 2-year prepay.
- Anthropic C&D: comply with what they ask. Keep the disclaimer in footer; they shouldn't need to ask.

---

## FINAL SHIP CHECKLIST

Tick all before pulling the Show HN trigger:

- [ ] Site live at https://mcpindex.ai
- [ ] All 14 routes return 200 (see Day 0)
- [ ] Live demo renders results
- [ ] LLC formed, EIN in hand
- [ ] Domain in LLC name
- [ ] UptimeRobot pinging
- [ ] Vercel spending cap at $0
- [ ] Auto-renew on registrar
- [ ] npm package published, README has working install command
- [ ] GitHub repos public
- [ ] All `launch/*.md` files reviewed and personalized
- [ ] Block 4 hours for Show HN reply shift
