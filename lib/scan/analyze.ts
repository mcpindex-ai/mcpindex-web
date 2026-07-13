// Pure orchestration: raw pasted text -> a rendered-ready Analysis. Kept out of
// the React component so it stays deterministic and unit-testable (the component
// only renders the result). See scan.test.ts.

import { tolerantParse, detectInput } from './parse';
import { classifyTools, summarize } from './summarize';
import type { ScanSummary } from './types';

export type Analysis =
  | { readonly kind: 'summary'; readonly data: ScanSummary; readonly source: 'sample' | 'config' | 'tools' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'invalid' };

/** Parse (tolerantly), detect the input grade, and summarize. Total — invalid
 * JSON -> 'invalid', valid-but-empty -> 'unknown'. Never throws. */
export function analyze(text: string): Analysis {
  const parsed = tolerantParse(text);
  if (parsed === undefined) return { kind: 'invalid' };
  const d = detectInput(parsed);
  if (d.kind === 'config') return { kind: 'summary', data: summarize(d.servers, []), source: 'config' };
  if (d.kind === 'tools') return { kind: 'summary', data: summarize([], classifyTools(d.tools)), source: 'tools' };
  return { kind: 'unknown' };
}
