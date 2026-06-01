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
        sub="The verdict API and the screener are free, no key required. Paid tiers ship as coverage and the Pro tier land."
      />
    ),
    size,
  );
}
