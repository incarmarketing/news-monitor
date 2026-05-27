param(
    [string]$Root = (Resolve-Path "$PSScriptRoot\..").Path
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Show-Status($Name, $Ok, $Detail = "") {
    $mark = if ($Ok) { "OK" } else { "WARN" }
    $line = "{0,-6} {1}" -f "[$mark]", $Name
    if ($Detail) {
        $line = "$line - $Detail"
    }
    Write-Host $line
}

function Get-CommandPath($Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return ""
}

function First-ExistingPath($Paths) {
    foreach ($path in $Paths) {
        try {
            if ($path -and (Test-Path -LiteralPath $path -ErrorAction Stop)) { return $path }
        } catch {
            # Some corporate Windows profiles deny probing selected AppData paths.
            # Treat that as "not found" so the preflight can continue.
        }
    }
    return ""
}

function Get-GitRef($Path) {
    if (-not (Test-Path $Path)) { return "" }
    return (Get-Content -Encoding UTF8 -Raw $Path).Trim()
}

Set-Location $Root
Write-Host "news-monitor preflight"
Write-Host "root: $Root"
Write-Host ""

$head = Get-GitRef ".git\HEAD"
$branch = if ($head -match "^ref: refs/heads/(.+)$") { $Matches[1] } else { "(detached)" }
$localMain = Get-GitRef ".git\refs\heads\main"
$originMain = Get-GitRef ".git\refs\remotes\origin\main"

Show-Status "Git metadata" (Test-Path ".git") "branch=$branch"
if ($localMain -and $originMain) {
    Show-Status "main vs origin/main" ($localMain -eq $originMain) "local=$($localMain.Substring(0, 12)) origin=$($originMain.Substring(0, 12))"
}

$gitPath = Get-CommandPath "git"
$portableGit = First-ExistingPath @(
    (Join-Path $env:LOCALAPPDATA "Programs\news-monitor-tools\mingit\cmd\git.exe"),
    (Join-Path $Root ".tools\mingit\cmd\git.exe")
)
$gitExe = if ($gitPath) { $gitPath } else { $portableGit }
Show-Status "git executable" ($gitExe -ne "") $gitExe

$ghPath = Get-CommandPath "gh"
$portableGh = First-ExistingPath @(
    (Join-Path $env:LOCALAPPDATA "Programs\news-monitor-tools\gh\bin\gh.exe"),
    (Join-Path $Root ".tools\gh\bin\gh.exe")
)
$ghExe = if ($ghPath) { $ghPath } else { $portableGh }
Show-Status "github cli" ($ghExe -ne "") $ghExe

$supabasePath = Get-CommandPath "supabase"
$portableSupabase = First-ExistingPath @(
    (Join-Path $env:LOCALAPPDATA "Programs\news-monitor-tools\supabase\supabase.exe"),
    (Join-Path $Root ".tools\supabase\supabase.exe")
)
$supabaseExe = if ($supabasePath) { $supabasePath } else { $portableSupabase }
Show-Status "supabase cli" ($supabaseExe -ne "") $supabaseExe

$pythonPath = Get-CommandPath "python"
$installedPython = First-ExistingPath @(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe")
)
$pythonExe = if ($pythonPath) { $pythonPath } else { $installedPython }
$pyPath = Get-CommandPath "py"
$venvPython = First-ExistingPath @(
    (Join-Path $Root ".venv\Scripts\python.exe"),
    (Join-Path $Root ".venv\bin\python")
)
Show-Status "python executable" ($pythonExe -ne "") $pythonExe
Show-Status "py launcher optional" (($pyPath -ne "") -or ($pythonExe -ne "")) $(if ($pyPath) { $pyPath } else { "not required when python.exe is available" })
Show-Status ".venv python" ($venvPython -ne "") $venvPython

$envPath = Join-Path $Root ".env"
Show-Status ".env file" (Test-Path $envPath) $envPath

if (Test-Path $envPath) {
    $required = @(
        "NAVER_CLIENT_ID",
        "NAVER_CLIENT_SECRET",
        "GEMINI_API_KEY",
        "KAKAO_REST_API_KEY",
        "KAKAO_REFRESH_TOKEN",
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY"
    )

    $envLines = Get-Content -Encoding UTF8 $envPath
    foreach ($key in $required) {
        $match = $envLines | Where-Object { $_ -match "^\s*$([regex]::Escape($key))\s*=" } | Select-Object -First 1
        $value = if ($match) { ($match -split "=", 2)[1].Trim() } else { "" }
        Show-Status "env:$key" ($value -ne "") $(if ($value -ne "") { "set" } else { "empty" })
    }
}

Show-Status "requirements.txt" (Test-Path "requirements.txt") "run: pip install -r requirements.txt"

if ($venvPython) {
    try {
        $importCheck = & $venvPython -c "import feedparser, requests, dotenv, google.generativeai, schedule, rich, jinja2; print('deps ok')" 2>&1
        Show-Status "python deps" ($LASTEXITCODE -eq 0) ($importCheck -join " ")
    } catch {
        Show-Status "python deps" $false $_.Exception.Message
    }
}

Write-Host ""
Write-Host "Before cross-PC work:"
Write-Host "  . .\tools\dev-shell.ps1"
Write-Host "  git pull --ff-only origin main"
Write-Host "  git checkout -b codex/<task-name>"
Write-Host "  git status --short"
