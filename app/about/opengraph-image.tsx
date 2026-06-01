import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'About mcpindex - the trust-to-act layer for agent tool use';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="About"
        title="The trust-to-act layer for agent tool use."
        sub="The gap between a tool existing and an agent being safe to call it without you watching."
      />
    ),
    size,
  );
}
