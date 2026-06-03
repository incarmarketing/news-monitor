$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = (Resolve-Path "$PSScriptRoot\..").Path
$PortableGit = Join-Path $env:LOCALAPPDATA "Programs\news-monitor-tools\mingit\cmd"
$PortableGhRoot = Join-Path $env:LOCALAPPDATA "Programs\news-monitor-tools\gh"
$PortableGh = Join-Path $env:LOCALAPPDATA "Programs\news-monitor-tools\gh\bin"
$PortableSupabase = Join-Path $env:LOCALAPPDATA "Programs\news-monitor-tools\supabase"
$CodexNodeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node"
$CodexNodeBin = Join-Path $CodexNodeRoot "bin"
$CodexNodeModules = Join-Path $CodexNodeRoot "node_modules"
$CodexPnpmModules = Join-Path $CodexNodeModules ".pnpm\node_modules"
$VenvActivate = Join-Path $Root ".venv\Scripts\Activate.ps1"

if (Test-Path $PortableGit) {
    $env:Path = "$PortableGit;$env:Path"
}
if (Test-Path $PortableGh) {
    $env:Path = "$PortableGh;$env:Path"
}
if (Test-Path $PortableGhRoot) {
    $env:Path = "$PortableGhRoot;$env:Path"
}
if (Test-Path $PortableSupabase) {
    $env:Path = "$PortableSupabase;$env:Path"
}
if (Test-Path $CodexNodeBin) {
    $env:Path = "$CodexNodeBin;$env:Path"
}

$nodePathParts = @()
if (Test-Path $CodexNodeModules) { $nodePathParts += $CodexNodeModules }
if (Test-Path $CodexPnpmModules) { $nodePathParts += $CodexPnpmModules }
if ($nodePathParts.Count -gt 0) {
    $existingNodePath = if ($env:NODE_PATH) { @($env:NODE_PATH) } else { @() }
    $env:NODE_PATH = (($nodePathParts + $existingNodePath) -join ";")
}

Set-Location $Root

if (Test-Path $VenvActivate) {
    . $VenvActivate
}

Write-Host "news-monitor dev shell"
Write-Host "root: $Root"

try {
    $gitVersion = git --version
    Write-Host "git: $gitVersion"
} catch {
    Write-Host "git: not available"
}

try {
    $pythonVersion = python --version
    Write-Host "python: $pythonVersion"
} catch {
    Write-Host "python: not available"
}

try {
    $nodeVersion = node --version
    Write-Host "node: $nodeVersion"
} catch {
    Write-Host "node: not available"
}

try {
    $supabaseVersion = supabase --version
    Write-Host "supabase: $supabaseVersion"
} catch {
    Write-Host "supabase: not available"
}

try {
    $ghVersion = (gh --version | Select-Object -First 1)
    Write-Host "gh: $ghVersion"
} catch {
    Write-Host "gh: not available"
}

Write-Host ""
Write-Host "Next:"
Write-Host "  .\START_WORK.cmd"
Write-Host "  git status --short --branch"
Write-Host "  python run_once.py"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\tools\ui-qa.ps1"
Write-Host ""
Write-Host "Tip: run as '. .\tools\dev-shell.ps1' to keep PATH and venv activation in the current PowerShell session."
Write-Host "Tip: use START_WORK.cmd when switching PCs; it aligns the folder to GitHub main first."
