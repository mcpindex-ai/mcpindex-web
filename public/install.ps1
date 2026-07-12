# mcpindex one-click installer (Windows) — the `irm … | iex` shape.
#
# WHAT IT DOES (in order), mirroring install.sh:
#   1. Install the proxy via the $0 uv path: `uv tool install mcpindex-preflight`.
#   2. Auto-DETECT installed hosts (config paths that exist) + WIRE each unrouted server
#      through the proxy (reuses the audited config_wire — atomic, backed up, reversible).
#      Affirmative consent: echoes the plan + prompts unless -Yes is passed.
#   3. Register the resident auto-onboard WATCHER via a Startup-folder launcher + a scheduled
#      task (schtasks /SC ONLOGON) so a newly-added server is auto-wired within seconds.
#   Logs under %LOCALAPPDATA%\mcpindex (never a network/volume path).
#
# Idempotent + reversible (uninstall.ps1 un-wires all + removes the task). No secret in any
# script/env/log. Closed-vocabulary output.
#
# Usage:
#   irm https://mcpindex.ai/install.ps1 | iex
#   $env:MCPINDEX_YES=1; irm https://mcpindex.ai/install.ps1 | iex    # non-interactive
[CmdletBinding()]
param(
  [switch]$Yes = ($env:MCPINDEX_YES -eq '1'),
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

$Pkg          = 'mcpindex-preflight'
$ProxyModule  = 'tooling.cse.proxy'
$WatcherModule= 'tooling.cse.watcher'
$TaskName     = 'mcpindex-watcher'
$LogDir       = Join-Path $env:LOCALAPPDATA 'mcpindex'

function Say($m) { Write-Host "mcpindex: $m" }
function Errw($m) { Write-Error "mcpindex: $m" }

# --- step 1: install the proxy ------------------------------------------------------------
function Install-Proxy {
  if ($DryRun) { Say "[dry-run] would run: uv tool install $Pkg"; return }
  if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Errw "uv not found. Install uv first (the `$0 path):"
    Errw "  irm https://astral.sh/uv/install.ps1 | iex"
    Errw "(A self-contained mcpindex binary is a deferred follow-up; uv is the current path.)"
    exit 1
  }
  Say "installing the proxy: uv tool install $Pkg"
  uv tool install $Pkg
}

# Resolve the ABSOLUTE uvx path once (FIX H2 — a scheduled task's environment may not have
# ~\.local\bin on PATH, so a bare `uvx` in /TR can silently fail to start). Falls back to the
# documented per-user uv install location.
function Resolve-Uvx {
  $c = Get-Command uvx -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $fallback = Join-Path $env:USERPROFILE '.local\bin\uvx.exe'
  if (Test-Path $fallback) { return $fallback }
  if ($DryRun) { return $fallback }  # dry run never execs — show what we would pin
  Errw "uvx not found on PATH or in $fallback — install uv first: irm https://astral.sh/uv/install.ps1 | iex"
  exit 1
}
$script:UvxBin = $null
function Proxy-Cmd   { "`"$script:UvxBin`" --from $Pkg python -m $ProxyModule" }
function Watcher-Cmd { "`"$script:UvxBin`" --from $Pkg python -m $WatcherModule" }

# --- step 2: detect + wire (consented) ----------------------------------------------------
function Wire-Hosts {
  Say "scanning for installed hosts and unrouted MCP servers..."
  if ($DryRun) { Say "[dry-run] would wire every detected unrouted server (each entry marked for in-place un-wire; reversible)"; return }
  if (-not $Yes) {
    $reply = Read-Host "mcpindex: wire all detected MCP servers through mcpindex now? (each entry marked for in-place un-wire, byte-identical restore, no separate backup file; reversible) [y/N]"
    if ($reply -notmatch '^(y|yes)$') { Say "skipped wiring (re-run with -Yes later)"; return }
  }
  $py = @'
import sys
from tooling.cse.config_wire import first_run_wire_all, render_first_run_prompt
proxy_cmd = sys.argv[1].split()
plan = first_run_wire_all(proxy_cmd=proxy_cmd, confirm=False)
print("mcpindex:", render_first_run_prompt(plan))
results = first_run_wire_all(proxy_cmd=proxy_cmd, confirm=True)
wired = sum(r.n_wired for r in results)
print(f"mcpindex: wired {wired} server(s) across detected hosts (closed-vocab; each entry marked for in-place un-wire, no backup file).")
'@
  $py | uvx --from $Pkg python - (Proxy-Cmd)
}

# --- step 3: register the watcher (Startup launcher + ONLOGON scheduled task) -------------
function Register-Watcher {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $cmd = Watcher-Cmd
  # A .cmd launcher in the Startup folder + a hidden ONLOGON scheduled task (belt and braces;
  # the task survives a Startup-folder clean, the Startup item covers task-scheduler-off).
  $startup  = [Environment]::GetFolderPath('Startup')
  $launcher = Join-Path $startup 'mcpindex-watcher.cmd'
  $body = "@echo off`r`nstart """" /min $cmd >> ""$LogDir\watcher.out.log"" 2>> ""$LogDir\watcher.err.log""`r`n"
  if ($DryRun) {
    Say "[dry-run] would write $launcher and register schtasks /TN $TaskName /SC ONLOGON"
    return
  }
  Set-Content -Path $launcher -Value $body -Encoding ASCII
  # Idempotent: delete an existing task first, then re-create.
  schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
  schtasks /Create /TN $TaskName /SC ONLOGON /TR "cmd /c `"$cmd`"" /RL LIMITED /F | Out-Null
  Say "registered the auto-onboard watcher (Startup launcher + scheduled task $TaskName)"
}

# --- run ----------------------------------------------------------------------------------
Install-Proxy
$script:UvxBin = Resolve-Uvx     # pin absolute uvx (FIX H2) for both wiring + the scheduled task
Wire-Hosts
Register-Watcher
Say "done. Newly-added servers will be auto-wired within seconds (active on next config"
Say "reload on VS Code/Cursor/Windsurf/Cline; after a restart on Claude Desktop/Code/Zed/Gemini CLI)."
Say "Continue (~/.continue/config.yaml) is YAML and is NOT auto-onboarded — wire it"
Say "explicitly with wrap() / manual wiring. Reverse everything with: uninstall.ps1"
