import { ImageResponse } from 'next/og';
import { BrandOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'mcpindex Methodology - how a verdict is produced, end to end';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <BrandOg
        eyebrow="Methodology · v1 advisory"
        title="How a verdict is produced."
        sub="Hybrid eval: a deterministic conformance probe and an adversarial LLM judge, with OTS Bitcoin-anchored history."
      />
    ),
    size,
  );
}
