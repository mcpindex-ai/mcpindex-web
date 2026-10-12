// lint: off (this file lists the banned words it checks for)
//
// Mechanical prose check for text the publisher writes onto public pages: ASCII only, and none
// of the stock phrases or vocabulary that mark machine-written prose. It is the mechanical half
// only; it cannot see structure. The lists follow GB's house rule (sections 2, 3 and 5); keep
// them in step with ~/.claude/hooks/rule0_lib.py when either changes.

export const BANNED_PHRASES = [
  'great question', 'certainly', 'absolutely', "you're absolutely right", "i'd be happy to",
  'i hope this helps', 'feel free to', "don't hesitate to", 'let me know if', "let's dive in",
  "let's explore", "let's take a look", "it's worth noting", 'it is worth noting',
  "it's important to note", 'it should be noted', 'that said', 'that being said', 'at its core',
  'in essence', 'ultimately', 'in conclusion', 'in summary', 'the key takeaway',
  "here's the thing", 'the reality is', 'simply put', 'needless to say', 'it goes without saying',
  "in today's fast-paced world", 'in an era where', 'as we navigate', 'in the age of ai',
  'moreover', 'furthermore', 'additionally', 'consequently',
] as const;

export const BANNED_WORDS = [
  'delve', 'leverage', 'utilize', 'robust', 'seamless', 'landscape', 'realm', 'tapestry',
  'testament', 'underscore', 'underscores', 'pivotal', 'crucial', 'vital', 'myriad', 'plethora',
  'navigate', 'harness', 'unlock', 'elevate', 'empower', 'streamline', 'cutting-edge',
  'state-of-the-art', 'game-changer', 'best-in-class', 'world-class', 'holistic', 'synergy',
  'paradigm', 'ecosystem', 'journey', 'meticulous', 'intricate', 'nuanced', 'comprehensive',
  'vibrant', 'bustling', 'transformative', 'revolutionize', 'foster', 'embark', 'resonate',
  'curated', 'bespoke', 'granular', 'actionable', 'deep dive',
] as const;

export interface Rule0Hit {
  readonly kind: 'non-ascii' | 'phrase' | 'word';
  readonly match: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every Rule 0 mechanical hit in `text`. An empty list means it passes. */
export function rule0Hits(text: string): Rule0Hit[] {
  const hits: Rule0Hit[] = [];
  const nonAscii = [...new Set([...text].filter((c) => c.charCodeAt(0) > 0x7f))];
  for (const c of nonAscii) hits.push({ kind: 'non-ascii', match: `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}` });
  // Curly apostrophes are already a non-ASCII hit; fold them so the phrase list still matches.
  const t = text.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  for (const p of BANNED_PHRASES) {
    if (new RegExp(`(?<![a-z])${escape(p)}(?![a-z])`).test(t)) hits.push({ kind: 'phrase', match: p });
  }
  for (const w of BANNED_WORDS) {
    if (new RegExp(`(?<![a-z-])${escape(w)}(?:s|d|ed|ing)?(?![a-z-])`).test(t)) hits.push({ kind: 'word', match: w });
  }
  return hits;
}
