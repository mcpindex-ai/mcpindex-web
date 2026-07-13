import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'Search mcpindex - find an MCP server and its advisory screen verdict';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Search"
        title="Find an MCP server."
        sub="Search the public directory by name, category, or keyword. Open any server for its advisory screen (REVIEW/UNVERIFIED at v1) and maturity score — not a safety clearance."
      />
    ),
    size,
  );
}
