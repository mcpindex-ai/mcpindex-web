// VideoObject / Clip JSON-LD for the two films.
//
// These exist because every defect this file guards against shipped LIVE and was caught by
// a human or a validator, not by us: an embedUrl pointing at a 404, the TTS phonetic in the
// citable transcript, and an uploadDate in the one format Google rejects - which our own
// validator REQUIRED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoObject, transcriptFor, writtenForm, pageFor, searchCopy } from './video';
import { allFilms, thumbnailFor, youtubeFor, FILM_UPLOAD_DATE } from './films';

const OPTS = (id: string) => ({
  uploadDate: FILM_UPLOAD_DATE,
  thumbnail: thumbnailFor(id),
});

test('uploadDate is ISO 8601 WITH a timezone', () => {
  // Google's Rich Results Test on a bare "2026-08-07": "Invalid datetime value" and
  // "Datetime property uploadDate is missing a timezone". The old validator required
  // exactly that bare form, so it guaranteed the shape the consumer refuses.
  assert.match(FILM_UPLOAD_DATE, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/);
  assert.ok(!Number.isNaN(Date.parse(FILM_UPLOAD_DATE)), 'must actually parse as a date');
});

test('videoObject REJECTS a bare date', () => {
  const { id, film } = allFilms()[0];
  assert.throws(
    () => videoObject(film, { uploadDate: '2026-08-07', thumbnail: thumbnailFor(id) }),
    /timezone/i,
  );
});

test('every film emits a complete, self-consistent VideoObject', () => {
  for (const { id, film } of allFilms()) {
    const ld = videoObject(film, OPTS(id)) as Record<string, unknown>;
    assert.equal(ld['@type'], 'VideoObject');
    // The title on the page, in <title>, and here must be ONE string.
    assert.equal(ld.name, searchCopy(id).name);
    assert.equal(ld.url, `https://mcpindex.ai${pageFor(film)}`);
    // Clips must cover the cut contiguously - an offset pointing at silence is worse
    // than shipping no key moments at all.
    const clips = ld.hasPart as Array<{ startOffset: number; endOffset: number }>;
    assert.equal(clips.length, film.beats.length);
    assert.equal(clips[0].startOffset, 0);
    assert.equal(clips[clips.length - 1].endOffset, film.duration);
    for (let i = 1; i < clips.length; i++) {
      assert.equal(clips[i].startOffset, clips[i - 1].endOffset, 'no gap or overlap');
    }
  }
});

test('embedUrl is paired with the watch slug, not the film slug', () => {
  // These diverged once: the JSON-LD advertised /embed/mcpindex-promo while the route
  // served /embed/mcp-tool-contract-drift, so the structured data pointed at a 404.
  for (const { id, film } of allFilms()) {
    const ld = videoObject(film, OPTS(id)) as Record<string, string>;
    const slug = pageFor(film).replace('/watch/', '');
    assert.equal(ld.embedUrl, `https://mcpindex.ai/embed/${slug}`);
  }
});

test('the transcript never leaks a TTS phonetic', () => {
  // The manifest stores VO written for a speech synthesiser. Rendered as text,
  // "MCP index dot A I slash install" is a URL no reader can click and no answer engine
  // can resolve - on pages whose whole purpose is being citable.
  const SPOKEN = ['MCP index dot A I', 'MCP dot json', 'D O I ', 'read only'];
  for (const { film } of allFilms()) {
    const t = transcriptFor(film);
    for (const p of SPOKEN) assert.ok(!t.includes(p), `transcript leaks: ${p}`);
  }
  assert.equal(writtenForm('Start at MCP index dot A I slash install.'),
    'Start at mcpindex.ai/install.');
  assert.equal(writtenForm('Your MCP dot json holds your tokens.'),
    'Your mcp.json holds your tokens.');
});

test('sameAs points each film at ITS OWN YouTube upload', () => {
  // The two ids arrived in the opposite order to the film list; wiring them by position
  // would have cross-linked the films, and both values look plausible either way.
  const seen = new Set<string>();
  for (const { id, film } of allFilms()) {
    const yt = youtubeFor(id);
    if (!yt) continue;
    const ld = videoObject(film, { ...OPTS(id), sameAs: [yt] }) as Record<string, string[]>;
    assert.deepEqual(ld.sameAs, [yt]);
    assert.ok(!seen.has(yt), 'two films must not claim the same video');
    seen.add(yt);
  }
});
