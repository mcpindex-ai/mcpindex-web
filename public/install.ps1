# mcpindex one-click installer (Windows) — the `irm … | iex` shape.
#
# WHAT IT DOES (in order), mirroring install.sh:
#   1. Install the proxy via the $0 uv path: `uv tool install mcpindex-gate`.
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
  [switch]$DryRun,
  # uv is a HARD prerequisite (the proxy is a `uv tool`); default is to bootstrap it. Opt out
  # with -NoBootstrap / MCPINDEX_NO_BOOTSTRAP=1 to get the print-instructions-and-stop path.
  [switch]$NoBootstrap = ($env:MCPINDEX_NO_BOOTSTRAP -eq '1')
)
$ErrorActionPreference = 'Stop'

$Pkg          = 'mcpindex-gate'
# mcpindex-gate 0.8.0 moved trust/tooling under the mcpindex_gate namespace. Proxy uses
# the STABLE console script (name unchanged across versions); the watcher has no console
# script, so it uses the namespaced module path.
$ProxyScript  = 'mcpindex-proxy'
$WatcherModule= 'mcpindex_gate.tooling.cse.watcher'
$TaskName     = 'mcpindex-watcher'
$LogDir       = Join-Path $env:LOCALAPPDATA 'mcpindex'
$UvInstallerUrl = 'https://astral.sh/uv/install.ps1'

function Say($m) { Write-Host "mcpindex: $m" }
function Errw($m) { Write-Error "mcpindex: $m" }

# --- step 0: ensure uv is present (cold-start fix) ----------------------------------------
# The official uv installer drops uv.exe under %USERPROFILE%\.local\bin (or $env:UV_INSTALL_DIR)
# and updates the user PATH in the registry, NOT this process's $env:PATH. Prepend the dir that
# holds uv so the rest of THIS run can exec it.
function Add-UvDirToPath {
  foreach ($d in @($env:UV_INSTALL_DIR, (Join-Path $env:USERPROFILE '.local\bin'), (Join-Path $env:USERPROFILE '.cargo\bin'))) {
    if ($d -and (Test-Path (Join-Path $d 'uv.exe'))) {
      if (($env:PATH -split ';') -notcontains $d) { $env:PATH = "$d;$env:PATH" }
      return $true
    }
  }
  return $false
}

function Ensure-Uv {
  if (Get-Command uv -ErrorAction SilentlyContinue) { return }
  if ((Add-UvDirToPath) -and (Get-Command uv -ErrorAction SilentlyContinue)) { return }  # off-PATH

  if ($NoBootstrap) {
    Errw "uv not found and auto-bootstrap is disabled (-NoBootstrap / MCPINDEX_NO_BOOTSTRAP=1).`n  Install uv, then re-run mcpindex:  irm $UvInstallerUrl | iex"
    exit 1
  }
  if ($DryRun) {
    Say "[dry-run] uv not found; would install it from the official source ($UvInstallerUrl)"
    return
  }

  Say "uv not found; installing it from the official source ($UvInstallerUrl) ..."
  # Ensure TLS >=1.2 before the fetch: stock Windows PowerShell 5.1 can otherwise default to
  # TLS 1.0/1.1. OR into the existing set (do not clear it); Tls13 enum is absent on old .NET.
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls13 } catch { }
  try { Invoke-RestMethod -Uri $UvInstallerUrl | Invoke-Expression }
  catch { Errw "uv installer failed (check network / $UvInstallerUrl)"; exit 1 }
  Add-UvDirToPath | Out-Null
  if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Errw "uv installed but is not on PATH in this session. Open a new terminal, then re-run the mcpindex installer."
    exit 1
  }
  Say "uv installed."
}

# --- step 1: install the proxy ------------------------------------------------------------
function Install-Proxy {
  if ($DryRun) { Say "[dry-run] would run: uv tool install $Pkg"; return }
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
function Proxy-Cmd   { "`"$script:UvxBin`" --from $Pkg $ProxyScript" }
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
from mcpindex_gate.tooling.cse.config_wire import first_run_wire_all, render_first_run_prompt
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
Ensure-Uv                        # cold-start fix: bootstrap uv if missing (the proxy is a `uv tool`)
Install-Proxy
$script:UvxBin = Resolve-Uvx     # pin absolute uvx (FIX H2) for both wiring + the scheduled task
Wire-Hosts
Register-Watcher
Say "done. Newly-added servers will be auto-wired within seconds (active on next config"
Say "reload on VS Code/Cursor/Windsurf/Cline; after a restart on Claude Desktop/Code/Zed/Gemini CLI)."
Say "Continue (~/.continue/config.yaml) is YAML and is NOT auto-onboarded — wire it"
Say "explicitly with wrap() / manual wiring. Reverse everything with: uninstall.ps1"
