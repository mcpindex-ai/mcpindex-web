import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt =
  'mcpindex whitepaper - the trust-to-act layer for agent tool calls: pin every tool contract, hold the call the moment it moves';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Whitepaper · v1.0"
        title="The trust-to-act layer for agent tool calls."
        sub="It pins every tool's contract and holds the call the moment that contract moves. A change detector, not a safety oracle. Free to read; free PDF."
      />
    ),
    size,
  );
}
