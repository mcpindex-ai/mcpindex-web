// Weekly publisher: on top of the analyst's commit, fix wording that depends on a moved fact, run
// the guards, and leave one local branch weekly/<date> for GB to push as one PR. Never pushes.
// Local model only (Ollama on 127.0.0.1); any transport failure writes "model unavailable" and
// stops, with no fallback. Rules: lib/workforce/publisher.ts.
//
//   npx tsx scripts/workforce/publisher.mts --worktree <dir on analyst/<date>> --state <dir>
//       --base-ref <ref the analyst branched from> [--date YYYY-MM-DD]
//       [--model-url http://127.0.0.1:11434/v1] [--model gpt-oss:120b]
//
// Exit 0: weekly/<date> created (with a wording commit when one was needed).
// Exit 1: a guard failed or the model's reply was refused. Worktree restored, no branch.
// Exit 3: model unavailable.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateFacts, type Fact } from '../../lib/facts';
import { DEFAULT_MODEL, DEFAULT_MODEL_URL, assertLocalOnly } from '../../lib/workforce/env';
import { buildExportMap, display, findParagraphs, type Paragraph, type SourceFile } from '../../lib/workforce/citations';
import { buildPrompt, candidates, parseReply, renderRewrite, validateRewrite, type FactChange } from '../../lib/workforce/publisher';
import { rule0Hits } from '../../lib/workforce/rule0';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing ${name}`);
}

const modelUrl = arg('--model-url', DEFAULT_MODEL_URL).replace(/\/$/, '');
const model = arg('--model', DEFAULT_MODEL);
try {
  assertLocalOnly(process.env, modelUrl);
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}

const worktree = path.resolve(arg('--worktree'));
const state = path.resolve(arg('--state'));
const baseRef = arg('--base-ref');
const date = arg('--date', new Date().toISOString().slice(0, 10));
const reportPath = path.join(state, 'publisher-report.md');
const report: string[] = [`Publisher run ${date} on ${baseRef}..HEAD, model ${model} at ${modelUrl}.`];

const git = (...a: string[]) => execFileSync('git', ['-C', worktree, ...a], { encoding: 'utf8' }).trim();

function finish(code: number, line?: string): never {
  if (line) report.push(line);
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(reportPath, report.join('\n') + '\n');
  console.log(report.join('\n'));
  process.exit(code);
}

function restore(): void {
  execFileSync('git', ['-C', worktree, 'checkout', '--', '.'], { stdio: 'ignore' });
}

// --- what moved -----------------------------------------------------------------------------
const before = validateFacts(JSON.parse(git('show', `${baseRef}:lib/facts.json`)));
const after = validateFacts(JSON.parse(fs.readFileSync(path.join(worktree, 'lib/facts.json'), 'utf8')));
const beforeById = new Map(before.map((f) => [f.id, f]));
const all = new Map<string, Fact>(after.map((f) => [f.id, f]));
const changes = new Map<string, FactChange>();
for (const f of after) {
  const b = beforeById.get(f.id);
  if (b && JSON.stringify(b.value) !== JSON.stringify(f.value)) changes.set(f.id, { before: b, after: f });
}
report.push(`${changes.size} fact(s) moved: ${[...changes.keys()].join(', ') || 'none'}.`);

// --- where they are cited -------------------------------------------------------------------
function walk(dir: string): string[] {
  return fs.readdirSync(path.join(worktree, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : walk(rel);
    return /\.(ts|tsx)$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [rel] : [];
  });
}
const read = (rel: string): SourceFile => ({ path: rel, src: fs.readFileSync(path.join(worktree, rel), 'utf8') });
const libs = walk('lib').map(read).filter((f) => /from '(?:\.\/|@\/lib\/)facts'/.test(f.src));
const exportMap = buildExportMap(libs, new Set(all.keys()));
const moved = new Set(changes.keys());

const edits: { file: string; para: Paragraph; text: string }[] = [];
if (moved.size) {
  const pages = [...walk('app'), ...walk('components')].map(read);
  for (const page of pages) {
    const cands = candidates(findParagraphs(page, exportMap), moved);
    if (!cands.length) continue;
    report.push('', `${page.path}: ${cands.length} paragraph(s) with moved facts and number-dependent wording (lines ${cands.map((c) => c.line).join(', ')}).`);
    const { system, user } = buildPrompt(page.path, cands, changes, all);
    let content: string;
    try {
      const res = await fetch(`${modelUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          stream: false,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(20 * 60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      content = j.choices?.[0]?.message?.content ?? '';
      if (!content.trim()) throw new Error('empty completion');
    } catch (e) {
      finish(3, `model unavailable: ${(e as Error).message}. Stopped; no fallback, no branch.`);
    }
    let reply;
    try {
      reply = parseReply(content, cands.length);
    } catch (e) {
      finish(1, `model reply refused: ${(e as Error).message}`);
    }
    if (reply.choice === null) {
      report.push('  model: no wording depends on the new values; unchanged.');
      continue;
    }
    const para = cands[reply.choice - 1];
    const errs = validateRewrite(para, reply.text);
    if (errs.length) finish(1, `  model rewrite of line ${para.line} refused:\n${errs.map((e) => `    - ${e}`).join('\n')}\n  text: ${reply.text}`);
    report.push(`  line ${para.line} before: ${display(para)}`, `  line ${para.line} after:  ${reply.text}`);
    edits.push({ file: page.path, para, text: reply.text });
  }

  // Strings in the citing lib modules that state a number in words ("one in seven") do not
  // render from the registry and do not move with it. Listed for a human, never edited.
  for (const lib of libs) {
    const ids = [...exportMap.entries()].filter(([k]) => lib.src.includes(`export const ${k.split('.')[0]}`)).flatMap(([, v]) => [...v.facts]);
    if (!ids.some((id) => moved.has(id))) continue;
    for (const m of lib.src.matchAll(/'([^'\n]*\b(?:one in \w+|half|a third|a quarter|a fifth|a tenth|most)\b[^'\n]*)'/gi)) {
      report.push(`check by hand: ${lib.path} carries the literal phrase '${m[1]}' beside a moved fact.`);
    }
  }
}

// --- apply, guard, branch -------------------------------------------------------------------
for (const e of edits) {
  const p = path.join(worktree, e.file);
  fs.writeFileSync(p, renderRewrite(fs.readFileSync(p, 'utf8'), e.para, e.text));
}

// Rule 0, mechanical, over every line the publisher added (the analyst touches only JSON).
const added = git('diff', '-U0', '--', 'app', 'components')
  .split('\n')
  .filter((l) => l.startsWith('+') && !l.startsWith('+++'));
const r0 = added.flatMap((l) => rule0Hits(l).map((h) => `${h.kind} ${h.match} in: ${l.slice(1, 120)}`));
if (r0.length) {
  restore();
  finish(1, `Rule 0 check FAILED on the publisher's diff; worktree restored, no branch.\n${r0.join('\n')}`);
}
report.push(`Rule 0 mechanical check: ok (${added.length} added line(s))`);

const guards: [string, string, string[]][] = [
  ['npm run check:facts', 'npm', ['run', '--silent', 'check:facts']],
  ['npx tsc --noEmit', 'npx', ['tsc', '--noEmit']],
];
for (const [label, cmd, args] of guards) {
  const r = spawnSync(cmd, args, { cwd: worktree, encoding: 'utf8', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-6).join('\n');
  if (r.status !== 0) {
    restore();
    finish(1, `${label} FAILED (exit ${r.status}); worktree restored, no branch.\n${tail}`);
  }
  report.push(`${label}: ok (${tail.split('\n').at(-1)})`);
}

git('switch', '-c', `weekly/${date}`);
if (edits.length) {
  git('add', ...new Set(edits.map((e) => e.file)));
  execFileSync('git', ['-C', worktree, 'commit', '-q', '-F', '-'], {
    input: `copy: wording follows facts re-measured ${date}\n\n${edits.map((e) => `${e.file}:${e.para.line}: ${e.text}`).join('\n')}\n`,
  });
}
finish(0, `weekly/${date} at ${git('rev-parse', '--short', 'HEAD')} (${edits.length} wording edit(s)). Ready for GB to push as one PR.`);
