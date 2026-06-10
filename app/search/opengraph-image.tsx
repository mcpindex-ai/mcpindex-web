import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'Search mcpindex - find an MCP server and its trust verdict';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Search"
        title="Find an MCP server."
        sub="Search the public directory by name, category, or keyword, and open any server for its trust verdict and maturity score."
      />
    ),
    size,
  );
}
