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
      resolveServerRedirect('eu-ansvar-eu-regulations-mcp', active, new Map()),
      'eu-ansvar-eu-regulations',
    );
  });

  it('resolveServerRedirect strips trailing -mcp when unique', () => {
    const active = new Set(['acme-widget']);
    assert.equal(resolveServerRedirect('acme-widget-mcp', active, new Map()), 'acme-widget');
  });

  it('resolveServerRedirect uses unique prefix rename', () => {
    const active = new Set(['com-crosswire-api-crosswire-polymarket-kalshi-arbitrage']);
    assert.equal(
      resolveServerRedirect('com-crosswire-api-crosswire', active, new Map()),
      'com-crosswire-api-crosswire-polymarket-kalshi-arbitrage',
    );
  });

  it('resolveServerRedirect refuses ambiguous prefix matches', () => {
    const active = new Set(['foo-bar', 'foo-baz']);
    assert.equal(resolveServerRedirect('foo', active, new Map()), null);
  });

  it('resolveServerRedirect is a no-op for live slugs', () => {
    const active = new Set(['live-slug']);
    assert.equal(resolveServerRedirect('live-slug', active, new Map()), null);
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
    // The live slug must be EXACTLY what a shape rule would compute from the input, or the
    // `activeSlugs.has(moved)` guard swallows the mutation and this asserts nothing. The
    // first version used a 16-hex live slug against a 12-hex input, so a reinstated shape
    // rule passed 12/12 — the tenth vacuous pin in this work.
    const guessed = 'victim-slug--0123456789ab'; // what /^(.+)-([0-9a-f]{12})$/ would build
    const active = new Set([guessed]);
    assert.equal(
      resolveServerRedirect('victim-slug-0123456789ab', active, new Map()),
      null,
      'the shape alone must never produce a redirect, even when the target is live',
    );
  });

  it('redirects a legacy slug ONLY to the server it actually belonged to', () => {
    // Both `--` targets are the exact strings a shape rule would compute, so the negative
    // case below fails for the right reason rather than because the target happened to be
    // absent.
    const active = new Set(['a--111111111111', 'unrelated--222222222222']);
    const legacy = new Map([['a-111111111111', 'a--111111111111']]);
    assert.equal(resolveServerRedirect('a-111111111111', active, legacy), 'a--111111111111');
    // Absent from the map -> no redirect, even though the shape matches AND the guessed
    // destination is live. This is the assertion a shape rule must fail.
    assert.equal(resolveServerRedirect('unrelated-222222222222', active, legacy), null);
  });

  it('will not redirect to a destination that is no longer active', () => {
    const legacy = new Map([['a-111111111111', 'a--111111111111']]);
    assert.equal(resolveServerRedirect('a-111111111111', new Set<string>(), legacy), null);
  });
});
