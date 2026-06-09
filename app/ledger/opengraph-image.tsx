import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'mcpindex Drift ledger - contract changes observed by the crawler';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Drift ledger"
        title="Contract changes, observed."
        sub="Tools whose contract silently drifted between daily registry snapshots. A contract diff, not a safety verdict."
      />
    ),
    size,
  );
}
