import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'mcpindex Status - data freshness, coverage, and checkable endpoints';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Status"
        title="System status."
        sub="Real freshness and coverage figures, checkable live endpoints, and the incident log."
      />
    ),
    size,
  );
}
