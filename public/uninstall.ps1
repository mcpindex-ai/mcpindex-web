# mcpindex uninstaller (Windows) — the reverse of install.ps1. Idempotent + safe.
#
# WHAT IT DOES (in order):
#   1. Remove the resident auto-onboard WATCHER (the ONLOGON scheduled task + the Startup
#      launcher).
#   2. UN-WIRE every host config (reuses config_wire.unwire → reconstructs each of our marked
#      entries IN PLACE from the per-entry marker written at wire time; unmarked entries are
#      left untouched. No whole-file backup is involved post-FIX-H1).
#   3. Optionally remove the proxy tool (-RemoveTool → uv tool uninstall).
#
# Closed-vocabulary output. No secret read or printed.
#
# Usage: irm https://mcpindex.ai/uninstall.ps1 | iex   (or run the file with -RemoveTool / -DryRun)
[CmdletBinding()]
param(
  [switch]$RemoveTool,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

$Pkg      = 'mcpindex-gate'
$TaskName = 'mcpindex-watcher'

function Say($m) { Write-Host "mcpindex: $m" }

# --- step 1: remove the watcher -----------------------------------------------------------
function Remove-Watcher {
  $startup  = [Environment]::GetFolderPath('Startup')
  $launcher = Join-Path $startup 'mcpindex-watcher.cmd'
  if ($DryRun) { Say "[dry-run] would delete schtasks $TaskName and $launcher"; return }
  schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
  if (Test-Path $launcher) { Remove-Item -Force $launcher }
  Say "removed the watcher (scheduled task $TaskName + Startup launcher)"
}

# --- step 2: un-wire all host configs -----------------------------------------------------
function Unwire-Hosts {
  if ($DryRun) { Say "[dry-run] would un-wire every host config in place (per-entry, from the markers we wrote)"; return }
  $py = @'
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
'@
  $py | uvx --from $Pkg python -
}

# --- step 3: optionally remove the proxy tool ---------------------------------------------
function Remove-Tool {
  if (-not $RemoveTool) { Say "left the proxy package installed (use -RemoveTool to remove)"; return }
  if ($DryRun) { Say "[dry-run] would run: uv tool uninstall $Pkg"; return }
  if (Get-Command uv -ErrorAction SilentlyContinue) { uv tool uninstall $Pkg 2>$null }
  Say "removed the proxy package ($Pkg)"
}

# --- run ----------------------------------------------------------------------------------
Remove-Watcher
Unwire-Hosts
Remove-Tool
Say "done. mcpindex is uninstalled; your host configs were un-wired in place."
