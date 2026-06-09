import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'mcpindex Drift dashboard - opt-in adoption and crawl coverage';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Drift dashboard"
        title="Adoption and coverage."
        sub="Opt-in drift telemetry and public-registry crawl coverage. Counts reflect opted-in installs and crawler observations only, not total adoption."
      />
    ),
    size,
  );
}
