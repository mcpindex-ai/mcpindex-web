import type { ReactNode } from 'react';
import { getDiagram } from '@/lib/diagrams';

/**
 * Shared SVG vocabulary for the figure set.
 *
 * These are hardcoded hex values, not CSS custom properties, on purpose: each figure is also
 * served standalone as image/svg+xml from /diagrams/<id>/svg for CC-BY reuse, where no
 * stylesheet exists. The site is light-only by design (app/globals.css force-resets any
 * browser dark-mode override), so a paper ground is correct in every context.
 *
 * CONTRAST RULE - load-bearing, and guard-checked by scripts/check-diagram-freshness.mjs:
 * ACCENT (#ea580c) is 3.56:1 on white and FAILS the AA floor for text. It is legal as a stroke,
 * a fill, an arrowhead or a marker, and it is legal as TEXT on INK (5.56:1). Accent text on a
 * light ground must always be ACCENT_TEXT (#c2410c, 5.18:1). Never use ACCENT on a <text fill>
 * over paper.
 */
export const FONT_MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace';
export const FONT_SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export const INK = '#0a0a0a';
export const PAPER = '#ffffff';
export const RULE = '#e7e5e4';
export const FAINT = '#d6d3d1';
export const GHOST = '#a8a29e';
export const MUTE = '#78716c';
export const CITE = '#0f172a';
export const ACCENT = '#ea580c';
export const ACCENT_TEXT = '#c2410c';
/**
 * The SAME hue as ACCENT, aliased so the rule is machine-checkable.
 * Accent is 3.56:1 on paper (fails AA for text) but 5.56:1 on INK (passes). Text that sits on
 * an ink ground is therefore allowed to use it - and must say so by using this name, because
 * scripts/check-diagram-freshness.mjs rejects `fill={ACCENT}` on any text node outright. One
 * alias turns "remember the contrast rule" into a build failure.
 */
export const ON_INK_ACCENT = '#ea580c';
export const ACCENT_DEEP = '#9a3412';
export const ACCENT_SOFT = '#fff7ed';
export const SHADE = '#fafaf9';
export const ON_INK = '#f4f4f5';
export const ON_INK_MUTE = '#a1a1aa';

/** The site's <svg> shell. Pulls role + aria-label from the registry so they cannot drift. */
export function Canvas({
  id,
  w,
  h,
  children,
}: {
  id: string;
  w: number;
  h: number;
  children: ReactNode;
}) {
  const d = getDiagram(id);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={d?.alt ?? ''}
      width="100%"
      style={{ height: 'auto', display: 'block' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{d?.title ?? ''}</title>
      <desc>{d?.alt ?? ''}</desc>
      {children}
    </svg>
  );
}

type Tone = 'ink' | 'accent' | 'ghost' | 'shade';

const BOX_STROKE: Record<Tone, string> = {
  ink: INK,
  accent: ACCENT,
  ghost: FAINT,
  shade: RULE,
};
const BOX_FILL: Record<Tone, string> = {
  ink: PAPER,
  accent: ACCENT_SOFT,
  ghost: PAPER,
  shade: SHADE,
};

export function Box({
  x,
  y,
  w,
  h,
  tone = 'shade',
  dashed = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: Tone;
  dashed?: boolean;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill={BOX_FILL[tone]}
      stroke={BOX_STROKE[tone]}
      strokeWidth={tone === 'accent' ? 1.5 : 1}
      strokeDasharray={dashed ? '3 3' : undefined}
    />
  );
}

/** Mono text. `caps` adds the site's tracking for uppercase labels. */
export function M({
  x,
  y,
  children,
  size = 10,
  fill = MUTE,
  caps = false,
  anchor = 'start',
  weight,
}: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  fill?: string;
  caps?: boolean;
  anchor?: 'start' | 'middle' | 'end';
  weight?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fontFamily={FONT_MONO}
      fontSize={size}
      fill={fill}
      textAnchor={anchor}
      fontWeight={weight}
      letterSpacing={caps ? '0.14em' : undefined}
    >
      {children}
    </text>
  );
}

/** Sans text, for prose inside a figure. */
export function S({
  x,
  y,
  children,
  size = 12.5,
  fill = CITE,
  anchor = 'start',
  weight,
}: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  weight?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fontFamily={FONT_SANS}
      fontSize={size}
      fill={fill}
      textAnchor={anchor}
      fontWeight={weight}
    >
      {children}
    </text>
  );
}

/** Horizontal arrow. `dir` -1 points left. */
export function ArrowR({
  x1,
  x2,
  y,
  stroke = INK,
  dashed = false,
}: {
  x1: number;
  x2: number;
  y: number;
  stroke?: string;
  dashed?: boolean;
}) {
  const dir = x2 >= x1 ? 1 : -1;
  const tip = x2;
  return (
    <g>
      <line
        x1={x1}
        y1={y}
        x2={tip - 5 * dir}
        y2={y}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray={dashed ? '4 3' : undefined}
      />
      <polyline
        points={`${tip - 6 * dir},${y - 4.5} ${tip},${y} ${tip - 6 * dir},${y + 4.5}`}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Vertical arrow, downward. */
export function ArrowD({
  x,
  y1,
  y2,
  stroke = INK,
  dashed = false,
}: {
  x: number;
  y1: number;
  y2: number;
  stroke?: string;
  dashed?: boolean;
}) {
  return (
    <g>
      <line
        x1={x}
        y1={y1}
        x2={x}
        y2={y2 - 5}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray={dashed ? '4 3' : undefined}
      />
      <polyline
        points={`${x - 4.5},${y2 - 6} ${x},${y2} ${x + 4.5},${y2 - 6}`}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/**
 * The HOLD glyph, drawn rather than typed.
 * A stop-bar reads as "stopped here" without relying on colour alone - meaning must never be
 * carried by hue, per the site's accessibility target. It also avoids a font-coverage gamble on
 * the mathematical character in a standalone SVG.
 */
export function HoldGlyph({
  x,
  y,
  stroke = ACCENT,
  scale = 1,
}: {
  x: number;
  y: number;
  stroke?: string;
  scale?: number;
}) {
  const w = 16 * scale;
  const h = 7 * scale;
  return (
    <g>
      <line x1={x} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={x + w} y1={y - h} x2={x + w} y2={y + h} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
}

/** A hairline separator. */
export function Rule({ x1, x2, y, stroke = RULE }: { x1: number; x2: number; y: number; stroke?: string }) {
  return <line x1={x1} y1={y} x2={x2} y2={y} stroke={stroke} strokeWidth={1} />;
}

/** The kicker every figure closes on: the honest edge, in the figure, not under it. */
export function FootNote({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  return (
    <g>
      <Rule x1={x} x2={x + w} y={y - 18} />
      <M x={x} y={y} caps size={10}>
        {children}
      </M>
    </g>
  );
}
