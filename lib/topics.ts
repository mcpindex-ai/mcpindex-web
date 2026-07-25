import type { IndexedServer } from './types';

// Topic comparison pages answer the question no page on the web answers today: given
// six servers all called "<product> mcp server", which one should I actually use?
// Search a product name and you get the source repos, each of which only knows about
// itself, plus one-server-per-page directory listings. Nobody compares them.
//
// The topic list is CURATED, not derived. Auto-deriving from name tokens was measured
// on the 2026-07-24 snapshot: 616 candidates at >=5 implementations, whose top results
// were "intelligence", "public", "docs", "code", "open", "hive" and a bare publisher
// username. Publishing those is doorway-page behaviour, and on a site whose entire
// value is trust a thin-content penalty is not a risk worth running. 31 pages that
// answer a real question beat 616 that look like SEO exhaust.
export const TOPICS = [
  'weather', 'oracle', 'github', 'youtube', 'calendar', 'figma', 'postgres',
  'gmail', 'solana', 'slack', 'gitlab', 'obsidian', 'mysql', 'whatsapp',
  'outlook', 'jira', 'shopify', 'salesforce', 'telegram', 'docker', 'notion',
  'playwright', 'spotify', 'sqlite', 'stripe', 'sheets', 'unity', 'wordpress',
  'linear', 'discord', 'bitbucket',
] as const;

export type Topic = (typeof TOPICS)[number];

const TOPIC_SET: ReadonlySet<string> = new Set(TOPICS);

export function isTopic(v: string): v is Topic {
  return TOPIC_SET.has(v);
}

/** Display label. Product names the ecosystem capitalises get their real casing. */
const LABELS: Readonly<Record<string, string>> = {
  github: 'GitHub', gitlab: 'GitLab', youtube: 'YouTube', postgres: 'PostgreSQL',
  mysql: 'MySQL', sqlite: 'SQLite', gmail: 'Gmail', whatsapp: 'WhatsApp',
  jira: 'Jira', figma: 'Figma', slack: 'Slack', notion: 'Notion',
  obsidian: 'Obsidian', salesforce: 'Salesforce', shopify: 'Shopify',
  telegram: 'Telegram', discord: 'Discord', docker: 'Docker', stripe: 'Stripe',
  spotify: 'Spotify', outlook: 'Outlook', calendar: 'Calendar', sheets: 'Sheets',
  solana: 'Solana', oracle: 'Oracle', unity: 'Unity', wordpress: 'WordPress',
  weather: 'Weather', linear: 'Linear', bitbucket: 'Bitbucket',
  playwright: 'Playwright',
};

export function topicLabel(topic: string): string {
  return LABELS[topic] ?? topic;
}

/** Publisher namespace: the part of a registry name before the first slash. */
export function publisherOf(name: string): string {
  const i = name.indexOf('/');
  return i === -1 ? name : name.slice(0, i);
}

/**
 * Whole-token match on the trailing name component, so "postgres" hits
 * `ai.waystation/postgres` and `x/postgres-aiops` but not `x/postgresql-ish`
 * as a substring accident.
 */
export function matchesTopic(server: IndexedServer, topic: string): boolean {
  const tail = server.name.slice(publisherOf(server.name).length + 1) || server.name;
  return tail
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .includes(topic);
}

export function implementationsFor(
  servers: readonly IndexedServer[],
  topic: string,
): IndexedServer[] {
  return servers.filter((s) => matchesTopic(s, topic));
}

// Thresholds a topic must clear to deserve a page. The publisher clauses matter: a topic
// can look busy while being one vendor's product catalogue, and a "comparison" of 115
// servers from three publishers compares nothing. `arcgis` (115 implementations, 3
// publishers) is exactly that shape and is why the dominance clause exists.
export const MIN_IMPLEMENTATIONS = 6;
export const MIN_PUBLISHERS = 3;
export const MAX_PUBLISHER_SHARE = 0.6;

export type TopicEligibility = {
  eligible: boolean;
  implementations: number;
  publishers: number;
  topPublisherShare: number;
};

export function topicEligibility(
  servers: readonly IndexedServer[],
  topic: string,
): TopicEligibility {
  const impls = implementationsFor(servers, topic);
  const counts = new Map<string, number>();
  for (const s of impls) {
    const p = publisherOf(s.name);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const top = Math.max(0, ...counts.values());
  const share = impls.length === 0 ? 0 : top / impls.length;
  return {
    eligible:
      impls.length >= MIN_IMPLEMENTATIONS &&
      counts.size >= MIN_PUBLISHERS &&
      share < MAX_PUBLISHER_SHARE,
    implementations: impls.length,
    publishers: counts.size,
    topPublisherShare: share,
  };
}

/** Topics that currently clear the bar. Drives both the route and the sitemap. */
export function eligibleTopics(servers: readonly IndexedServer[]): Topic[] {
  return TOPICS.filter((t) => topicEligibility(servers, t).eligible);
}
