#!/bin/zsh
# Weekly facts job: analyst (re-measure lib/facts.json against mcpindex-trust main), then
# publisher (wording that depends on a moved fact, via the LOCAL model only). Leaves local
# branches analyst/<date> and weekly/<date>; never pushes, never opens a PR, never deploys.
#
#   scripts/workforce/weekly.sh [--base origin/main] [--date YYYY-MM-DD] [--check-env]
#
# Env (all optional): MCPINDEX_WEB_REPO (any checkout of mcpindex-web; default: this one),
# WORKFORCE_STATE_DIR (default ~/.mcpindex-workforce), WORKFORCE_NODE_MODULES (default: the
# main checkout's node_modules), WORKFORCE_TRUST_REMOTE (default the GitHub ssh remote).
# Launchd template: scripts/workforce/ai.mcpindex.workforce-weekly.plist.template.
set -euo pipefail

# --- refuse anything that could reach a paid API. Names only; values are never read. ---------
refused=()
for v in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL GROQ_API_KEY OPENAI_API_KEY; do
  if (( ${+parameters[$v]} )); then refused+=("$v"); fi
done
if (( ${#refused} )); then
  print -u2 "refusing to run: ${(j:, :)refused} set in the environment. This job is local-only; unset it."
  exit 2
fi

base=origin/main
date=$(date -u +%F)
while (( $# )); do
  case $1 in
    --check-env) print "env ok"; exit 0 ;;
    --base) base=$2; shift 2 ;;
    --date) date=$2; shift 2 ;;
    *) print -u2 "unknown argument $1"; exit 64 ;;
  esac
done
[[ $date == <->-<->-<-> ]] || { print -u2 "--date must be YYYY-MM-DD"; exit 64; }

here=${0:A:h}
repo=${MCPINDEX_WEB_REPO:-$(git -C "$here" rev-parse --show-toplevel)}
main_checkout=$(dirname "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)")
state=${WORKFORCE_STATE_DIR:-$HOME/.mcpindex-workforce}/$date
wt=$state/wt
export GIT_SSH_COMMAND="ssh -o BatchMode=yes" GIT_TERMINAL_PROMPT=0

# One run at a time: the model takes one request at a time and the branches are per date.
mkdir -p "${state:h}"
if ! mkdir "$state" 2>/dev/null; then
  print -u2 "state dir $state exists: a run for $date already happened or is running. Remove it to rerun."
  exit 1
fi
for b in analyst/$date weekly/$date; do
  if git -C "$repo" show-ref --quiet --verify "refs/heads/$b"; then
    print -u2 "branch $b already exists; refusing to overwrite it."
    exit 1
  fi
done

if [[ $base == origin/* ]]; then
  git -C "$repo" fetch -q origin "${base#origin/}"
fi
base_sha=$(git -C "$repo" rev-parse --verify "$base^{commit}")
git -C "$repo" worktree add -q --detach "$wt" "$base_sha"
ln -s "${WORKFORCE_NODE_MODULES:-$main_checkout/node_modules}" "$wt/node_modules"
print "weekly $date: base $base ($base_sha), worktree $wt, state $state"

cd "$wt"
trust_args=()
[[ -n ${WORKFORCE_TRUST_REMOTE:-} ]] && trust_args=(--trust-remote "$WORKFORCE_TRUST_REMOTE")
set +e
npx --no-install tsx scripts/workforce/analyst.mts --worktree "$wt" --state "$state" --date "$date" "${trust_args[@]}"
rc=$?
set -e
result=$(cat "$state/analyst-result" 2>/dev/null || print missing)
if (( rc != 0 )) || [[ $result == failed || $result == missing ]]; then
  print -u2 "analyst failed (exit $rc, result $result). Report: $state/analyst-report.md. Worktree kept: $wt"
  exit 1
fi
if [[ $result == unchanged ]]; then
  cd /
  git -C "$repo" worktree remove --force "$wt"
  print "no fact moved and no live fact to re-date; no branch created. Report: $state/analyst-report.md"
  exit 0
fi

set +e
npx --no-install tsx scripts/workforce/publisher.mts --worktree "$wt" --state "$state" --base-ref "$base_sha" --date "$date"
rc=$?
set -e
if (( rc != 0 )); then
  print -u2 "publisher failed (exit $rc). Report: $state/publisher-report.md. analyst/$date kept; worktree kept: $wt"
  exit $rc
fi
cd /
git -C "$repo" worktree remove --force "$wt"
print "done: push weekly/$date as one PR when ready (git -C $repo push origin weekly/$date)."
