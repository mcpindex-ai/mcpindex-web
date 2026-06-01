import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'mcpindex Screen - paste a tool description, get a verdict';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Screen"
        title="Paste a tool description. Get a verdict."
        sub="A live LLM judge reads it for hidden instructions, exfiltration, and overclaims. Advisory, semantic-only."
      />
    ),
    size,
  );
}
