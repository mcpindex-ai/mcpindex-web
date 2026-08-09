import { imageConfigDefault } from 'next/dist/shared/lib/image-config';

/**
 * Optimized `poster` URLs for the <video> players.
 *
 * WHY THIS EXISTS. `next/image` cannot render a `poster` - the attribute takes a URL, not an
 * element - so the four players (/watch, /embed/<slug>, /demo via PromoVideos, and the static
 * public/embed.html) each shipped the raw 1920x1080 JPEG. On /demo that poster IS the LCP
 * element and cost 236.7 KiB against a page scoring 89 with a 3.8s LCP (Lighthouse 12, mobile,
 * simulated, 2026-08-09). Same class of defect as the homepage cards, one surface over.
 *
 * WHY NOT `thumbnailFor()`. That function feeds the video sitemap (app/sitemap.ts), the
 * VideoObject `thumbnailUrl` and the OG image (app/watch/[slug]/page.tsx). Those consumers
 * need a permanent, canonical image URL - handing Google an `/_next/image?...` query string
 * is a different and worse defect. `thumbnailFor()` stays the source of truth; this derives
 * a display copy from it.
 *
 * WHY ONE WIDTH AND NOT A SRCSET. `poster` accepts a single URL, so there is no responsive
 * variant to pick per device. 1080 is the compromise: 1:1 on a full-width desktop player, and
 * on a phone the browser downsamples 1080 -> ~720 device px, which is invisible. Measured
 * against the same source: 1080w WebP is 16 KiB where the JPEG is 236 KiB.
 *
 * WHY THE URL IS BUILT AND NOT TAKEN FROM `getImageProps()`. Two reasons, and the second is
 * the deciding one. (1) `getImageProps().props.src` is the no-srcset FALLBACK and is always
 * the largest deviceSize (3840) whatever `width` you pass, so the value you actually want is
 * the `1x` entry of `srcSet` - extracting it means string-parsing an internal shape, which is
 * no more stable than building the URL. (2) `next/image` cannot be imported under
 * `--conditions=react-server`, which is how this repo runs `test:lib`, so a getImageProps
 * version is untestable here and the guard below could not exist. The query contract
 * (`?url=&w=&q=`) is the same one every custom `images.loader` implements.
 */

/** The single width every player gets. See "WHY ONE WIDTH" above before changing it. */
export const POSTER_WIDTH = 1080;

/** Matches next/image's default. Must stay inside `images.qualities` - asserted below. */
export const POSTER_QUALITY = 75;

/**
 * `next.config.ts` deliberately does not configure `images`, so Next's defaults are the live
 * values. `lib/posters.test.ts` fails if that stops being true, which is the signal to come
 * back here rather than let a config change silently 400 every poster request.
 */
const { path: IMAGE_PATH, deviceSizes, imageSizes, qualities } = imageConfigDefault;

/**
 * The optimizer URL for a poster, at {@link POSTER_WIDTH}.
 *
 * Both guards fail loud on purpose: every caller renders at build time, so a config drift
 * fails the build instead of shipping players whose poster 400s.
 */
export function optimizedPosterSrc(src: string): string {
  if (![...deviceSizes, ...imageSizes].includes(POSTER_WIDTH)) {
    throw new Error(`posters: ${POSTER_WIDTH} is not an allowed image width`);
  }
  // `qualities` is optional in the ImageConfig type (an unset allowlist means "no restriction"
  // upstream), so an absent value is fine - only an explicit list that excludes ours is a bug.
  if (qualities && !qualities.includes(POSTER_QUALITY)) {
    throw new Error(`posters: quality ${POSTER_QUALITY} is not in images.qualities`);
  }
  return `${IMAGE_PATH}?url=${encodeURIComponent(src)}&w=${POSTER_WIDTH}&q=${POSTER_QUALITY}`;
}
