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

describe('legacy disambiguation redirects', () => {
  it('does not fire without an explicit map, and never guesses from the slug shape', () => {
    // `{x}-{12hex}` is also a perfectly ordinary bare slug. A pattern rule could not tell a
    // former slug from a live server's real one, so it would 308 a dead URL onto an
    // UNRELATED subject — permanently, carrying its canonical link equity with it.
    const active = new Set(['victim-slug--0123456789abcdef']);
    assert.equal(
      resolveServerRedirect('victim-slug-0123456789ab', active),
      null,
      'the shape alone must never produce a redirect',
    );
  });

  it('redirects a legacy slug ONLY to the server it actually belonged to', () => {
    const active = new Set(['a--1111111111111111', 'unrelated--2222222222222222']);
    const legacy = new Map([['a-111111111111', 'a--1111111111111111']]);
    assert.equal(resolveServerRedirect('a-111111111111', active, legacy), 'a--1111111111111111');
    // A legacy-shaped slug absent from the map resolves to nothing, even though a plausible
    // `--` target is live.
    assert.equal(resolveServerRedirect('unrelated-222222222222', active, legacy), null);
  });

  it('will not redirect to a destination that is no longer active', () => {
    const legacy = new Map([['a-111111111111', 'a--1111111111111111']]);
    assert.equal(resolveServerRedirect('a-111111111111', new Set<string>(), legacy), null);
  });
});
