import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'mcpindex Docs - call the verdict from your agent';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Docs"
        title="Call the verdict from your agent."
        sub="The gate pattern, the verdict contract, and integration for LangChain, DSPy, Cursor, Cline, and Zed."
      />
    ),
    size,
  );
}
