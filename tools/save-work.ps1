param(
    [string]$Message = "",
    [switch]$NoPush
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

$ToolRoot = Join-Path $env:LOCALAPPDATA "Programs\news-monitor-tools"
$PortableGitCmd = Join-Path $ToolRoot "mingit\cmd"
$PortableGhRoot = Join-Path $ToolRoot "gh"
$PortableGhBin = Join-Path $ToolRoot "gh\bin"
$CodexNodeBin = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"

Add-PathIfExists $PortableGitCmd
Add-PathIfExists $PortableGhBin
Add-PathIfExists $PortableGhRoot
Add-PathIfExists $CodexNodeBin

$git = Get-Tool "git" @(
    (Join-Path $PortableGitCmd "git.exe"),
    (Join-Path $Root ".tools\mingit\cmd\git.exe")
)

if (-not $git) {
    throw "Git is required to save work to GitHub."
}

& $git config core.hooksPath .githooks | Out-Null

$branch = (& $git rev-parse --abbrev-ref HEAD).Trim()
$status = (& $git status --porcelain)
if (-not $status) {
    Write-Host "No local changes to save."
    exit 0
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
if (-not $Message) {
    $Message = "Workspace sync $stamp"
}

& $git fetch origin --prune

if ($branch -ne "main") {
    $machine = ($env:COMPUTERNAME -replace "[^A-Za-z0-9-]", "-").ToLowerInvariant()
    if (-not $machine) { $machine = "pc" }
    $safeBranch = "codex/wip-$machine"
    $Message = "Safety sync from $branch $stamp"

    Write-Host "Current branch is '$branch', not main."
    Write-Host "Saving this work to safety branch '$safeBranch' so it is not lost or mixed into production."
    & $git add -A
    & $git commit -m $Message
    if (-not $NoPush) {
        $env:NEWS_MONITOR_ALLOW_SAFETY_PUSH = "1"
        try {
            & $git push origin "HEAD:refs/heads/$safeBranch"
        } finally {
            Remove-Item Env:\NEWS_MONITOR_ALLOW_SAFETY_PUSH -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Saved to $safeBranch. Run START_WORK.cmd again to move this folder back to main."
    exit 0
}

$behind = (& $git rev-list --count "HEAD..origin/main").Trim()
if ([int]$behind -gt 0) {
    throw "Local main is behind origin/main. Run START_WORK.cmd before saving."
}

Write-Host "Staging tracked workspace changes..."
& $git add -A

Write-Host "Committing: $Message"
& $git commit -m $Message

if (-not $NoPush) {
    Write-Host "Pushing to origin main..."
    & $git push origin main
}

Write-Host "Saved. Another PC can now run START_WORK.cmd and continue from this state."
