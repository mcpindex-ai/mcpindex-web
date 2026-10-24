# Spec: browsable index of source-liveness flags

Status: proposal. No code in this PR. Answers "should we build it and how", not "here it is."

## Background

`data/source-liveness.json` (produced by the weekly VM sweep, consumed via
`lib/sourceLiveness.ts`) currently drives, per listing:

- the banner on `/server/[slug]` (repo link replaced by `livenessSentence()` +
  dispute mailto),
- `/api/v1/search`, `/api/v1/servers`, `/api/v1/server/[slug]`
  (`sourceLivenessField`),
- the MCP tool output (same field, `app/api/[transport]/route.ts`),
- JSON-LD (`creativeWorkStatus`, `buildServerJsonLd`),
- and the aggregate census at `/research/source-liveness`.

What doesn't exist: a page listing *which* of the ~1,926 currently-active,
currently-flagged listings these are. This spec is for that page. It was
deferred twice on 2026-08-06 — once for confounding an SEO measurement
window that closed 2026-08-20, once because it's a product call, not an
engineering default. Both blockers are now clear; this is the product call,
written down.

Read `lib/sourceLiveness.ts` before reviewing this spec — most of what
follows exists to keep the header comment's discipline ("publish the
OBSERVATION, never the INFERENCE... a 404 cannot distinguish a deleted
repository from a deliberately private one") intact at 1,900-row scale
instead of the one-row scale it was written for.

## The case against, addressed directly

One page making a negative public claim about ~1,915 other people's projects,
simultaneously, is a materially different act than the same claim appearing
once on each project's own listing. A single per-server banner is something
a maintainer finds by searching their own project. A bulk index is something
a *search engine* can serve to anyone who searches a maintainer's project
name, with mcpindex's authority behind it, indefinitely, whether or not the
maintainer ever visits mcpindex at all. Three things this spec does about
that, all non-negotiable in review:

1. **Every row carries the hedge, not just the aggregate page.** The
   "may be deliberate — private or relocated" caveat currently lives once,
   in prose, on `/research/source-liveness`. On this page it must be
   re-stated per row (see "Row contents" below) because a row is the unit
   a reader — or a search snippet — will actually see in isolation.
2. **The page is `noindex` everywhere it lists rows.** See "Indexability."
   This is the main lever: it keeps the SEO value the product case asks for
   (internal links to 1,915 server pages) while not creating 17 new,
   independently-rankable pages each asserting negative claims about ~120
   third parties.
3. **The dispute path is exactly as reachable per row as it is on the
   per-server banner** — same mailto, same subject-line convention, so a
   maintainer can act on it without first finding their own listing.

If review disagrees with the noindex call specifically, that's the one
decision in this spec to relitigate before build — everything else follows
from whichever way that goes.

## URL, title, reader

**URL:** `/research/source-liveness/servers`, paginated at
`/research/source-liveness/servers/page/[n]` for n ≥ 2. Nested under
`/research/source-liveness` rather than a bare top-level route, on purpose:
it reads as "the census, drilled into," not as its own standalone accusation
surface with the census as a footnote. Mirrors the existing
`/servers` + `/servers/page/[n]` convention in `lib/serversBrowse.ts` /
`app/servers/`.

**Title (page 1):** something like *"Which listings — source liveness
census"*, not *"N servers with dead source"*. Two reasons: (a) the count
must never be baked into a title string — that's the exact bug the
`/research/source-liveness` header comment describes (pre-debounce figures
sat in a hardcoded title for four days, uncaught, because the count-carrying
test couldn't see it); title must be templated off the live row count the
same way `/research/source-liveness`'s is templated off `SOURCE_LIVENESS_CENSUS`.
(b) "dead" is exactly the inference word the rest of this artifact refuses
to use anywhere else; the title is not exempt.

**Reader:** primarily someone who already has a specific server in mind —
arrived from a search for `<project name> mcp` or `<project name> github`,
or clicked through from `/research/source-liveness`, or is a maintainer
checking whether their own project is on the list. Secondarily, an
answer-engine synthesizing "which MCP servers have an unreachable source" —
which is exactly why the per-row hedge matters: that's the audience most
likely to quote a row out of context.

## Row contents

Each row, for one flagged, currently-active listing:

- **Server name/title**, linked to `/server/[slug]`. This link is the whole
  SEO point of the page — see "Internal linking."
- **The observation**, in `livenessSentence()`'s register, not a rewrite of
  it: `Source repository not publicly accessible (HTTP {status}).` Reuse the
  existing sentence-builder rather than inventing per-row copy, so the two
  surfaces can't independently drift the way the census figures once did.
- **`confirmed_unavailable` date** — required per row, not just present when
  set. If a row's `confirmed_unavailable` is null (evidence collected but
  the confirmation date wasn't recorded), the row must still surface
  `last_verified_accessible` if present, and if neither date exists, show an
  explicit "date not recorded" rather than a blank cell — a blank cell
  reads as "we don't know," an explicit label reads as "we checked and
  don't have this field," which is the true state and matters for a claim
  this size.
- **The per-row hedge**, always, compact form: `May be private or
  relocated.` — the same clause `buildServerJsonLd`'s `creativeWorkStatus`
  already uses. Not optional, not collapsed into a page-level footnote:
  the whole argument in "case against" is that a row must stand on its own.
- **The repository URL, as inert text, not a link.** The per-server banner
  already establishes this precedent (`app/server/[slug]/page.tsx:679-713`,
  "a confirmed-unreachable repo replaces the link rather than sitting next
  to it") — don't invent a different rule for the index. Monospace text is
  enough for a reader to copy/search it themselves; a live `<a href>` would
  hand out link equity and a click-through to a URL this project is telling
  the reader is unreachable.
- **A per-row dispute link.** See "Dispute path."

Explicitly not shown per row, to keep 1,900 rows scannable and because the
evidence detail belongs to the per-server page, not the index: vantage
count, check methods, HTTP-status raw code beyond what's in the sentence.
A reader who wants that clicks through to `/server/[slug]`.

## Pagination at ~1,900 rows

Reuse `lib/serversBrowse.ts`'s shape (`BROWSE_PAGE_SIZE = 120`,
alphabetical-by-title with slug tiebreaker, 1-indexed, page 1 canonical at
the bare route, `page/[n]` for the rest, `browseTotalPages`-style helper).
At ~1,926 rows that's ~17 pages. Concretely: add
`lib/sourceLivenessBrowse.ts` mirroring `serversBrowse.ts`'s
`browsePage`/`browseTotalPages`, sourced from `livenessLookup()` intersected
with the active server set (same intersection `/stats` already does at
`app/stats/page.tsx:49` — the raw artifact has entries for servers that have
since left the registry; the index must not list those).

**Sort: alphabetical by title, not by `confirmed_unavailable` date.** This
was tempting — recency is arguably the more useful signal to a reader — but
`serversBrowse.ts`'s own comment explains why it isn't the right call for a
*paginated* index: "a quality sort reshuffles page membership on every
snapshot, which churns what each paginated URL contains." A date-desc sort
has the identical problem here, worse: every weekly sweep inserts newly
confirmed rows stamped with that week's date, which would resort to page 1
and push every existing row down a slot, every week, forever. Alphabetical
is the only ordering under which a given URL (`.../page/7`) keeps roughly
the same membership between sweeps. The date is still visible — it's a
column on the row, just not the sort key.

Same prerender posture as `app/servers/page/[n]/page.tsx`: prerender the
first N pages (crawl-entry surface), the long tail renders on demand and is
cached.

## Indexability

**Recommendation: `noindex, follow` on every page in this section,
including page 1.** Not indexed anywhere, but every outbound link (to the
~1,915 server pages) still passes crawl signal and gets discovered — noindex
does not nofollow a page's own outbound links.

The case for indexing it: it's a genuinely unique, unduplicated dataset — no
competitor publishes this — and pages like it are the kind of thing that
earns external citations (a blog post about MCP supply-chain risk citing
mcpindex's list). That value survives noindex fine: an external site can
still link to and quote a noindex page, and the page still exists at a
stable URL for that purpose. What indexing would add on top is the page
*itself* showing up in search results — and that's specifically the part
"case against" argues against: it would mean a search for a specific
maintainer's project can surface a page whose entire content, out of
context, is a negative claim about their repository, carrying mcpindex's
domain authority, independent of whether that maintainer's own listing ever
ranks.

The obvious middle position — index page 1 only, `noindex` the rest — was
considered and rejected: page 1 has no more standalone editorial merit than
page 9; it's first only because "a" sorts before "z". The actual indexed,
citable, methodology-bearing asset for this dataset already exists and stays
exactly as is: `/research/source-liveness`. This index is a navigational
drill-down from it, not a competing entry point, and its metadata/robots
posture should say so.

If product overrides this and wants pages indexed anyway, the fallback is:
index page 1 only, canonical self-referencing (not canonicalized to page 1
from the tail — these aren't near-duplicate splits of one document, unlike
some paginated-content canonicalization cases), sitemap priority per
"Sitemap priority" below.

## Internal linking

**In:**
- `/research/source-liveness` gets a new link into the index — natural
  home is a new short section or an addition to "What to do about it",
  something like *"See which listings"* → `/research/source-liveness/servers`.
  This is the primary, high-relevance parent the product case describes.
- `/stats` (`app/stats/page.tsx`) already surfaces the `deadListed`
  count/percentage from this same artifact — worth a secondary link from
  that stat to the index, optional/nice-to-have, not required for the SEO
  case to land.
- Per-server pages are **not** required to link back to their own row on
  the index (that would just be a second link between two pages that
  already link to each other via `/research/source-liveness`). Skip it
  unless a maintainer-facing "see your listing on the index" need surfaces
  later.

**Out:**
- Each row → `/server/[slug]`. This is the actual product case: "gives
  ~1,915 pages a second contextual internal link from a high-relevance
  parent." The parent is exactly as high-relevance as it can be — the row
  is a page about that specific server's liveness status, linking to that
  specific server.
- Repository URL: inert text, not a link (see "Row contents").
- One page-level link to `/research/source-liveness` for method/limits, in
  the intro, same register as the "How we check →" link already on the
  per-server banner. Not repeated per row — the per-row hedge covers the
  per-row caveat; the methodology link covers "how was this determined at
  all," which belongs once.
- Per-row dispute mailto (see below).

## Dispute path

Reuse the exact pattern already on `app/server/[slug]/page.tsx:700-705`,
per row, not a single page-level contact link:

```
mailto:hello@mcpindex.ai?subject=${encodeURIComponent(`Dispute source-liveness flag: ${server.slug}`)}
```

Same address, same subject-line convention (`Dispute source-liveness flag:
<slug>`), keyed to that row's slug. This matters specifically for a bulk
page: a maintainer scanning the index for their own project should be able
to dispute directly from the row they found, pre-filled with which listing
they mean, without first having to locate their own `/server/[slug]` page to
get the same link. A generic page-level "contact us about this index" mailto
(the kind `/research/source-liveness` has for the census overall,
`mailto:...?subject=Source%20liveness%20census`) is still worth keeping
once, in the intro, for questions about the index/methodology itself, but
it is not a substitute for the per-row link.

## Sitemap priority

**Recommendation: omit from `sitemap.xml` entirely**, consistent with the
`noindex` recommendation above — a sitemap should only list what you want
indexed; listing 17 noindex URLs sends a mixed signal to crawlers and
spends sitemap real estate on pages that will never be indexed anyway.
Discovery happens through the internal links from `/research/source-liveness`
and doesn't need a sitemap entry to work — Google discovers and crawls
linked noindex pages fine (see `app/robots.ts`'s existing precedent with
badge URLs: "noindex already handles them... still crawlable" — crawlable
and sitemap-listed are treated as separable there too).

If the indexability call above gets overridden and pages are indexed after
all, fallback priorities, keeping the existing ordering intact:
- `/research/source-liveness` stays at `0.8` / `weekly` (unchanged) — it's
  the citable, methodology-bearing asset.
- `/research/source-liveness/servers` (page 1) at `0.5` / `weekly` — below
  the census page and below per-server pages (`0.6`), reflecting that it's
  a secondary navigational aid over the same data, not a primary answer
  surface.
- `/research/source-liveness/servers/page/[n]` (n ≥ 2) at `0.3` / `weekly`
  — matching the existing deep-page precedent at `/servers/page/[n]`.

## Staleness (required)

`loadSourceLiveness()` fails closed: once `generated_at` is more than
`MAX_CENSUS_AGE_DAYS` (60) old, or unparseable, it returns
`EMPTY = { generated_at: '', servers: {} }` — same object shape as "nothing
ever loaded," and the original stale timestamp is discarded in that
collapse (`lib/sourceLiveness.ts:182-217`). `/stats` already leans on this:
`deadListed === 0` is documented there as meaning "withhold the stat,"
never "everything is alive."

That collapse is fine for a stat or a banner, where "nothing renders" reads
as absence. It is not fine for a page whose entire reason to exist is
listing flagged rows: an empty table on this page doesn't read as "we
withheld this," it reads as "zero servers are currently flagged" — an
all-clear, which is precisely the false signal the header comment in
`lib/sourceLiveness.ts` says the withholding exists to prevent ("Failing
toward silence is the only direction that cannot defame someone whose
repository came back online months ago" — that sentence is about the
*claim* going silent, not about the *page* rendering a clean bill of health
in its place).

**Required behavior, three distinct states, not two:**

1. **Healthy** (age ≤ 60 days, rows present) → normal paginated table.
2. **Healthy, zero rows** (every flag cleared — unlikely at this corpus
   size but not impossible, and must not be confused with state 3) →
   an explicit "No listings currently flagged" state that still shows the
   live `generated_at` date, so it reads as a dated, current finding, not
   as silence.
3. **Stale / withheld** (age > 60 days, or unparseable/missing date) → a
   distinct panel, not an empty table and not a 404/500: state plainly that
   the index is temporarily withheld because the underlying check hasn't
   run recently enough to stand behind, and — this is the part that needs a
   small lib change, flagged below — show the *last known* `generated_at`
   and computed age, so the message is "last checked 2026-05-12 (73 days
   ago), withheld until a fresh sweep completes," not a bare "no data."
   Page returns HTTP 200 (this is a known, permanent URL in a degraded
   state, not an error), and its `<title>`/description must not assert any
   row count either — same discipline as the count-in-title rule above,
   now applied to a state where there is no trustworthy count to assert.

**Implementation gap this depends on:** `loadSourceLiveness()` currently
collapses "stale" and "never loaded" to the same `generated_at: ''`, which
is correct for every existing consumer (a stat or banner has nothing useful
to say about *how* stale) but insufficient here, where the degrade message
needs the real last-known date. This spec requires a small addition — e.g.
a `loadSourceLivenessStatus()` that reads the same cached raw doc and
returns `{ generated_at, age_days, publishable }` *before* the
publishability gate discards the timestamp — so the page can render state 3
honestly instead of falling back to "no data." This is additive to
`lib/sourceLiveness.ts`, not a change to its existing fail-closed behavior
for the surfaces that already consume it.

Pagination in state 3 falls out for free if page 1 branches to the withheld
panel *before* calling into the pagination helper: `totalPages` over zero
rows is 1, so any `/page/[n]` for n ≥ 2 hits the existing out-of-range
`notFound()` path in `browsePage`-style logic, same as today. No special
handling needed for the deep-page URLs in the stale case beyond making sure
page 1 doesn't try to render a real table with zero rows in it (state 2 and
state 3 must not be visually or textually confusable — different copy,
state 3 is explicit about *why* there's nothing to show).

## Out of scope for this PR

No code. No new lib functions beyond what's specified above as required.
No page. No sitemap/robots changes. This spec is the artifact.
