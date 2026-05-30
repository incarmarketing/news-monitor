param(
    [string]$Root = (Resolve-Path "$PSScriptRoot\..").Path,
    [switch]$Screenshots
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function First-ExistingPath($Paths) {
    foreach ($path in $Paths) {
        try {
            if ($path -and (Test-Path -LiteralPath $path -ErrorAction Stop)) { return $path }
        } catch {
            # Keep probing other runtime locations.
        }
    }
    return ""
}

function Get-CommandPath($Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return ""
}

$CodexNodeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node"
$PathNode = Get-CommandPath "node"
$NodeExe = First-ExistingPath @(
    $env:UI_QA_NODE,
    (Join-Path $CodexNodeRoot "bin\node.exe"),
    $PathNode
)

if (-not $NodeExe) {
    throw "Node.js runtime was not found. Run Codex with the bundled runtime or install Node.js."
}

$NodeModuleCandidates = @(
    $env:UI_QA_NODE_MODULES,
    (Join-Path $CodexNodeRoot "node_modules"),
    (Join-Path $Root "node_modules")
)

$NodePathParts = @()
foreach ($candidate in $NodeModuleCandidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        $NodePathParts += $candidate
        $pnpmHoist = Join-Path $candidate ".pnpm\node_modules"
        if (Test-Path -LiteralPath $pnpmHoist) {
            $NodePathParts += $pnpmHoist
        }
    }
}

if ($NodePathParts.Count -gt 0) {
    $existing = if ($env:NODE_PATH) { @($env:NODE_PATH) } else { @() }
    $env:NODE_PATH = (($NodePathParts + $existing) -join ";")
}

$Script = Join-Path $PSScriptRoot "ui-qa.mjs"
$Args = @($Script, "--root", $Root)
if ($Screenshots) {
    $Args += "--screenshots"
}

Write-Host "news-monitor UI QA"
Write-Host "root: $Root"
Write-Host "node: $NodeExe"
Write-Host ""

& $NodeExe @Args
exit $LASTEXITCODE
