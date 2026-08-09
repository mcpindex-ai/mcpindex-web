import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { optimizedPosterSrc, POSTER_WIDTH, POSTER_QUALITY } from './posters';
import { allFilms, thumbnailFor } from './films';

test('poster URL routes through the optimizer at the requested width', () => {
  const url = optimizedPosterSrc('/promo/poster.jpg');
  assert.equal(url, `/_next/image?url=%2Fpromo%2Fposter.jpg&w=${POSTER_WIDTH}&q=${POSTER_QUALITY}`);
});

test('the source path is percent-encoded, not interpolated raw', () => {
  // A bare "/promo/a b.jpg" in a query value is a malformed URL the optimizer rejects.
  assert.match(optimizedPosterSrc('/promo/a b.jpg'), /url=%2Fpromo%2Fa%20b\.jpg/);
});

test('poster width is NOT the 3840 fallback that getImageProps().props.src returns', () => {
  // The trap this module exists to avoid: shipping a file larger than the JPEG it replaced.
  assert.doesNotMatch(optimizedPosterSrc('/promo/poster.jpg'), /[?&]w=3840(&|$)/);
  assert.ok(POSTER_WIDTH < 1920, 'a poster at or above the source width optimizes nothing');
});

test('every film thumbnail can be optimized', () => {
  for (const { id } of allFilms()) {
    assert.match(optimizedPosterSrc(thumbnailFor(id)), new RegExp(`[?&]w=${POSTER_WIDTH}(&|$)`));
  }
});

test('next.config.ts still leaves images unconfigured, so Next defaults are live', () => {
  // posters.ts reads width/quality allowlists from imageConfigDefault. The moment next.config
  // sets `images`, those defaults stop being the truth and a poster request can 400 with no
  // build-time signal. This is that signal.
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    config,
    /^\s*images\s*:/m,
    'next.config.ts now configures `images` - re-check POSTER_WIDTH/POSTER_QUALITY in lib/posters.ts',
  );
});

test('static public/embed.html carries the SAME optimizer URL as the React players', () => {
  // embed.html is hand-written static HTML on a third-party-embeddable surface, so it cannot
  // call optimizedPosterSrc() at render time - the URL is hardcoded. This test is the guard,
  // re-deriving the expected value so the two cannot drift apart unnoticed.
  const html = readFileSync(new URL('../public/embed.html', import.meta.url), 'utf8');
  const match = html.match(/poster="([^"]+)"/);
  assert.ok(match, 'public/embed.html has no poster attribute');
  assert.equal(
    match[1].replaceAll('&amp;', '&'),
    optimizedPosterSrc('/promo/poster.jpg'),
    'public/embed.html poster drifted from optimizedPosterSrc() - update the HTML',
  );
});
