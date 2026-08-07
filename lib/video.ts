/**
 * VideoObject + Clip JSON-LD for the two films, and the timestamped transcript that
 * actually earns citations.
 *
 * WHY THIS SHAPE. An answer engine cannot watch a video, the same way it cannot read a
 * picture - which is why every diagram on this site ships a plain-text rendering beside
 * its SVG. The film is a ranking and engagement surface; `transcriptFor()` is the asset
 * that gets ingested and quoted. Ship both or the video work is decorative.
 *
 * WHY hasPart. Key-moment results are the difference between one opaque thumbnail and a
 * search result that jumps to the beat answering the query. The offsets come from the
 * beat grid in SCRIPT-v4.md via `seo/extract-beats.mjs`, so they cannot drift from the
 * cut: re-run the extractor after a re-cut and this file needs no edit.
 *
 * Landing: copy to `mcpindex-web/lib/video.ts` with `beats.json` alongside as
 * `data/video-beats.json`. No dependencies, no I/O, deterministic - safe in a Server
 * Component and in the sitemap route.
 */

export type Beat = {
  readonly id: string;
  readonly title: string;
  readonly start: number;
  readonly end: number;
  readonly words: number;
  readonly vo: string;
  readonly captions: readonly string[];
};

export type Film = {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly duration: number;
  readonly words: number;
  readonly beats: readonly Beat[];
};

const ORIGIN = 'https://mcpindex.ai';

/** ISO 8601 duration. Google rejects a bare integer, and 112 -> "PT1M52S". */
export function isoDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    throw new RangeError(`isoDuration: expected positive seconds, got ${totalSeconds}`);
  }
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `PT${m ? `${m}M` : ''}${rem || !m ? `${rem}S` : ''}`;
}

/**
 * Per-film search metadata. Written as the question each film answers, in the words a
 * person types - NOT as the film's on-screen title. `/demo`'s current h1 ("How to use it
 * - and share it.") is the counter-example: nobody searches for it.
 *
 * Keep `name` under ~100 chars: it is the result title.
 */
const SEARCH_COPY: Record<string, { name: string; description: string; page: string }> = {
  concept: {
    name: 'Can an MCP tool change after your agent trusts it?',
    description:
      'A measured answer. 205 tools declared themselves read-only and then flipped that hint toward ' +
      'write, delete or send, with the same name and the same key in your config. This film shows ' +
      'what a tool contract is, why access control and version pinning both miss a contract change, ' +
      'and how an in-path gate pins each contract, diffs it on every call, and stops the call when ' +
      'it changes. It is a contract-diff, not a safety verdict, and the film says where it stops. ' +
      'Figures are stated as of the date shown; the live record is at mcpindex.ai/ledger.',
    page: '/watch/mcp-tool-contract-drift',
  },
  howto: {
    name: 'How to install the mcpindex gate in Claude Desktop, Cursor or VS Code',
    description:
      'Two commands, no pipe-to-shell. The wizard wires every MCP host it finds, marks each entry ' +
      'it rewrites so one command unwires it, and pins every tool on the first tools/list. Then ' +
      'nothing happens until your first hold. Also covers the browser-only scan if you are not ' +
      'ready to put anything in your call path, and the SDK path if you are building your own agent.',
    page: '/watch/install-the-mcpindex-gate',
  },
};

/**
 * ONE film per page. Google indexes a single prominent video per page, so the two
 * co-equal <video> sections on /demo are why the Video indexing report reads
 * "No video indexed: 1". Structured data alone does not fix that - the split does.
 *
 * These are the minimum two URLs; do not mint more. The logged SEO baseline reads the
 * average-position decline as dilution, so every added URL is a cost.
 */
export function pageFor(film: Film): string {
  return SEARCH_COPY[film.id]?.page ?? `/watch/${film.slug}`;
}

/**
 * The search copy for a film, for the page that renders it.
 *
 * Exported so the <h1>, the <title> and the JSON-LD `name` all read from ONE string. Two
 * copies of a title drift, and when they do, the search result promises something the page
 * does not say - which is the same class of defect as a Clip offset pointing at silence.
 */
export function searchCopy(id: string): { name: string; description: string; page: string } {
  const copy = SEARCH_COPY[id];
  if (!copy) throw new Error(`videoSchema: no search copy for film "${id}"`);
  return copy;
}

/**
 * The transcript. Rendered on the page under the player AND emitted into llms.txt.
 * Beat headings carry the offset so a citation can point at a moment, matching the
 * `Clip` offsets exactly.
 */
export function transcriptFor(film: Film): string {
  const stamp = (n: number) =>
    `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  return film.beats
    .map((b) => {
      const captions = b.captions.length ? `\nOn screen: ${b.captions.join(' · ')}` : '';
      return `[${stamp(b.start)}] ${b.title}\n${b.vo}${captions}`;
    })
    .join('\n\n');
}

export function videoObject(
  film: Film,
  opts: { readonly uploadDate: string; readonly thumbnail: string },
): Record<string, unknown> {
  const copy = SEARCH_COPY[film.id];
  if (!copy) throw new Error(`videoSchema: no search copy for film "${film.id}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.uploadDate)) {
    throw new Error(`videoSchema: uploadDate must be YYYY-MM-DD, got "${opts.uploadDate}"`);
  }

  const page = `${ORIGIN}${copy.page}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: copy.name,
    description: copy.description,
    uploadDate: opts.uploadDate,
    duration: isoDuration(film.duration),
    thumbnailUrl: [`${ORIGIN}${opts.thumbnail}`],
    contentUrl: `${ORIGIN}/promo/${film.slug}.mp4`,
    // Paired with the watch page, NOT the film slug. `/watch/x` and `/embed/x` addressing
    // the same film by different names is how embedUrl came to point at a 404: the route
    // is generated from `pageFor()`, and this line used `film.slug`. Caught by parsing the
    // JSON-LD out of the prerendered HTML rather than trusting that the build succeeded.
    embedUrl: `${ORIGIN}/embed/${copy.page.replace('/watch/', '')}`,
    url: page,
    isFamilyFriendly: true,
    inLanguage: 'en',
    transcript: transcriptFor(film),
    publisher: {
      '@type': 'Organization',
      name: 'mcpindex',
      url: ORIGIN,
      logo: { '@type': 'ImageObject', url: `${ORIGIN}/icon.svg` },
    },
    // Key moments. `url` with a media fragment is what makes the beat addressable.
    hasPart: film.beats.map((b) => ({
      '@type': 'Clip',
      name: b.title,
      startOffset: b.start,
      endOffset: b.end,
      url: `${page}#t=${b.start}`,
    })),
  };
}

/** Rows for the video sitemap extension. Pair with xmlns:video on <urlset>. */
export function sitemapVideo(
  film: Film,
  opts: { readonly uploadDate: string; readonly thumbnail: string },
) {
  const copy = SEARCH_COPY[film.id];
  if (!copy) throw new Error(`videoSchema: no search copy for film "${film.id}"`);
  return {
    loc: `${ORIGIN}${copy.page}`,
    title: copy.name,
    description: copy.description,
    thumbnail_loc: `${ORIGIN}${opts.thumbnail}`,
    content_loc: `${ORIGIN}/promo/${film.slug}.mp4`,
    duration: film.duration,
    publication_date: opts.uploadDate,
  };
}
