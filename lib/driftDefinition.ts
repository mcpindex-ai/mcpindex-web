// The citable definition of "MCP tool drift" and the frozen figures that go with it. One module
// so /drift, its JSON-LD and /llms.txt state the same sentence and the same numbers; a second
// hand-typed copy is how the site ended up with seven stale "strict holds any drift" claims.
//
// Live-contract figures read data/report-edition-v1.json, the frozen Drift Report Edition v1
// (version DOI 10.5281/zenodo.21449150) that /drift-report and /stats already use.
//
// Registry figures are the MCP Registry Drift Panel (concept DOI 10.5281/zenodo.21709945), copied
// from mcpindex-trust corpus_eval/drift_panel/deposit/survival.csv and figures.json, panel pin
// d4579dbf, data cutoff 2026-07-28T21:13:35Z. That file is not in this repo, so the values live in
// lib/facts.json, each with the jq query against figures.json that produced it.
// Two estimands, and the page must not blur them:
//   - survival rates: for each starting observation, the share of servers listed then whose
//     entry differed from its starting value at any observation within N days (a revert still
//     counts), averaged over starting observations. The denominator is each cohort's own
//     snapshot, NOT the 18,748.
//   - concentration: over the 18,748 servers seen in at least 10 observations. "top10pct" is the
//     top 10% of THOSE servers ranked by change count, not the top 10% of servers that changed.
import edition from '@/data/report-edition-v1.json';
import { factNumber, factString } from '@/lib/facts';

export const DRIFT_TERM = 'MCP tool drift';

export const DRIFT_DEFINITION =
  "MCP tool drift is any change to a tool's contract, as a Model Context Protocol server " +
  'serves it, after a client has already seen that contract.';

export const DRIFT_CONTRACT_SCOPE =
  'The contract is what tools/list returns for the tool: its name, description, input schema, ' +
  'output schema and annotations.';

const agg = edition.aggregates;
const flips = agg.flip_segmentation;

export const LIVE_EDITION = {
  snapshots: edition.coverage.snapshot_count,
  days: edition.coverage.elapsed_days,
  firstSnapshot: edition.coverage.first_snapshot.slice(0, 10),
  lastSnapshot: edition.coverage.last_snapshot.slice(0, 10),
  outageDays: Math.round(edition.coverage.gap_spans[0]?.days ?? 0),
  incidents: agg.deduped_safety_incidents,
  kindsObserved: Object.keys(agg.incidents_by_kind).length,
  sameVersion: agg.version_delta_split.same,
  silentPct: agg.silent_share_pct,
  flips: agg.incidents_by_kind['annotation-flip-to-destructive'],
  // First-labeling: the old record had no annotations block, so the tool is declaring hints for
  // the first time. Guarantee change: an existing annotations block moved to destructive.
  flipsFirstLabel: flips['first-labeling|same'] + flips['first-labeling|changed'],
  flipsGuaranteeChange: flips['guarantee-change|same'] + flips['guarantee-change|changed'],
  stableIncidents: edition.headline_excluding_unstable.deduped_safety_incidents,
  stableSilentPct: edition.headline_excluding_unstable.silent_share_pct,
  unstableTools: edition.unstable.unstable_tool_count,
  versionDoi: edition.doi,
  conceptDoi: edition.concept_doi,
} as const;

// Concentration of the live-contract figures, from the edition's own public file, vendored as
// data/report-edition-v1-per-server.csv (md5 f3dba24134204d6db743f2db452bcc35, identical to the
// Zenodo copy). driftDefinition.test.ts recomputes every value below from that CSV. Publisher =
// the server id up to the first "/"; four rows are keyed by display name and count as their own
// publisher, so publisher shares here are an upper bound on dispersion, not a lower one.
const lc = (k: string) => factNumber(`live_edition.concentration.${k}`);
export const LIVE_CONCENTRATION = {
  servers: lc('servers'),
  flipServers: lc('flip_servers'),
  topSameVersionPublisher: lc('top_same_version_publisher'),
  topSameVersionPct: lc('top_same_version_pct'),
  topFiveSameVersionPct: lc('top_five_same_version_pct'),
} as const;

const rp = (k: string) => factNumber(`drift_panel.${k}`);
export const REGISTRY_PANEL = {
  observations: rp('observations'),
  spanDays: rp('span_days'),
  cutoff: factString('drift_panel.cutoff'),
  cohorts: { d30: rp('cohorts_30d'), d60: rp('cohorts_60d'), d89: rp('cohorts_89d') },
  // NOT in lib/facts.json: no query against the deposit reproduces 80 (survival.csv and
  // figures.json carry no window-length field). Kept literal until one is found.
  minWindowDaysAt89: 80,
  descriptionPct: { d30: rp('description_pct_30d'), d60: rp('description_pct_60d'), d89: rp('description_pct_89d') },
  descriptorPct: { d30: rp('descriptor_pct_30d'), d60: rp('descriptor_pct_60d'), d89: rp('descriptor_pct_89d') },
  eligible: rp('eligible_servers'),
  // The eligibility RULE (seen in at least 10 observations), a method parameter, not a measurement.
  eligibleMinObservations: 10,
  neverChangedPct: rp('never_changed_pct'),
  topTenthSharePct: rp('top_tenth_share_pct'),
  conceptDoi: '10.5281/zenodo.21709945',
} as const;
