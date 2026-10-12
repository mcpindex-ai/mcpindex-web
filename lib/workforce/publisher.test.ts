import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FACTS, type Fact } from '../facts';
import { buildExportMap, display, findParagraphs, type SourceFile } from './citations';
import { buildPrompt, candidates, parseReply, renderRewrite, validateRewrite } from './publisher';

const ids = new Set(['x.servers', 'x.pct', 'x.total']);
const LIB: SourceFile = {
  path: 'lib/x.ts',
  src: [
    "import { fmtFact, pctFact } from './facts';",
    'const k = (s: string) => `x.${s}`;',
    'export const X = {',
    "  servers: fmtFact(k('servers')),",
    "  pct: pctFact(k('pct')),",
    "  ratio: `${(1 / 2).toFixed(1)}`,",
    "  share: `${((Number(fmtFact(k('servers'))) / Number(fmtFact(k('total')))) * 100).toFixed(1)}%`,",
    "  nested: { total: fmtFact('x.total') },",
    '} as const;',
  ].join('\n'),
};
const PAGE: SourceFile = {
  path: 'app/x/page.tsx',
  src: [
    "import { X as Y } from '@/lib/x';",
    'const FIG = Y;',
    'export default function P() {',
    '  return (',
    '    <main>',
    '      <p className="mt-4">',
    "        The count rose to {FIG.servers} servers, about{' '}",
    '        {FIG.pct} of the <a href="/r">registry</a> ({FIG.share}).',
    '      </p>',
    '      <p>Unrelated text with no figure.</p>',
    '      <td>{FIG.nested.total}</td>',
    '    </main>',
    '  );',
    '}',
  ].join('\n'),
};
const ROUTE: SourceFile = {
  path: 'app/x.txt/route.ts',
  src: ["import { X } from '@/lib/x';", 'const body = `# X', '- Finding: ${X.servers} servers, more than ${X.pct} of them.', '- Other line.`;'].join('\n'),
};

const map = buildExportMap([LIB], ids);

test('citations: export paths resolve through helpers, nesting, and computed values', () => {
  assert.deepEqual([...map.get('X.servers')!.facts], ['x.servers']);
  assert.equal(map.get('X.servers')!.derived, false);
  assert.equal(map.get('X.nested.total')!.derived, false);
  assert.equal(map.get('X.share')!.derived, true);
  assert.equal(map.has('X.ratio'), false, 'a value with no fact in it is not a citation');
});

test('placeholders: a JSX paragraph becomes words and named tokens, through import and const aliases', () => {
  const paras = findParagraphs(PAGE, map);
  assert.equal(paras.length, 2);
  assert.equal(display(paras[0]), 'The count rose to {{fact:x.servers}} servers, about {{fact:x.pct}} of the {{keep:1}} ({{derived:1}}).');
  assert.equal(display(paras[1]), '{{fact:x.total}}');
});

test('placeholders: a template-literal route is cut one line at a time', () => {
  const [p] = findParagraphs(ROUTE, map);
  assert.equal(display(p), '- Finding: {{fact:x.servers}} servers, more than {{fact:x.pct}} of them.');
});

test('candidates: only paragraphs with a moved fact and number-dependent wording are sent', () => {
  const paras = findParagraphs(PAGE, map);
  assert.equal(candidates(paras, new Set(['x.pct'])).length, 1);
  // x.total reaches the first paragraph through the computed share; the bare table cell holding
  // it directly has no wording to fix, so it is not sent.
  assert.deepEqual(candidates(paras, new Set(['x.total'])).map((p) => p.line), [paras[0].line]);
  assert.equal(candidates(paras, new Set(['y.other'])).length, 0);
});

test('placeholder rendering: values come back as the original code, prose is escaped for JSX', () => {
  const [p] = findParagraphs(PAGE, map);
  const text = "The count fell to {{fact:x.servers}} servers, about {{fact:x.pct}} of the {{keep:1}} ({{derived:1}}) and it's lower.";
  assert.deepEqual(validateRewrite(p, text), []);
  const out = renderRewrite(PAGE.src, p, text);
  assert.ok(out.includes("The count fell to {FIG.servers} servers, about {FIG.pct} of the <a href=\"/r\">registry</a> ({FIG.share}) and it&apos;s lower."));
  assert.ok(out.includes('<p>Unrelated text with no figure.</p>'));
  const again = findParagraphs({ path: PAGE.path, src: out }, map)[0];
  assert.equal(display(again), text, 'the rendered page parses back to the same words and tokens');
});

test('placeholder rendering: a template line is replaced in place', () => {
  const [p] = findParagraphs(ROUTE, map);
  const text = '- Finding: {{fact:x.servers}} servers, under {{fact:x.pct}} of them.';
  assert.deepEqual(validateRewrite(p, text), []);
  assert.equal(
    renderRewrite(ROUTE.src, p, text),
    ROUTE.src.replace('more than ${X.pct}', 'under ${X.pct}'),
  );
});

test('refusals: a number, a dropped or invented token, markup, a widened claim, or Rule 0 fails', () => {
  const [p] = findParagraphs(PAGE, map);
  const keep = ' of the {{keep:1}} ({{derived:1}}).';
  const bad = (t: string) => validateRewrite(p, t).join(' | ');
  assert.match(bad(`The count fell to {{fact:x.servers}} servers, about 12% ${keep}`), /tokens changed|number/);
  assert.match(bad(`The count fell to {{fact:x.servers}} servers, about {{fact:x.pct}} or 12${keep}`), /number\(s\) written by the model, not rendered from the registry: 12/);
  assert.match(bad(`The count fell to {{fact:x.servers}} servers, about {{fact:x.pct}} or one third${keep}`), /number word/);
  assert.match(bad(`The count fell to {{fact:x.servers}} servers, about {{fact:x.pct}} {{fact:x.total}}${keep}`), /tokens changed/);
  assert.match(bad(`The count fell to {{fact:x.servers}} servers, about {{fact:x.pct}} <b>x</b>${keep}`), /JSX-significant/);
  assert.match(bad(`Across the registry the count fell to {{fact:x.servers}}, about {{fact:x.pct}}${keep}`), /widened claim/);
  assert.match(bad(`The count \u2014 fell to {{fact:x.servers}}, a pivotal {{fact:x.pct}}${keep}`), /non-ascii[\s\S]*pivotal/);
});

test('refusals: citing traps from the drift panel', () => {
  const lib: SourceFile = { path: 'lib/d.ts', src: "import { factNumber } from './facts';\nexport const D = { any: factNumber('drift_panel.descriptor_pct_89d') };" };
  const m = buildExportMap([lib], new Set(FACTS.map((f) => f.id)));
  const page: SourceFile = { path: 'app/d/page.tsx', src: "import { D } from '@/lib/d';\nconst a = <p>An upper bound of {D.any}% changed, version bumps included.</p>;" };
  const [p] = findParagraphs(page, m);
  assert.match(validateRewrite(p, 'The drift rate rose to {{fact:drift_panel.descriptor_pct_89d}}%, version bumps included.').join(' '), /qualifier\(s\) dropped: upper bound[\s\S]*drift rate/);
});

test('prompt and reply: moved facts show old and new values; replies are strict JSON', () => {
  const [p] = findParagraphs(PAGE, map);
  const before: Fact = { id: 'x.pct', value: 12.5, unit: 'percent', query: 'jq .a f.json', observed_at: '2026-01-01' };
  const after: Fact = { ...before, value: 9.5 };
  const { user } = buildPrompt(PAGE.path, [p], new Map([['x.pct', { before, after }]]), new Map([['x.pct', after]]));
  assert.match(user, /\{\{fact:x\.pct\}\}: x\.pct \(percent\) MOVED from 12\.5 to 9\.5/);
  assert.deepEqual(parseReply('{"choice": null}', 1), { choice: null });
  assert.deepEqual(parseReply('```json\n{"choice": 1, "text": "a"}\n```', 1), { choice: 1, text: 'a' });
  assert.throws(() => parseReply('{"choice": 2, "text": "a"}', 1), /expected 1\.\.1/);
  assert.throws(() => parseReply('sure, here it is', 1), /not JSON/);
});

test('real pages: every guarded page parses and no paragraph token is unnamed', () => {
  const libs = fs
    .readdirSync('lib')
    .filter((f) => /\.ts$/.test(f) && !f.includes('.test.'))
    .map((f) => ({ path: `lib/${f}`, src: fs.readFileSync(`lib/${f}`, 'utf8') }))
    .filter((f) => /from '(?:\.\/|@\/lib\/)facts'/.test(f.src));
  const real = buildExportMap(libs, new Set(FACTS.map((f) => f.id)));
  assert.ok(real.has('BINDING_GAP.boundPct') && real.has('REGISTRY_PANEL.descriptorPct.d89'));
  const p = findParagraphs({ path: 'app/research/binding-gap/page.tsx', src: fs.readFileSync('app/research/binding-gap/page.tsx', 'utf8') }, real);
  assert.ok(p.some((x) => display(x).includes('the gap stays between {{fact:binding_gap.gap_low}} and {{fact:binding_gap.gap_high}} points')));
});
