// Where does a fact land on a page? Pages rarely call the registry directly: lib/bindingGap.ts
// turns binding_gap.* into BINDING_GAP.boundPct, a page aliases that to FIG and renders
// {FIG.boundPct}. This module follows that chain statically (TypeScript AST, no imports run) and
// cuts each citing paragraph into text and opaque tokens, so the publisher can hand a model the
// words while code keeps every value.
import ts from 'typescript';

export interface SourceFile {
  readonly path: string;
  readonly src: string;
}

/**
 * Export path (BINDING_GAP.boundPct, REGISTRY_PANEL.cohorts.d30, D3_PROGRESS) -> the fact ids it
 * renders. `derived` marks a value computed from facts (a ratio, a bound, "15/150") rather than
 * one fact formatted, so the model is never told a computed figure is a registry value.
 */
export type ExportMap = Map<string, { readonly facts: Set<string>; readonly derived: boolean }>;

/** Arithmetic, a template or a method call (toFixed) means the value is computed, not formatted. */
function isDerived(n: ts.Node): boolean {
  let d = false;
  const visit = (x: ts.Node): void => {
    if (ts.isBinaryExpression(x) || ts.isTemplateExpression(x)) d = true;
    if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression)) d = true;
    ts.forEachChild(x, visit);
  };
  visit(n);
  return d;
}

function parse(file: SourceFile): ts.SourceFile {
  const kind = file.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file.path, file.src, ts.ScriptTarget.Latest, true, kind);
}

function unwrap(e: ts.Expression): ts.Expression {
  while (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
  return e;
}

/** `const bg = (k: string) => \`binding_gap.${k}\`` -> prefix "binding_gap.". */
function helperPrefix(init: ts.Expression): string | null {
  if (!ts.isArrowFunction(init) || init.parameters.length !== 1) return null;
  const param = init.parameters[0].name.getText();
  let prefix: string | null = null;
  const visit = (n: ts.Node): void => {
    if (
      ts.isTemplateExpression(n) &&
      n.templateSpans.length === 1 &&
      n.head.text.endsWith('.') &&
      n.templateSpans[0].literal.text === '' &&
      ts.isIdentifier(n.templateSpans[0].expression) &&
      n.templateSpans[0].expression.text === param
    ) {
      prefix = n.head.text;
    }
    ts.forEachChild(n, visit);
  };
  visit(init.body);
  return prefix;
}

/** Every registry-backed export across the given lib modules. */
export function buildExportMap(files: readonly SourceFile[], factIds: ReadonlySet<string>): ExportMap {
  const map: ExportMap = new Map();
  for (const file of files) {
    const sf = parse(file);
    const helpers = new Map<string, string>();
    const locals = new Map<string, ts.Expression>();
    const exported: ts.VariableDeclaration[] = [];
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      const isExport = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const p = helperPrefix(d.initializer);
        if (p) helpers.set(d.name.text, p);
        else locals.set(d.name.text, d.initializer);
        if (isExport) exported.push(d);
      }
    }
    const factsIn = (node: ts.Node, seen: Set<string>): Set<string> => {
      const out = new Set<string>();
      const visit = (n: ts.Node): void => {
        if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && factIds.has(n.text)) out.add(n.text);
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && helpers.has(n.expression.text)) {
          const a = n.arguments[0];
          if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) {
            const id = helpers.get(n.expression.text)! + a.text;
            if (factIds.has(id)) out.add(id);
          }
        }
        if (ts.isIdentifier(n) && locals.has(n.text) && !seen.has(n.text) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) {
          seen.add(n.text);
          factsIn(locals.get(n.text)!, seen).forEach((x) => out.add(x));
        }
        ts.forEachChild(n, visit);
      };
      visit(node);
      return out;
    };
    const addObject = (prefix: string, obj: ts.ObjectLiteralExpression, seen: Set<string>) => {
      for (const p of obj.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const key = `${prefix}.${p.name.getText(sf).replace(/['"]/g, '')}`;
        const v = unwrap(p.initializer);
        if (ts.isObjectLiteralExpression(v)) addObject(key, v, seen);
        else {
          const ids = factsIn(v, new Set(seen));
          if (ids.size) map.set(key, { facts: ids, derived: ids.size > 1 || isDerived(v) });
        }
      }
    };
    for (const d of exported) {
      const name = (d.name as ts.Identifier).text;
      const init = unwrap(d.initializer!);
      if (ts.isObjectLiteralExpression(init)) addObject(name, init, new Set([name]));
      else {
        const ids = factsIn(init, new Set([name]));
        if (ids.size) map.set(name, { facts: ids, derived: ids.size > 1 || isDerived(init) });
      }
    }
  }
  return map;
}

// --- paragraphs on pages -------------------------------------------------------------------------

export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'token'; readonly token: string; readonly source: string; readonly facts: readonly string[] };

export interface Paragraph {
  readonly file: string;
  readonly mode: 'jsx' | 'template';
  readonly line: number;
  /** Replaceable source range: element children (jsx) or one line of a template literal. */
  readonly start: number;
  readonly end: number;
  readonly segments: readonly Segment[];
}

const PARA_TAGS = new Set(['p', 'li', 'dd', 'dt', 'td', 'th', 'figcaption', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Local aliases: `import { X as Y }` and `const Y = X` (at any depth). Y -> X. */
function aliases(sf: ts.SourceFile): Map<string, string> {
  const m = new Map<string, string>();
  const visit = (n: ts.Node): void => {
    if (ts.isImportSpecifier(n) && n.propertyName) m.set(n.name.text, n.propertyName.getText(sf));
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isIdentifier(unwrap(n.initializer))) {
      m.set(n.name.text, (unwrap(n.initializer) as ts.Identifier).text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return m;
}

function dotted(e: ts.Expression): string[] | null {
  if (ts.isIdentifier(e)) return [e.text];
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name)) {
    const base = dotted(e.expression);
    return base ? [...base, e.name.text] : null;
  }
  return null;
}

/** Fact ids an expression renders, through aliases and the export map. */
function exprFacts(e: ts.Node, al: Map<string, string>, map: ExportMap): Set<string> {
  return exprCitation(e, al, map).facts;
}

function exprCitation(e: ts.Node, al: Map<string, string>, map: ExportMap): { facts: Set<string>; derived: boolean } {
  const out = new Set<string>();
  let derived = false;
  let hits = 0;
  const visit = (n: ts.Node): void => {
    if ((ts.isPropertyAccessExpression(n) || ts.isIdentifier(n)) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n)) {
      const parts = dotted(n as ts.Expression);
      if (parts) {
        let root = parts[0];
        for (let i = 0; i < 5 && al.has(root); i++) root = al.get(root)!;
        const full = [root, ...parts.slice(1)];
        for (let k = full.length; k >= 1; k--) {
          const hit = map.get(full.slice(0, k).join('.'));
          if (hit) {
            hit.facts.forEach((x) => out.add(x));
            derived ||= hit.derived;
            hits++;
            break;
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(e);
  return { facts: out, derived: derived || hits > 1 };
}

/** JSX whitespace rule: lines trimmed, blank lines dropped, joined with one space. */
export function jsxText(raw: string): string {
  const lines = raw.split(/\r?\n/);
  if (lines.length === 1) return raw;
  return lines
    .map((l, i) => {
      let t = l.replace(/\t/g, ' ');
      if (i > 0) t = t.replace(/^\s+/, '');
      if (i < lines.length - 1) t = t.replace(/\s+$/, '');
      return t;
    })
    .filter((l) => l.length > 0)
    .join(' ');
}

function decodeEntities(s: string): string {
  return s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&rsquo;/g, "'").replace(/&amp;/g, '&');
}

/** Names tokens: fact:<id> for a single-fact value, derived:<n> for a computed one, keep:<n> otherwise. */
function namer() {
  const used = new Map<string, number>();
  let derived = 0;
  let keep = 0;
  return (facts: readonly string[], isDerived: boolean): string => {
    const base = facts.length === 0 ? `keep:${++keep}` : isDerived ? `derived:${++derived}` : `fact:${facts[0]}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
}

/** Every paragraph in a page that renders at least one registry-backed value. */
export function findParagraphs(file: SourceFile, map: ExportMap): Paragraph[] {
  const sf = parse(file);
  const al = aliases(sf);
  const seen = new Map<number, Paragraph>();
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const jsxParagraph = (el: ts.JsxElement): Paragraph => {
    const name = namer();
    const segs: Segment[] = [];
    for (const c of el.children) {
      if (ts.isJsxText(c)) {
        const t = decodeEntities(jsxText(c.getFullText(sf)));
        if (t) segs.push({ kind: 'text', text: t });
      } else if (ts.isJsxExpression(c) && c.expression && ts.isStringLiteral(c.expression) && /^\s*$/.test(c.expression.text)) {
        segs.push({ kind: 'text', text: c.expression.text });
      } else {
        const cit = exprCitation(c, al, map);
        const facts = [...cit.facts].sort();
        // A child element holding a value is opaque markup; only a bare expression is a fact token.
        const derivedOrMarkup = cit.derived || !ts.isJsxExpression(c);
        segs.push({ kind: 'token', token: name(facts, derivedOrMarkup && facts.length > 0), source: c.getText(sf), facts });
      }
    }
    const start = el.openingElement.end;
    return { file: file.path, mode: 'jsx', line: lineOf(el.getStart(sf)), start, end: el.closingElement.getStart(sf), segments: segs };
  };

  const templateParagraph = (tpl: ts.TemplateExpression, at: number): Paragraph | null => {
    const lo = tpl.getStart(sf) + 1;
    const hi = tpl.end - 1;
    const text = file.src;
    const start = Math.max(lo, text.lastIndexOf('\n', at) + 1);
    const nl = text.indexOf('\n', at);
    const end = nl < 0 || nl > hi ? hi : nl;
    const name = namer();
    const segs: Segment[] = [];
    let cursor = start;
    // A span that straddles the line boundary cannot be cut into words and tokens; skip the line.
    const straddles = (a: number, b: number) => (a < start && b > start) || (a < end && b > end);
    if (tpl.templateSpans.some((s) => straddles(s.expression.getStart(sf) - 2, s.literal.getStart(sf) + 1))) return null;
    const spans = tpl.templateSpans.filter((s) => s.expression.getStart(sf) - 2 >= start && s.literal.getStart(sf) < end);
    for (const s of spans) {
      const a = s.expression.getStart(sf) - 2;
      const b = s.literal.getStart(sf) + 1;
      if (a > cursor) segs.push({ kind: 'text', text: text.slice(cursor, a) });
      const cit = exprCitation(s.expression, al, map);
      const facts = [...cit.facts].sort();
      segs.push({ kind: 'token', token: name(facts, cit.derived), source: text.slice(a, b), facts });
      cursor = b;
    }
    if (end > cursor) segs.push({ kind: 'text', text: text.slice(cursor, end) });
    return { file: file.path, mode: 'template', line: lineOf(start), start, end, segments: segs };
  };

  const visit = (n: ts.Node): void => {
    if (ts.isJsxExpression(n) && n.expression && exprFacts(n.expression, al, map).size) {
      let p: ts.Node | undefined = n.parent;
      while (p && !(ts.isJsxElement(p) && PARA_TAGS.has(p.openingElement.tagName.getText(sf)))) p = p.parent;
      if (p && !seen.has(p.getStart(sf))) seen.set(p.getStart(sf), jsxParagraph(p as ts.JsxElement));
    }
    if (ts.isTemplateSpan(n) && exprFacts(n.expression, al, map).size && ts.isTemplateExpression(n.parent)) {
      const at = n.expression.getStart(sf);
      const para = templateParagraph(n.parent, at);
      if (para && !seen.has(para.start)) seen.set(para.start, para);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...seen.values()].sort((a, b) => a.start - b.start);
}

/** The paragraph as the model sees it: words, with each token as {{name}}. */
export function display(p: Paragraph): string {
  return p.segments.map((s) => (s.kind === 'text' ? s.text : `{{${s.token}}}`)).join('');
}

export function paragraphFacts(p: Paragraph): Set<string> {
  return new Set(p.segments.flatMap((s) => (s.kind === 'token' ? [...s.facts] : [])));
}
