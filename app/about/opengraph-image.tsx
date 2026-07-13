import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'About mcpindex - the in-path trust gate for agent tool calls';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="About"
        title="The in-path trust gate for agent tool calls."
        sub="Pin every MCP tool contract. HOLD the call the moment it silently changes. Independent; unaffiliated with Anthropic."
      />
    ),
    size,
  );
}
