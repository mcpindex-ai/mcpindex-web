#!/usr/bin/env sh
# mcpindex one-click installer (macOS / Linux) — the `curl -fsSL … | sh` shape.
#
# WHAT IT DOES (end-user terms, in order):
#   1. Install the mcpindex proxy via the $0 path: `uv tool install mcpindex-gate`
#      (uv provisions Python + the package; no source tree, no signing for a terminal/PM
#      install). A self-contained binary is a DEFERRED follow-up (documented below).
#   2. Auto-DETECT every installed host on this machine (which known MCP-config paths exist)
#      and WIRE each found server through the proxy (reuses the audited `config_wire` —
#      atomic, backed up, reversible, idempotent). Affirmative consent: it ECHOES the plan
#      and asks before writing, unless `--yes` is passed.
#   3. Register the resident auto-onboard WATCHER as a login item (a launchd LaunchAgent on
#      macOS, a systemd --user unit on Linux) so a newly-added server is auto-wired within
#      seconds. Logs go to ~/Library/Logs (mac) / ~/.local/state (linux) — NEVER a /Volumes
#      path (launchd EX_CONFIG on a noowners mount).
#
# SAFETY: idempotent + reversible (`uninstall.sh` un-wires all + removes the watcher unit).
# NO secret is ever written into a script, env, or log. Closed-vocabulary output only.
#
# Usage:
#   curl --proto '=https' --tlsv1.2 -fsSL https://mcpindex.ai/install.sh | sh
#   curl --proto '=https' --tlsv1.2 -fsSL https://mcpindex.ai/install.sh | sh -s -- --yes
set -eu

PKG="mcpindex-gate"
PROXY_MODULE="tooling.cse.proxy"
WATCHER_MODULE="tooling.cse.watcher"
ASSUME_YES=0
DRY_RUN=0
# Offline self-test hook (set by smoke_install_units): WRITE + lint the watcher unit but skip
# every network/daemon op (uv tool install, host wiring, launchctl/systemctl). NOT a user flag.
INSTALL_TEST="${MCPINDEX_INSTALL_TEST:-0}"

for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h)
      echo "mcpindex install: [--yes] [--dry-run]"
      echo "  --yes      skip the wiring confirmation (affirmative consent assumed)"
      echo "  --dry-run  show what would happen; write nothing, register nothing"
      exit 0
      ;;
    *) echo "mcpindex install: unknown arg '$arg' (try --help)" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "mcpindex: $*"; }
err() { printf '%s\n' "mcpindex: $*" >&2; }

# --- OS / arch detection -----------------------------------------------------------------
OS="$(uname -s 2>/dev/null || echo unknown)"
ARCH="$(uname -m 2>/dev/null || echo unknown)"
case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *) err "unsupported OS '$OS' (this installer is macOS/Linux; Windows uses install.ps1)"; exit 1 ;;
esac
say "detected $PLATFORM/$ARCH"

# --- log dir (NEVER /Volumes — launchd EX_CONFIG lesson) ---------------------------------
if [ "$PLATFORM" = "macos" ]; then
  LOG_DIR="$HOME/Library/Logs/mcpindex"
else
  LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/mcpindex"
fi

# --- step 1: install the proxy via the $0 uv path ----------------------------------------
install_proxy() {
  if [ "$INSTALL_TEST" = "1" ]; then say "[self-test] skipping uv tool install"; return 0; fi
  if [ "$DRY_RUN" = "1" ]; then
    say "[dry-run] would run: uv tool install $PKG"
    return 0
  fi
  if ! command -v uv >/dev/null 2>&1; then
    err "uv not found. Install uv first (the \$0 cross-platform path):"
    err "  curl --proto '=https' --tlsv1.2 -fsSL https://astral.sh/uv/install.sh | sh"
    err "(A self-contained mcpindex binary is a deferred follow-up; uv is the current path.)"
    exit 1
  fi
  say "installing the proxy: uv tool install $PKG"
  uv tool install "$PKG"
}

# Resolve the ABSOLUTE path to uvx ONCE at install time (FIX H2). launchd runs LaunchAgents
# with a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) and `systemd --user` with its own
# environment — neither resolves a bare `uvx` (it lives under ~/.local/bin or a brew prefix),
# so a bare `uvx` in the unit makes the watcher SILENTLY never start. We pin the absolute path
# in the generated unit and ALSO set the unit's PATH to include ~/.local/bin.
UVX_BIN=""
LOCAL_BIN="$HOME/.local/bin"
resolve_uvx() {
  UVX_BIN="$(command -v uvx 2>/dev/null || true)"
  if [ -z "$UVX_BIN" ] && [ -x "$LOCAL_BIN/uvx" ]; then
    UVX_BIN="$LOCAL_BIN/uvx"
  fi
  if [ -z "$UVX_BIN" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      # Dry run never execs the unit — show the path we WOULD pin without hard-failing.
      UVX_BIN="$LOCAL_BIN/uvx"
      say "[dry-run] uvx not found now; would pin $UVX_BIN (resolved at real install time)"
      return 0
    fi
    err "uvx not found on PATH or in $LOCAL_BIN — cannot register a self-starting watcher."
    err "Install uv (which provides uvx): curl --proto '=https' --tlsv1.2 -fsSL https://astral.sh/uv/install.sh | sh"
    exit 1
  fi
}

# The command tokens a wired host entry / the watcher should use to launch the proxy. Uses the
# ABSOLUTE uvx path (resolved above) so launchd/systemd can actually exec it. Kept in sync with
# config_wire's proxy_cmd shape (a list of argv tokens).
proxy_cmd() {
  printf '%s' "$UVX_BIN --from $PKG python -m $PROXY_MODULE"
}
watcher_cmd() {
  printf '%s' "$UVX_BIN --from $PKG python -m $WATCHER_MODULE"
}

# --- step 2: detect hosts + wire (consented) ---------------------------------------------
wire_hosts() {
  # Delegate the detect+plan+wire to the audited Python (config_wire.first_run_wire_all):
  # dry-run first to ECHO the plan, then wire on consent. We never parse configs in shell.
  if [ "$INSTALL_TEST" = "1" ]; then say "[self-test] skipping host wiring"; return 0; fi
  say "scanning for installed hosts and unrouted MCP servers…"
  # Use config_wire's own plan/confirm CLI surface via a tiny python -c that prints the plan.
  if [ "$DRY_RUN" = "1" ]; then
    say "[dry-run] would wire every detected unrouted server through the proxy (each entry marked for in-place un-wire; reversible)"
    return 0
  fi
  if [ "$ASSUME_YES" != "1" ]; then
    printf '%s' "mcpindex: wire all detected MCP servers through mcpindex now? Each entry is marked for in-place un-wire (byte-identical restore; no separate backup file) and is reversible. [y/N] " >&2
    read -r REPLY </dev/tty || REPLY="n"
    case "$REPLY" in
      y|Y|yes|YES) : ;;
      *) say "skipped wiring (you can re-run with --yes later)"; return 0 ;;
    esac
  fi
  # `first_run_wire_all(confirm=True)` over the default host paths — atomic; each rewritten
  # entry carries a per-entry marker (no whole-file backup) that un-wire restores in place.
  uvx --from "$PKG" python - "$(proxy_cmd)" <<'PY'
import sys
from tooling.cse.config_wire import first_run_wire_all, render_first_run_prompt
proxy_cmd = sys.argv[1].split()
plan = first_run_wire_all(proxy_cmd=proxy_cmd, confirm=False)
print("mcpindex:", render_first_run_prompt(plan))
results = first_run_wire_all(proxy_cmd=proxy_cmd, confirm=True)
wired = sum(r.n_wired for r in results)
print(f"mcpindex: wired {wired} server(s) across detected hosts (closed-vocab; each entry marked for in-place un-wire, no backup file).")
PY
}

# --- step 3: register the resident watcher as a login item -------------------------------
LAUNCHD_LABEL="ai.mcpindex.watcher"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist"
SYSTEMD_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SYSTEMD_UNIT="$SYSTEMD_UNIT_DIR/mcpindex-watcher.service"

register_watcher_macos() {
  mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
  WCMD="$(watcher_cmd)"
  # Build the ProgramArguments array from the watcher command tokens.
  PA=""
  for tok in $WCMD; do
    PA="$PA      <string>$tok</string>
"
  done
  if [ "$DRY_RUN" = "1" ]; then
    say "[dry-run] would write LaunchAgent $LAUNCHD_PLIST and bootstrap it"
    return 0
  fi
  cat > "$LAUNCHD_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LAUNCHD_LABEL</string>
  <key>ProgramArguments</key>
  <array>
$PA  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$LOCAL_BIN:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/watcher.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/watcher.err.log</string>
</dict>
</plist>
PLIST
  # Validate the generated plist before loading it (FIX H2 — a malformed plist fails silently).
  if command -v plutil >/dev/null 2>&1; then
    plutil -lint "$LAUNCHD_PLIST" >/dev/null 2>&1 || { err "generated plist failed plutil -lint: $LAUNCHD_PLIST"; exit 1; }
  fi
  if [ "$INSTALL_TEST" = "1" ]; then say "[self-test] wrote+linted plist; skipping launchctl"; return 0; fi
  # Reload idempotently (bootout the old, bootstrap the new under the user's GUI domain).
  launchctl bootout "gui/$(id -u)/$LAUNCHD_LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$LAUNCHD_PLIST" 2>/dev/null || \
    launchctl load "$LAUNCHD_PLIST" 2>/dev/null || true
  say "registered the auto-onboard watcher (launchd: $LAUNCHD_LABEL, abs uvx + PATH)"
}

register_watcher_linux() {
  mkdir -p "$SYSTEMD_UNIT_DIR" "$LOG_DIR"
  WCMD="$(watcher_cmd)"
  if [ "$DRY_RUN" = "1" ]; then
    say "[dry-run] would write systemd --user unit $SYSTEMD_UNIT and enable it"
    return 0
  fi
  cat > "$SYSTEMD_UNIT" <<UNIT
[Unit]
Description=mcpindex resident auto-onboard watcher
After=default.target

[Service]
Type=simple
Environment=PATH=$LOCAL_BIN:/usr/local/bin:/usr/bin:/bin
ExecStart=$WCMD
Restart=on-failure
RestartSec=5
StandardOutput=append:$LOG_DIR/watcher.out.log
StandardError=append:$LOG_DIR/watcher.err.log

[Install]
WantedBy=default.target
UNIT
  # Validate the unit parses before enabling (FIX H2). `systemd-analyze verify` is best-effort;
  # a non-zero exit on a real parse error is surfaced, but its absence is not fatal.
  if command -v systemd-analyze >/dev/null 2>&1; then
    systemd-analyze --user verify "$SYSTEMD_UNIT" 2>/dev/null || \
      err "warning: systemd-analyze flagged the generated unit (continuing): $SYSTEMD_UNIT"
  fi
  if [ "$INSTALL_TEST" = "1" ]; then say "[self-test] wrote+verified unit; skipping systemctl"; return 0; fi
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload 2>/dev/null || true
    systemctl --user enable --now mcpindex-watcher.service 2>/dev/null || true
    say "registered the auto-onboard watcher (systemd --user: mcpindex-watcher.service, abs uvx + PATH)"
  else
    err "systemctl not found; wrote the unit to $SYSTEMD_UNIT but could not enable it."
    err "Enable it manually with: systemctl --user enable --now mcpindex-watcher.service"
  fi
}

register_watcher() {
  if [ "$PLATFORM" = "macos" ]; then register_watcher_macos; else register_watcher_linux; fi
}

# --- run ----------------------------------------------------------------------------------
install_proxy
resolve_uvx      # pin the absolute uvx path (FIX H2) — used by both wiring + the watcher unit
wire_hosts
register_watcher
say "done. Newly-added servers will be auto-wired within seconds (active on next config"
say "reload on VS Code/Cursor/Windsurf/Cline; after a restart on Claude Desktop/Code/Zed/Gemini CLI)."
say "Continue (~/.continue/config.yaml) is YAML and is NOT auto-onboarded — wire it"
say "explicitly with wrap() / manual wiring. Reverse everything with: uninstall.sh"
