#requires -Version 5.1
<#
.SYNOPSIS
  Rewrites ?v=... query strings on cache-sensitive static asset refs.

.DESCRIPTION
  Cache-bust pass for static assets. Uses the current git short SHA for
  stylesheet/script refs, and the social preview image content hash for the
  card image, so cached browsers and social scrapers refetch changed assets.

  Run from the repo root: pwsh -File scripts/cache-bust.ps1
  Or override the token:  pwsh -File scripts/cache-bust.ps1 -Version 26

  Matches `styles.css?v=...`, `something.js?v=...`, and the social preview
  image URL (with or without an existing query string).
  Rewrites these refs in .html files AND in .js ES-module import strings
  (e.g. import { x } from "./content.js?v=..."), so module imports can't drift.
  Leaves Google Fonts URLs and other ? query strings alone.
#>

[CmdletBinding()]
param(
  [string]$Version
)

$ErrorActionPreference = 'Stop'

if (-not $Version) {
  $sha = (& git rev-parse --short HEAD 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $sha) {
    throw "git rev-parse failed; pass -Version explicitly."
  }
  $Version = $sha
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPattern = '(\.(?:css|js|mjs))\?v=[A-Za-z0-9]+'
$scriptReplacement = "`${1}?v=$Version"
$socialPreviewPath = Join-Path $repoRoot 'src\social-preview.png'
if (-not (Test-Path -LiteralPath $socialPreviewPath)) {
  throw "Missing social preview image: $socialPreviewPath"
}
$socialPreviewVersion = (Get-FileHash -LiteralPath $socialPreviewPath -Algorithm SHA256).Hash.Substring(0, 8).ToLowerInvariant()
$socialPreviewPattern = '(social-preview\.png)(?:\?v=[A-Za-z0-9]+)?'
$socialPreviewReplacement = "`${1}?v=$socialPreviewVersion"

# Match the exclusion against the path *relative to* $repoRoot, not the full
# path. When run from a git worktree the repo root itself lives under
# ...\.claude\worktrees\<name>\, so matching the full path excluded every file
# (0 updated). Relative matching only skips nested .git/node_modules/tmp dirs.
$files = Get-ChildItem -Path $repoRoot -Recurse -File -Include *.html, *.js, *.mjs |
  Where-Object { $_.FullName.Substring($repoRoot.Length) -notmatch '\\(?:\.git|node_modules|\.claude|tmp)\\' }

# Read via [System.IO.File]::ReadAllText (UTF-8 with BOM detection) instead of
# Get-Content -Encoding utf8 — the latter mis-decodes BOM-less UTF-8 as
# Windows-1252 on PS5.1, which baked mojibake into every multi-byte character
# in earlier runs of this script.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$changed = 0
foreach ($f in $files) {
  $raw = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
  $new = [regex]::Replace($raw, $scriptPattern, $scriptReplacement)
  $new = [regex]::Replace($new, $socialPreviewPattern, $socialPreviewReplacement)
  if ($new -ne $raw) {
    [System.IO.File]::WriteAllText($f.FullName, $new, $utf8NoBom)
    $changed++
    Write-Host "  bumped $($f.FullName.Substring($repoRoot.Length + 1))"
  }
}

Write-Host "`nCache-bust complete: $changed file(s) updated to ?v=$Version; social preview ?v=$socialPreviewVersion"
