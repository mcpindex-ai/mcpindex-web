// Weekly analyst: re-run every lib/facts.json query against a fresh clone of mcpindex-trust main,
// write moved live facts back, and commit to a local branch analyst/<date>. Never pushes.
// Policy and report format: lib/workforce/analyst.ts.
//
//   npx tsx scripts/workforce/analyst.mts --worktree <mcpindex-web checkout> --state <dir>
//       [--date YYYY-MM-DD] [--trust-remote <url or path>] [--no-commit]
//
// Exit 0: report written; result in <state>/analyst-result (moved | remeasured | unchanged).
// Exit 1: a query failed, changed shape, or a frozen fact moved. Nothing written or committed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateFacts, type Fact } from '../../lib/facts';
import { refusedEnv } from '../../lib/workforce/env';
import { applyWrites, judge, renderReport, repinQuery, writable, writes, type Outcome, type QueryRun } from '../../lib/workforce/analyst';

const TRUST_REMOTE = 'git@github.com:mcpindex-ai/mcpindex-trust.git';
const QUERY_TIMEOUT_MS = 120_000;

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing ${name}`);
}

const bad = refusedEnv(process.env);
if (bad.length) {
  console.error(`refusing to run: ${bad.join(', ')} set in the environment. This job is local-only.`);
  process.exit(2);
}

const worktree = path.resolve(arg('--worktree'));
const state = path.resolve(arg('--state'));
const date = arg('--date', new Date().toISOString().slice(0, 10));
const trustRemote = arg('--trust-remote', TRUST_REMOTE);
const commit = !process.argv.includes('--no-commit');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date must be YYYY-MM-DD, got ${date}`);

const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim();

if (commit && git(worktree, 'status', '--porcelain')) {
  console.error(`worktree ${worktree} has uncommitted changes; the analyst commits only its own write.`);
  process.exit(1);
}

// Fresh, shallow clone of main in a directory nobody else uses. Queries run from `root`, which
// holds mcpindex-trust (the clone) and mcpindex-web (a link to the worktree) side by side.
fs.mkdirSync(state, { recursive: true });
const root = fs.mkdtempSync(path.join(state, 'query-root-'));
let code = 0;
try {
  execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', 'main', '--single-branch', trustRemote, path.join(root, 'mcpindex-trust')], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, GIT_SSH_COMMAND: 'ssh -o BatchMode=yes', GIT_TERMINAL_PROMPT: '0' },
  });
  fs.symlinkSync(worktree, path.join(root, 'mcpindex-web'));
  const sha = git(path.join(root, 'mcpindex-trust'), 'rev-parse', '--short=7', 'HEAD');

  const factsPath = path.join(worktree, 'lib/facts.json');
  const text = fs.readFileSync(factsPath, 'utf8');
  const facts: Fact[] = validateFacts(JSON.parse(text));

  const outcomes: Outcome[] = facts.map((f) => {
    const q = repinQuery(f.query, sha);
    const r = spawnSync('/bin/zsh', ['-c', q], { cwd: root, encoding: 'utf8', timeout: QUERY_TIMEOUT_MS });
    let run: QueryRun;
    if (r.error) run = { ok: false, error: r.error.message };
    else if (r.status !== 0) run = { ok: false, error: `exit ${r.status}${r.stderr.trim() ? `: ${r.stderr.trim().split('\n')[0]}` : ''}` };
    else run = { ok: true, stdout: r.stdout };
    return judge(f, run, q, date);
  });

  const report = renderReport({ date, trustSha: sha, trustRemote }, outcomes);
  fs.writeFileSync(path.join(state, 'analyst-report.md'), report + '\n');
  fs.writeFileSync(path.join(state, 'analyst-report.json'), JSON.stringify({ date, trustSha: sha, outcomes }, null, 2) + '\n');
  console.log(report);

  if (!writable(outcomes)) {
    fs.writeFileSync(path.join(state, 'analyst-result'), 'failed\n');
    code = 1;
  } else {
    const w = writes(outcomes);
    const result = outcomes.some((o) => o.kind === 'moved') ? 'moved' : w.length ? 'remeasured' : 'unchanged';
    if (w.length) {
      const next = applyWrites(text, w);
      validateFacts(JSON.parse(next)); // the write must still be a valid registry
      fs.writeFileSync(factsPath, next);
      if (commit) {
        git(worktree, 'switch', '-c', `analyst/${date}`);
        git(worktree, 'add', 'lib/facts.json');
        execFileSync('git', ['-C', worktree, 'commit', '-q', '-F', '-'], {
          input: `facts: re-measure against mcpindex-trust ${sha} (${date})\n\n${report}\n`,
        });
        console.log(`\ncommitted ${git(worktree, 'rev-parse', '--short', 'HEAD')} on analyst/${date}`);
      }
    }
    fs.writeFileSync(path.join(state, 'analyst-result'), `${result}\n`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
process.exit(code);
