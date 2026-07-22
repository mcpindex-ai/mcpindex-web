import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getSeededRedirect,
  isGoneSlug,
  resolveServerRedirect,
} from './serverRemovals';

describe('serverRemovals', () => {
  it('returns seeded redirects', () => {
    assert.equal(
      getSeededRedirect('eu-ansvar-eu-regulations-mcp'),
      'eu-ansvar-eu-regulations',
    );
  });

  it('flags known-gone GSC hard-404s', () => {
    assert.equal(isGoneSlug('net-csclear-venue'), true);
    assert.equal(isGoneSlug('eu-ansvar-romanian-law-mcp'), false);
  });

  it('resolveServerRedirect prefers seeded when active', () => {
    const active = new Set(['eu-ansvar-eu-regulations']);
    assert.equal(
      resolveServerRedirect('eu-ansvar-eu-regulations-mcp', active),
      'eu-ansvar-eu-regulations',
    );
  });

  it('resolveServerRedirect strips trailing -mcp when unique', () => {
    const active = new Set(['acme-widget']);
    assert.equal(resolveServerRedirect('acme-widget-mcp', active), 'acme-widget');
  });

  it('resolveServerRedirect uses unique prefix rename', () => {
    const active = new Set(['com-crosswire-api-crosswire-polymarket-kalshi-arbitrage']);
    assert.equal(
      resolveServerRedirect('com-crosswire-api-crosswire', active),
      'com-crosswire-api-crosswire-polymarket-kalshi-arbitrage',
    );
  });

  it('resolveServerRedirect refuses ambiguous prefix matches', () => {
    const active = new Set(['foo-bar', 'foo-baz']);
    assert.equal(resolveServerRedirect('foo', active), null);
  });

  it('resolveServerRedirect is a no-op for live slugs', () => {
    const active = new Set(['live-slug']);
    assert.equal(resolveServerRedirect('live-slug', active), null);
  });

  it('getSeededRedirect rejects path-shaped destinations', () => {
    // Defense: even if JSON were poisoned, only bare slugs may redirect.
    assert.equal(getSeededRedirect('../api/mcp'), null);
  });

  it('seeds publisher-rename redirects from GSC batch 2', () => {
    assert.equal(
      getSeededRedirect('io-github-benzsevern-goldenpipe'),
      'io-github-benseverndev-oss-goldenpipe',
    );
    assert.equal(isGoneSlug('ai-31st-mcp'), true);
    assert.equal(isGoneSlug('xyz-perpvue-mcp'), false);
  });
});
