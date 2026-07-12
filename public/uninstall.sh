#!/usr/bin/env sh
# mcpindex uninstaller (macOS / Linux) — the reverse of install.sh. Idempotent + safe.
#
# WHAT IT DOES (in order):
#   1. Stop + remove the resident auto-onboard WATCHER login item (launchd LaunchAgent on
#      macOS, systemd --user unit on Linux).
#   2. UN-WIRE every host config (reuses the audited `config_wire.unwire` → reconstructs each
#      of our marked entries IN PLACE from the per-entry marker we wrote at wire time; entries
#      with no marker are left untouched. No whole-file backup is involved post-FIX-H1).
#   3. Optionally remove the proxy tool (`--remove-tool` → `uv tool uninstall`). The package
#      is left installed by default (cheap, harmless) so a re-install is fast.
#
# Closed-vocabulary output. No secret is read or printed.
#
# Usage: sh uninstall.sh [--remove-tool] [--dry-run]
set -eu

PKG="mcpindex-gate"
REMOVE_TOOL=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --remove-tool) REMOVE_TOOL=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h) echo "mcpindex uninstall: [--remove-tool] [--dry-run]"; exit 0 ;;
    *) echo "mcpindex uninstall: unknown arg '$arg'" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "mcpindex: $*"; }

OS="$(uname -s 2>/dev/null || echo unknown)"
case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *) echo "mcpindex uninstall: unsupported OS '$OS'" >&2; exit 1 ;;
esac

LAUNCHD_LABEL="ai.mcpindex.watcher"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist"
SYSTEMD_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SYSTEMD_UNIT="$SYSTEMD_UNIT_DIR/mcpindex-watcher.service"

# --- step 1: remove the watcher login item -----------------------------------------------
remove_watcher_macos() {
  if [ "$DRY_RUN" = "1" ]; then say "[dry-run] would bootout + rm $LAUNCHD_PLIST"; return 0; fi
  launchctl bootout "gui/$(id -u)/$LAUNCHD_LABEL" 2>/dev/null || \
    launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
  rm -f "$LAUNCHD_PLIST"
  say "removed the watcher LaunchAgent ($LAUNCHD_LABEL)"
}

remove_watcher_linux() {
  if [ "$DRY_RUN" = "1" ]; then say "[dry-run] would disable + rm $SYSTEMD_UNIT"; return 0; fi
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user disable --now mcpindex-watcher.service 2>/dev/null || true
  fi
  rm -f "$SYSTEMD_UNIT"
  command -v systemctl >/dev/null 2>&1 && systemctl --user daemon-reload 2>/dev/null || true
  say "removed the watcher systemd --user unit (mcpindex-watcher.service)"
}

# --- step 2: un-wire all host configs -----------------------------------------------------
unwire_hosts() {
  if [ "$DRY_RUN" = "1" ]; then
    say "[dry-run] would un-wire every host config in place (per-entry, from the markers we wrote)"
    return 0
  fi
  uvx --from "$PKG" python - <<'PY'
import glob, os
from tooling.cse.config_scan import _default_config_paths
from tooling.cse.config_wire import unwire
configs = servers = skipped = 0
for path in _default_config_paths():
    targets = sorted(glob.glob(path)) if any(c in path for c in "*?[") else [path]
    for t in targets:
        if not os.path.isfile(t):
            continue
        res = unwire(t)
        if res.restored:
            configs += 1
            servers += res.n_unwired
        else:
            skipped += 1  # no mcpindex markers (or missing/malformed) — left untouched, safe
print(f"mcpindex: un-wired {servers} server(s) across {configs} config(s); "
      f"{skipped} config(s) had nothing to un-wire (left as-is).")
PY
}

# --- step 3: optionally remove the proxy tool ---------------------------------------------
remove_tool() {
  [ "$REMOVE_TOOL" = "1" ] || { say "left the proxy package installed (use --remove-tool to remove)"; return 0; }
  if [ "$DRY_RUN" = "1" ]; then say "[dry-run] would run: uv tool uninstall $PKG"; return 0; fi
  command -v uv >/dev/null 2>&1 && uv tool uninstall "$PKG" 2>/dev/null || true
  say "removed the proxy package ($PKG)"
}

# --- run ----------------------------------------------------------------------------------
if [ "$PLATFORM" = "macos" ]; then remove_watcher_macos; else remove_watcher_linux; fi
unwire_hosts
remove_tool
say "done. mcpindex is uninstalled; your host configs were un-wired in place."
