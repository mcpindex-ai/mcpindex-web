// Lightweight keyword-based categorizer. Intentionally crude — the Quality Score
// page lists this as "v0 categorization, contributions welcome" so no precision claim.

const RULES: Array<{ category: string; patterns: RegExp[] }> = [
  { category: 'database', patterns: [/postgres/i, /mysql/i, /sqlite/i, /mongo/i, /redis/i, /supabase/i, /clickhouse/i, /snowflake/i, /bigquery/i, /duckdb/i] },
  { category: 'github', patterns: [/github/i, /gitlab/i, /bitbucket/i] },
  { category: 'browser', patterns: [/browser/i, /playwright/i, /puppeteer/i, /chromium/i, /selenium/i, /webdriver/i] },
  { category: 'web-scraping', patterns: [/scrap/i, /crawl/i, /firecrawl/i, /jina/i, /apify/i] },
  { category: 'filesystem', patterns: [/file.?system/i, /\bfs\b/i, /\bfile\b/i, /folder/i, /directory/i] },
  { category: 'cloud-aws', patterns: [/\baws\b/i, /\bs3\b/i, /lambda/i, /dynamodb/i, /ec2/i, /cloudwatch/i] },
  { category: 'cloud-gcp', patterns: [/\bgcp\b/i, /google cloud/i, /\bgcs\b/i, /firestore/i] },
  { category: 'cloud-azure', patterns: [/azure/i] },
  { category: 'kubernetes', patterns: [/kubernetes/i, /\bk8s\b/i, /helm/i, /argo/i] },
  { category: 'docker', patterns: [/\bdocker\b/i, /container/i, /\boci\b/i] },
  { category: 'communication', patterns: [/slack/i, /discord/i, /telegram/i, /whatsapp/i, /sms/i, /twilio/i] },
  { category: 'email', patterns: [/email/i, /gmail/i, /outlook/i, /smtp/i, /resend/i, /mailgun/i, /sendgrid/i] },
  { category: 'productivity', patterns: [/notion/i, /linear/i, /asana/i, /jira/i, /trello/i, /todoist/i, /clickup/i] },
  { category: 'docs', patterns: [/google.?doc/i, /confluence/i, /docs/i, /pdf/i, /word/i, /excel/i, /sheets/i, /spreadsheet/i] },
  { category: 'storage-drive', patterns: [/drive/i, /dropbox/i, /onedrive/i, /box\b/i] },
  { category: 'crm-sales', patterns: [/salesforce/i, /hubspot/i, /pipedrive/i, /\bcrm\b/i] },
  { category: 'analytics', patterns: [/analytics/i, /amplitude/i, /mixpanel/i, /segment/i, /posthog/i, /\bga\b/i] },
  { category: 'finance', patterns: [/stripe/i, /quickbook/i, /plaid/i, /finance/i, /payment/i, /banking/i] },
  { category: 'ecommerce', patterns: [/shopify/i, /woocommerce/i, /bigcommerce/i, /magento/i] },
  { category: 'ai-llm', patterns: [/openai/i, /\banthropic/i, /\bgpt\b/i, /\bllm\b/i, /perplexity/i, /gemini/i, /huggingface/i, /replicate/i] },
  { category: 'image-video', patterns: [/image/i, /video/i, /audio/i, /vision/i, /transcrib/i, /whisper/i, /\btts\b/i, /\bocr\b/i, /3d/i] },
  { category: 'search', patterns: [/search/i, /elastic/i, /algolia/i, /typesense/i, /meilisearch/i] },
  { category: 'monitoring', patterns: [/grafana/i, /prometheus/i, /datadog/i, /sentry/i, /pagerduty/i, /honeycomb/i, /\blog/i] },
  { category: 'security', patterns: [/security/i, /vault/i, /1password/i, /lastpass/i, /vulnerab/i, /cve/i] },
  { category: 'devtools', patterns: [/git\b/i, /\bide\b/i, /vscode/i, /cursor/i, /terminal/i, /shell/i, /repl/i] },
  { category: 'maps-location', patterns: [/map/i, /\bgeo/i, /location/i, /weather/i] },
  { category: 'memory', patterns: [/memory/i, /knowledge/i, /\brag\b/i, /vector/i, /embedding/i] },
  { category: 'time', patterns: [/time/i, /calendar/i, /schedul/i, /reminder/i] },
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
