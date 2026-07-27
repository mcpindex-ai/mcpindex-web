import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'mcpindex Trust - how a verdict is produced, provenance, and honest limits';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Trust"
        title="Trust, stated plainly."
        sub="How a verdict is produced, hash-chained provenance, the security model, and honest limits."
      />
    ),
    size,
  );
}
