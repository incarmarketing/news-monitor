param(
    [switch]$SkipPull,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $Root

function Add-PathIfExists($Path) {
    if ($Path -and (Test-Path -LiteralPath $Path)) {
        $parts = $env:Path -split ";"
        if ($parts -notcontains $Path) {
            $env:Path = "$Path;$env:Path"
        }
    }
}

function Get-Tool($Name, $Fallbacks = @()) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($path in $Fallbacks) {
        if ($path -and (Test-Path -LiteralPath $path)) { return $path }
    }
    return ""
}

function Write-Step($Text) {
    Write-Host ""
    Write-Host "== $Text =="
}

$ToolRoot = Join-Path $env:LOCALAPPDATA "Programs\news-monitor-tools"
$PortableGitCmd = Join-Path $ToolRoot "mingit\cmd"
$PortableGhRoot = Join-Path $ToolRoot "gh"
$PortableGhBin = Join-Path $ToolRoot "gh\bin"
$PortableSupabase = Join-Path $ToolRoot "supabase"
$CodexNodeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node"
$CodexNodeBin = Join-Path $CodexNodeRoot "bin"
$VenvActivate = Join-Path $Root ".venv\Scripts\Activate.ps1"

Add-PathIfExists $PortableGitCmd
Add-PathIfExists $PortableGhBin
Add-PathIfExists $PortableGhRoot
Add-PathIfExists $PortableSupabase
Add-PathIfExists $CodexNodeBin

if (Test-Path $VenvActivate) {
    . $VenvActivate
}

$git = Get-Tool "git" @(
    (Join-Path $PortableGitCmd "git.exe"),
    (Join-Path $Root ".tools\mingit\cmd\git.exe")
)
$node = Get-Tool "node" @(
    (Join-Path $CodexNodeBin "node.exe"),
    (Join-Path $Root ".tools\node\bin\node.exe")
)
$npm = Get-Tool "npm" @(
    (Join-Path $CodexNodeBin "npm.cmd"),
    (Join-Path $Root ".tools\node\bin\npm.cmd")
)
$gh = Get-Tool "gh" @(
    (Join-Path $PortableGhRoot "gh.exe"),
    (Join-Path $PortableGhBin "gh.exe"),
    (Join-Path $Root ".tools\gh\bin\gh.exe")
)

Write-Host "news-monitor workspace"
Write-Host "root: $Root"

if (-not $git) {
    Write-Host ""
    Write-Host "Git executable is missing. Install Git once, then run START_WORK.cmd again."
    Write-Host "Expected portable path: $PortableGitCmd"
    throw "Git is required for cross-PC synchronization."
}

Write-Step "Tool Check"
Write-Host "git:  $(& $git --version)"
if ($gh) { Write-Host "gh:   $((& $gh --version) | Select-Object -First 1)" } else { Write-Host "gh:   not found" }
if ($node) { Write-Host "node: $(& $node --version)" } else { Write-Host "node: not found" }

Write-Step "Git Guard"
$inside = (& $git rev-parse --is-inside-work-tree 2>$null).Trim()
if ($inside -ne "true") {
    throw "This folder is not a Git working tree."
}

& $git config core.hooksPath .githooks | Out-Null

$branch = (& $git rev-parse --abbrev-ref HEAD).Trim()
$status = (& $git status --porcelain)
if ($status) {
    Write-Host "Uncommitted local changes were detected."
    Write-Host "To avoid losing or mixing work between PCs, this start script will not switch branches."
    Write-Host ""
    & $git status --short
    Write-Host ""
    if ($branch -eq "main") {
        Write-Host "Run SAVE_WORK.cmd to push these changes to main, then run START_WORK.cmd again."
    } else {
        Write-Host "Run SAVE_WORK.cmd to store this old-branch work in a safety branch, then run START_WORK.cmd again."
    }
    throw "Workspace has uncommitted changes."
}

if (-not $SkipPull) {
    Write-Host "Fetching origin..."
    & $git fetch origin --prune

    if ($branch -ne "main") {
        Write-Host "Current branch is '$branch'. Switching to main so every PC uses the same source."
        & $git switch main
    }

    Write-Host "Updating main..."
    & $git pull --ff-only origin main
}

$head = (& $git log -1 --format="%h %s").Trim()
Write-Host "current: $head"

if (-not $SkipInstall -and (Test-Path (Join-Path $Root "frontend\package.json")) -and $npm) {
    $nodeModules = Join-Path $Root "frontend\node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Step "Frontend Dependencies"
        Push-Location (Join-Path $Root "frontend")
        try {
            & $npm install --no-audit --no-fund
        } finally {
            Pop-Location
        }
    }
}

Write-Step "Ready"
Write-Host "Use this window for work. It is now aligned to GitHub main."
Write-Host "When finished, run SAVE_WORK.cmd so the next PC starts from the same state."
