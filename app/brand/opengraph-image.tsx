import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'The mcpindex brand kit';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Brand"
        title="The mcpindex brand kit."
        sub="The bracket-verdict mark, the seal, the color and type system, and downloadable logo and social assets."
      />
    ),
    size,
  );
}
