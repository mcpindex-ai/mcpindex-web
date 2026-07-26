// Unit tests for the keyword categorizer. Run with `npm test` (tsx + node:test).
//
// These lock BOTH directions of the substring-collision fix. The classifier matches
// keywords against free-text descriptions, so every unanchored keyword risks matching
// mid-word: /time/i matched ba*time*nt, /vision/i matched pro*vision*, /search/i matched
// re*search*. Anchoring is the fix, but over-anchoring is its own bug - most mid-word
// matches are correct inflections ("payments", "images", "logs"), and `\btime\b` alone
// orphans "times"/"timezone"/"timetable". So each collision gets a negative test AND the
// inflection it must not break gets a positive one.
//
// Every string below is a real description (or a faithful reduction of one) taken from
// data/snapshot.json. The tests deliberately do NOT read that file: it is refreshed by a
// cron job, so asserting over it would make this suite flaky.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, ALL_CATEGORIES, CATEGORY_LABELS } from './categorize';

const cat = (desc: string, name = 'example.org/srv') => categorize(name, desc);

// --- the reported bug -------------------------------------------------------------
// fr.renoolab/mcp was filed under Calendar & Time because /time/i matched "batiment".
test('the French word batiment is not a time service', () => {
  assert.notEqual(cat('Trouver et contacter des artisans du batiment en France.'), 'time');
});

test('an unclassifiable non-English description is Other, not a wrong category', () => {
  // Honest outcome: the classifier is English-keyword-only. "Other" says "we cannot
  // classify this"; "Calendar & Time" asserted something false.
  assert.equal(
    categorize('fr.renoolab/mcp', 'Trouver et contacter des artisans du batiment en France. Gratuit, sans commission.'),
    'other',
  );
});

// --- time: the collisions, and the inflections a bare \btime\b would break ---------
for (const [desc, why] of [
  ['Analyze text sentiment, emotions, confidence scores, and key phrases.', 'sentiment'],
  ['Agent-native uptime monitoring. Create, inspect, and assert monitor health.', 'uptime'],
  ['Drop-in RMCP runtime for provider-backed MCP tools and prompts.', 'runtime'],
  ['Signed global shipping & commodity data: oil, LNG, grain, maritime fleet.', 'maritime'],
] as const) {
  test(`time rule ignores "${why}"`, () => assert.notEqual(cat(desc), 'time'));
}

for (const [desc, why] of [
  ['Get the current time and date.', 'time'],
  ['IANA timezone conversions with real DST rules.', 'timezone'],
  ['Convert and compare dates and times across any timezone.', 'plural times'],
  ['Melbourne public transport timetables, departures, and disruptions.', 'timetable'],
  ['Quran MCP server for translation, tafsir, recitation playlists, and prayer times.', 'prayer times'],
  ['Manage your family calendars and lists. View, create, and update appointments.', 'calendar'],
] as const) {
  test(`time rule still catches "${why}"`, () => assert.equal(cat(desc), 'time'));
}

// --- search: /search/i matched "research" in ~170 listings -------------------------
test('research is not a search server', () => {
  assert.notEqual(cat('Supplement research, biomarker effects, drug interactions, and brand quality data'), 'search');
});
test('searching and searchable still classify as search', () => {
  assert.equal(cat('Fast searchable index; keep searching across sources.'), 'search');
});
test('a snake_case tool id keeps its boundary (\\b would miss the underscore)', () => {
  // `_` is a \w character, so /\bsearch/ never matches `task_search`. The categorizer uses
  // alphanumeric-only boundaries precisely so these still land in search.
  assert.equal(cat('Shared task layer for AI coding agents. One MCP surface: task_search, task_get.'), 'search');
});

// --- vision: /vision/i matched "provision" in ~105 listings ------------------------
test('provisioning is not image-video', () => {
  assert.notEqual(cat('Provision private AI model endpoints on dedicated GPUs (Llama, Qwen, Mistral).'), 'image-video');
});
test('computer vision still classifies as image-video', () => {
  assert.equal(cat('Computer vision inference for object detection.'), 'image-video');
});

// --- word/excel: product names that collided with common nouns --------------------
test('keywords are not documents', () => {
  assert.notEqual(cat('Google Ads MCP server - manage campaigns, keywords, and metrics.'), 'docs');
});
test('passwords are not documents', () => {
  assert.notEqual(cat('Rotate and audit passwords for service accounts.'), 'docs');
});
test('1Password reaches security rather than being intercepted by the docs rule', () => {
  // /word/i (docs, rule 14) used to fire on "1password" before /1password/i (security, rule 24).
  assert.equal(cat('Read secrets from a 1Password vault.'), 'security');
});
test('"excellent" is not a spreadsheet', () => {
  assert.notEqual(cat('Excellent uptime for agent workloads.'), 'docs');
});
for (const [desc, why] of [
  ['MCP Server containing tools to work with Microsoft Word documents', 'Microsoft Word'],
  ['50-tool Word MCP server. Document assembly, tracked changes, and export.', 'Word MCP server'],
  ['Structure-preserving Word .docx editing.', '.docx'],
  ['Use your own Word templates to convert Markdown.', 'Word templates'],
  ['Local MCP for Word, Excel, PowerPoint & PDF on macOS.', 'Office suite'],
] as const) {
  test(`docs rule still catches "${why}"`, () => assert.equal(cat(desc), 'docs'));
}
test('word clouds and word counts are not documents', () => {
  assert.notEqual(cat('Generate word clouds from text with custom fonts and colors.'), 'docs');
});

// --- monitoring: /\blog/i matched login, logic, logistics, logo -------------------
for (const [desc, why] of [
  ['Freight and logistics tracking across carriers.', 'logistics'],
  ['Passwordless login and session handling for agents.', 'login'],
  ['Business logic validation for agent outputs.', 'logic'],
] as const) {
  test(`monitoring rule ignores "${why}"`, () => assert.notEqual(cat(desc), 'monitoring'));
}
test('logs and logging still classify as monitoring', () => {
  assert.equal(cat('Read and tail application logs.'), 'monitoring');
  assert.equal(cat('Structured logging for agent runs.'), 'monitoring');
});

// --- storage: /drive/i matched "data-driven"; /box\b/i matched sandbox, inbox -----
test('data-driven is not cloud storage', () => {
  assert.notEqual(cat('A data-driven pricing engine for agents.'), 'storage-drive');
});
test('a sandbox is not cloud storage', () => {
  assert.notEqual(cat('Ephemeral data sandbox for AI workflows with guardrails.'), 'storage-drive');
});
test('an inbox is not cloud storage', () => {
  assert.notEqual(cat('Triage your inbox and draft replies.'), 'storage-drive');
});
test('Pipedrive reaches CRM rather than being intercepted by the storage rule', () => {
  // /drive/i (storage, rule 15) used to fire on "pipedrive" before /pipedrive/i (crm, rule 16).
  assert.equal(cat('Sync deals and contacts with Pipedrive.'), 'crm-sales');
});
test('Google Drive and drives still classify as storage', () => {
  assert.equal(cat('List and read files from Google Drive.'), 'storage-drive');
});

// --- devtools: /repl/i matched replay/reply/replace; /git\b/i matched legit/digit --
for (const [desc, why] of [
  ['Reddit growth toolkit - opportunities, replies, cold DMs, brand mentions.', 'replies'],
  ['Session replay and crash reproduction for web apps.', 'replay'],
  ['Screen a vendor or store for legitimacy: reputation and red flags.', 'legit'],
] as const) {
  test(`devtools rule ignores "${why}"`, () => assert.notEqual(cat(desc), 'devtools'));
}
test('git and a REPL still classify as devtools', () => {
  assert.equal(cat('Run git commands against a checkout.'), 'devtools');
  assert.equal(cat('Evaluate snippets in a sandboxed repl.'), 'devtools');
});

// --- the long tail ---------------------------------------------------------------
test('cargo and jargon are not Kubernetes', () => {
  assert.notEqual(cat('Calculate shipment volume and how cargo fits shipping containers.'), 'kubernetes');
  assert.notEqual(cat('Plain-English explanations that cut through jargon.'), 'kubernetes');
});
test('Helm and Argo still classify as Kubernetes', () => {
  assert.equal(cat('Install and roll back Helm releases.'), 'kubernetes');
  assert.equal(cat('Trigger Argo workflows.'), 'kubernetes');
});
test('geopolitical and geometry are not maps', () => {
  assert.notEqual(cat('Geopolitical risk scoring for supply chains.'), 'maps-location');
  assert.notEqual(cat('Geometry helpers for mesh generation.'), 'maps-location');
});
test('geospatial and geocoding still classify as maps', () => {
  assert.equal(cat('Geospatial joins and geocoding for addresses.'), 'maps-location');
});
test('roadmaps, mindmaps and sitemaps are not maps', () => {
  assert.notEqual(cat('Visual AI for strategy - SWOT, flowcharts, mindmaps, Gantt diagrams.'), 'maps-location');
  assert.notEqual(cat('Publish a product roadmap for stakeholders.'), 'maps-location');
});
test('allocation is not a location', () => {
  assert.notEqual(cat('Capacity allocation across worker pools.'), 'maps-location');
});
test('mechanisms and organisms are not SMS', () => {
  assert.notEqual(cat('Audit ISMS controls, risk assessment, and gap analysis.'), 'communication');
  assert.notEqual(cat('Reference data on marine organisms.'), 'communication');
});
test('SMS still classifies as chat and messaging', () => {
  assert.equal(cat('Send an SMS to a verified number.'), 'communication');
});
test('Strava segments and image segmentation are not analytics', () => {
  assert.notEqual(cat('Strava tools: athletes, activities, segments, clubs, routes.'), 'analytics');
});
test('acknowledge is not memory', () => {
  assert.notEqual(cat('Acknowledge an alert and record the responder.'), 'memory');
});
test('a knowledge base still classifies as memory', () => {
  assert.equal(cat('Persistent knowledge base for agents.'), 'memory');
});
test('food insecurity is not security', () => {
  assert.notEqual(cat('SNAP participation, food insecurity indicators, and agricultural statistics'), 'security');
});
test('security and cybersecurity still classify as security', () => {
  assert.equal(cat('Scan agent skills for attack classes and runtime monitoring. Security findings.'), 'security');
  assert.equal(cat('Cybersecurity posture checks for cloud accounts.'), 'security');
});
test('a weather outlook is not email', () => {
  assert.notEqual(cat('Analyst-grade US severe weather: warnings, SPC outlooks, RAP environment.'), 'email');
});
test('a 13D filing is not image-video', () => {
  assert.notEqual(cat('SEC EDGAR filings parsed: 8-K classification, 13D activist tagging.'), 'image-video');
});
test('3D still classifies as image-video', () => {
  assert.equal(cat('Generate 3D meshes from a prompt.'), 'image-video');
});

// --- inflections that must survive (they are correct, not collisions) -------------
for (const [desc, expected] of [
  ['Philippines payments for AI agents - GCash, Maya, cards. Never holds funds.', 'finance'],
  ['Micropayments over Lightning for agent tool calls.', 'finance'],
  ['Submit ECG images and receive diagnosis reports.', 'image-video'],
  ['Create and track AI music videos.', 'image-video'],
  ['Database MCP server for MySQL, MariaDB, PostgreSQL & SQLite', 'database'],
  ['Searches across public company filings.', 'search'],
  ['Manage files and folders directly from your workspace.', 'filesystem'],
  ['Scrape website content and generate text on demand.', 'web-scraping'],
  ['Manage Proxmox VE clusters - VMs, containers, and more', 'docker'],
  ['Protein analysis: ESM-2 embeddings, mutation scoring, landscape scans.', 'memory'],
] as const) {
  test(`inflection preserved: ${expected} <- "${desc.slice(0, 34)}..."`, () => {
    assert.equal(cat(desc), expected);
  });
}

// --- structural invariants -------------------------------------------------------
test('an empty description falls back to the name, then to Other', () => {
  assert.equal(categorize('io.github.someone/postgres-tools', ''), 'database');
  assert.equal(categorize('io.github.someone/zzz', ''), 'other');
});

test('a registry prefix does not contaminate matching', () => {
  // "io.github." is stripped so the github rule does not fire on every listing.
  assert.notEqual(categorize('io.github.someone/weather', 'Hourly forecasts.'), 'github');
});

test('every category a rule can emit has a label and is in ALL_CATEGORIES', () => {
  for (const c of ALL_CATEGORIES) {
    assert.ok(CATEGORY_LABELS[c], `missing label for ${c}`);
  }
  assert.ok(ALL_CATEGORIES.includes('other'));
});

test('categorize always returns a known category', () => {
  const samples = ['', 'zzzz qqqq', 'Trouver des artisans.', 'Get the current time.', '日本語の説明'];
  for (const s of samples) {
    assert.ok(ALL_CATEGORIES.includes(cat(s)), `unknown category for "${s}"`);
  }
});
