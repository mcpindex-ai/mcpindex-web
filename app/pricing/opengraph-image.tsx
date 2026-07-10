import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'mcpindex Pricing - free for the open web';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Pricing"
        title="Free for the open web."
        sub="The gate, the SDK, the drift network, and the trust API are all free, no key required. Enterprise is the only paid tier."
      />
    ),
    size,
  );
}
