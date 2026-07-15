import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'mcpindex Docs - install the in-path trust gate';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Docs"
        title="Install the gate. Or call the directory."
        sub="Pin contracts and HOLD silent drift in-path - then the advisory screen API, verdict contract, and host wiring for Claude, Cursor, Gemini, Cline, and Zed."
      />
    ),
    size,
  );
}
