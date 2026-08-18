// Head-name servers people ask for that have NO vendor-published registry entry.
//
// Origin: a 163-name spot check of Reddit-cited servers (2026-08-18,
// tasks/mcpindex-reddit-spotcheck-2026-08-18.md in the GBCode workspace) found
// 47 with no relevant corpus hit. The head names below carry real search
// demand; the honest page for each states the registry status, lists the
// community servers that carry the name, and says what "unregistered" means
// for trust. When a vendor registers, the tripwire test in
// lib/unregistered.test.ts fails and the entry converts to a normal server
// page (delete it here).
//
// Claims discipline: every page statement must be derivable from the corpus at
// build time. `officialNamespaces` is the list of namespaces that would count
// as vendor-owned; the test asserts none exists in the snapshot, which is what
// keeps the page's headline true. `note` is reserved for externally sourced
// context and stays empty unless we hold a source.

import { searchableName } from './search';
import type { IndexedServer } from './types';

export type UnregisteredEntry = {
  /** /unregistered/<slug> */
  slug: string;
  /** Display name: "Canva" */
  name: string;
  /** Who would own the official entry. */
  vendor: string;
  /** The single name token users search for. Lowercase. */
  token: string;
  /** Namespaces that would count as vendor-owned. Lowercase. */
  officialNamespaces: string[];
  /** Sourced context line; omit when we hold no source. */
  note?: string;
};

export const UNREGISTERED: UnregisteredEntry[] = [
  {
    slug: 'canva',
    name: 'Canva',
    vendor: 'Canva',
    token: 'canva',
    officialNamespaces: ['com.canva', 'dev.canva', 'io.github.canva'],
  },
  {
    slug: 'matlab',
    name: 'MATLAB',
    vendor: 'MathWorks',
    token: 'matlab',
    officialNamespaces: ['com.mathworks', 'io.github.mathworks'],
    note: 'MathWorks documents a vendor-hosted MATLAB MCP server on mathworks.com. It has not been published to the registry.',
  },
  {
    slug: 'okta',
    name: 'Okta',
    vendor: 'Okta',
    token: 'okta',
    officialNamespaces: ['com.okta', 'io.github.okta'],
  },
  {
    slug: 'slack',
    name: 'Slack',
    vendor: 'Slack',
    token: 'slack',
    officialNamespaces: ['com.slack', 'io.github.slackapi', 'io.github.slackhq'],
  },
  {
    slug: 'datadog',
    name: 'Datadog',
    vendor: 'Datadog',
    token: 'datadog',
    officialNamespaces: ['com.datadoghq', 'com.datadog', 'io.github.datadog'],
  },
  {
    slug: 'hubspot',
    name: 'HubSpot',
    vendor: 'HubSpot',
    token: 'hubspot',
    officialNamespaces: ['com.hubspot', 'io.github.hubspot'],
  },
  {
    slug: 'cloudflare',
    name: 'Cloudflare',
    vendor: 'Cloudflare',
    token: 'cloudflare',
    officialNamespaces: ['com.cloudflare', 'io.github.cloudflare'],
  },
  {
    slug: 'shopify',
    name: 'Shopify',
    vendor: 'Shopify',
    token: 'shopify',
    officialNamespaces: ['com.shopify', 'dev.shopify', 'io.github.shopify'],
  },
  {
    slug: 'elevenlabs',
    name: 'ElevenLabs',
    vendor: 'ElevenLabs',
    token: 'elevenlabs',
    officialNamespaces: ['io.elevenlabs', 'com.elevenlabs', 'io.github.elevenlabs'],
  },
  {
    slug: 'rollbar',
    name: 'Rollbar',
    vendor: 'Rollbar',
    token: 'rollbar',
    officialNamespaces: ['com.rollbar', 'io.github.rollbar'],
  },
  {
    slug: 'deepwiki',
    name: 'DeepWiki',
    vendor: 'Cognition (DeepWiki)',
    token: 'deepwiki',
    officialNamespaces: ['com.deepwiki', 'ai.deepwiki', 'io.github.cognition-ai'],
  },
  {
    slug: 'crawl4ai',
    name: 'Crawl4AI',
    vendor: 'the Crawl4AI project',
    token: 'crawl4ai',
    officialNamespaces: ['io.github.unclecode', 'com.crawl4ai'],
    note: 'Crawl4AI is distributed on GitHub and PyPI rather than through the registry.',
  },
  {
    slug: 'taskmaster',
    name: 'Task Master',
    vendor: 'the Task Master project',
    token: 'taskmaster',
    officialNamespaces: ['io.github.eyaltoledano', 'com.task-master'],
    note: 'Task Master is distributed on GitHub and npm rather than through the registry.',
  },
];

export function getUnregistered(slug: string): UnregisteredEntry | undefined {
  return UNREGISTERED.find((e) => e.slug === slug);
}

const MAX_COMMUNITY = 8;

// Token-level name match, deliberately stricter than lib/search: "canva" must
// NOT surface Canvas-LMS servers, so the token has to equal a whole hyphen
// segment of the product name (or the flattened name itself), never a prefix.
export function communityServersFor(
  servers: IndexedServer[],
  entry: UnregisteredEntry,
): IndexedServer[] {
  const token = entry.token;
  return servers
    .filter((s) => {
      const clean = searchableName(s.name).toLowerCase();
      if (clean.replace(/-/g, '') === token) return true;
      return clean.split('-').includes(token);
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, MAX_COMMUNITY);
}

export function namespaceOfServer(name: string): string {
  const slash = name.indexOf('/');
  return (slash >= 0 ? name.slice(0, slash) : name).toLowerCase();
}
