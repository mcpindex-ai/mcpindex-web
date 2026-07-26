// Lightweight keyword-based categorizer. Intentionally crude - the Quality Score
// page lists this as "v0 categorization, contributions welcome" so no precision claim.
//
// ANCHORING. An unanchored keyword also matches mid-word and mis-files listings: /time/i
// caught ba*time*nt and sen*time*nt, /vision/i caught pro*vision*, /search/i caught
// re*search*, /word/i caught key*word* and pass*word*. Measured against the 18k-server
// snapshot that was ~800 listings.
//
// A boundary is added ONLY where a collision is measured, never prophylactically: most
// mid-word matches are correct inflections ("payments", "images", "logs", "postgresql")
// and anchoring those would drop real listings. Confirm against data/snapshot.json before
// touching a pattern; lib/categorize.test.ts pins both directions.
//
// \b is the wrong boundary here because it counts `_` as a word character, so /\bsearch/
// misses the snake_case tool ids that registry descriptions are full of (`task_search`).
// These builders use alphanumeric-only boundaries instead:
//   stem('search') -> leading only: keeps "searching"/"searchable", drops "research"
//   word('logs?')  -> both sides:   keeps "logs", drops "login"/"logic"/"logistics"
// The leading boundary consumes a character rather than using a lookbehind. Callers only
// ever .test() these, so consuming is equivalent - and it keeps the module safe to import
// from a client component (lookbehind needs Safari 16.4+).
const stem = (s: string) => new RegExp(`(?:^|[^a-z0-9])(?:${s})`, 'i');
const word = (s: string) => new RegExp(`(?:^|[^a-z0-9])(?:${s})(?![a-z0-9])`, 'i');

const RULES: Array<{ category: string; patterns: RegExp[] }> = [
  { category: 'database', patterns: [/postgres/i, /mysql/i, /sqlite/i, /mongo/i, /redis/i, /supabase/i, /clickhouse/i, /snowflake/i, /bigquery/i, /duckdb/i] },
  { category: 'github', patterns: [/github/i, /gitlab/i, /bitbucket/i] },
  { category: 'browser', patterns: [/browser/i, /playwright/i, /puppeteer/i, /chromium/i, /selenium/i, /webdriver/i] },
  { category: 'web-scraping', patterns: [/scrap/i, /crawl/i, /firecrawl/i, /jina/i, /apify/i] },
  { category: 'filesystem', patterns: [/file.?system/i, /\bfs\b/i, /\bfile\b/i, stem('folder'), /directory/i] },
  { category: 'cloud-aws', patterns: [/\baws\b/i, /\bs3\b/i, /lambda/i, /dynamodb/i, /ec2/i, /cloudwatch/i] },
  { category: 'cloud-gcp', patterns: [/\bgcp\b/i, /google cloud/i, /\bgcs\b/i, /firestore/i] },
  { category: 'cloud-azure', patterns: [/azure/i] },
  // /argo/i caught cargo and jargon.
  { category: 'kubernetes', patterns: [/kubernetes/i, /\bk8s\b/i, word('helm'), word('argo'), /argocd/i] },
  { category: 'docker', patterns: [/\bdocker\b/i, /container/i, /\boci\b/i] },
  // /sms/i caught mechanisms and organisms.
  { category: 'communication', patterns: [/slack/i, /discord/i, /telegram/i, /whatsapp/i, word('sms'), /twilio/i] },
  // /outlook/i caught weather "outlooks".
  { category: 'email', patterns: [/email/i, /gmail/i, word('outlook'), /smtp/i, /resend/i, /mailgun/i, /sendgrid/i] },
  { category: 'productivity', patterns: [/notion/i, /linear/i, /asana/i, /jira/i, /trello/i, /todoist/i, /clickup/i] },
  // /word/i caught keyword, password and 1password; /excel/i caught "excellent". Both are
  // product names, so they are spelled out in the contexts a Word/Excel server uses.
  { category: 'docs', patterns: [/google.?doc/i, /confluence/i, /docs/i, /pdf/i, /ms.?word\b/i, /microsoft word/i, stem('word\\s+(?:document|doc|file|template|processor|mcp|server)'), /\.docx?\b/i, word('excel'), /\bxlsx?\b/i, /sheets/i, /spreadsheet/i] },
  // /drive/i caught "data-driven" and "driver"; /box\b/i caught sandbox, inbox and toolbox.
  { category: 'storage-drive', patterns: [word('drives?'), /dropbox/i, /onedrive/i, word('box')] },
  { category: 'crm-sales', patterns: [/salesforce/i, /hubspot/i, /pipedrive/i, /\bcrm\b/i] },
  // /segment/i caught Strava "segments" and image "segmentation".
  { category: 'analytics', patterns: [/analytics/i, /amplitude/i, /mixpanel/i, word('segment'), /posthog/i, /\bga\b/i] },
  { category: 'finance', patterns: [/stripe/i, /quickbook/i, /plaid/i, /finance/i, /payment/i, /banking/i] },
  { category: 'ecommerce', patterns: [/shopify/i, /woocommerce/i, /bigcommerce/i, /magento/i] },
  { category: 'ai-llm', patterns: [/openai/i, /\banthropic/i, /\bgpt\b/i, /\bllm\b/i, /perplexity/i, /gemini/i, /huggingface/i, /replicate/i] },
  // /vision/i caught provision, revision, division and television; /3d/i caught "13D" and hex ids.
  { category: 'image-video', patterns: [/image/i, /video/i, /audio/i, word('visions?'), /transcrib/i, /whisper/i, /\btts\b/i, /\bocr\b/i, word('3ds?')] },
  // /search/i caught research and researcher - ~170 listings, the single largest collision.
  { category: 'search', patterns: [stem('search'), /elastic/i, /algolia/i, /typesense/i, /meilisearch/i] },
  // /\blog/i caught logistics, login, logic and logo.
  { category: 'monitoring', patterns: [/grafana/i, /prometheus/i, /datadog/i, /sentry/i, /pagerduty/i, /honeycomb/i, word('logs?'), word('logging'), word('logged'), word('logcat')] },
  // /security/i caught food "insecurity"; /cve/i caught macvendors.
  { category: 'security', patterns: [stem('security'), /cyber ?security/i, stem('vault'), /1password/i, /lastpass/i, /vulnerab/i, word('cves?')] },
  // /git\b/i caught legit and digit; /repl/i caught replay, reply, replace and replica;
  // /shell/i caught ifcopenshell; /cursor/i caught precursor; /terminal/i caught geckoterminal.
  { category: 'devtools', patterns: [word('git'), /\bide\b/i, /vscode/i, stem('cursor'), stem('terminal'), word('shells?'), /powershell/i, word('repl')] },
  // /map/i caught roadmap, mindmap and sitemap; /\bgeo/i caught geopolitical and geometry;
  // /location/i caught allocation and relocation.
  { category: 'maps-location', patterns: [word('maps?'), word('mapping'), /openstreetmap/i, /mapbox/i, /maptiler/i, stem('geo(?!politic|metr|rgia)'), stem('location'), /weather/i] },
  // /knowledge/i caught "acknowledge".
  { category: 'memory', patterns: [/memory/i, stem('knowledge'), /\brag\b/i, /vector/i, /embedding/i] },
  // word('time') alone is not enough: it drops "times", "timezone" and "timetable", which
  // orphaned 28 real time services. Spell the vocabulary out. Residual imprecision: the
  // multiplier and latency senses ("3 times faster", "response times") still land here.
  { category: 'time', patterns: [word('times?'), word('timezones?'), /time ?zone/i, stem('timetable'), word('datetime'), word('clock'), /calendar/i, /schedul/i, /reminder/i] },
];

// Strip registry-namespacing prefixes that would otherwise contaminate matching.
// e.g. "io.github.foo/bar-mcp" -> "foo/bar-mcp" so "github" doesn't false-fire.
function stripPrefixes(name: string): string {
  return name
    .replace(/^io\.github\./i, '')
    .replace(/^io\.gitlab\./i, '')
    .replace(/^com\.github\./i, '')
    .replace(/^com\./i, '')
    .replace(/^io\./i, '')
    .replace(/^ai\./i, '')
    .replace(/^app\./i, '')
    .replace(/[-_]mcp(?:-server)?$/i, '')
    .replace(/^mcp[-_]/i, '');
}

export function categorize(name: string, description: string): string {
  const cleanName = stripPrefixes(name);
  // Description gets weight; cleaned name is searched but with lower priority handling
  // by ordering rules and running description-first match.
  const desc = description ?? '';
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(desc))) return rule.category;
  }
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(cleanName))) return rule.category;
  }
  return 'other';
}

export const ALL_CATEGORIES = Array.from(new Set(RULES.map((r) => r.category))).concat(['other']);

export const CATEGORY_LABELS: Record<string, string> = {
  database: 'Databases',
  github: 'Git & Code Hosting',
  browser: 'Browser Automation',
  'web-scraping': 'Web Scraping',
  filesystem: 'Filesystem',
  'cloud-aws': 'AWS',
  'cloud-gcp': 'Google Cloud',
  'cloud-azure': 'Azure',
  kubernetes: 'Kubernetes',
  docker: 'Docker & Containers',
  communication: 'Chat & Messaging',
  email: 'Email',
  productivity: 'Productivity & Project Mgmt',
  docs: 'Documents & Spreadsheets',
  'storage-drive': 'Cloud Storage',
  'crm-sales': 'CRM & Sales',
  analytics: 'Analytics',
  finance: 'Finance & Payments',
  ecommerce: 'E-commerce',
  'ai-llm': 'AI & LLMs',
  'image-video': 'Image, Video & Audio',
  search: 'Search',
  monitoring: 'Monitoring & Logs',
  security: 'Security',
  devtools: 'Developer Tools',
  'maps-location': 'Maps & Location',
  memory: 'Memory & RAG',
  time: 'Calendar & Time',
  other: 'Other',
};
