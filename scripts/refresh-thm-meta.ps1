# Refreshes TryHackMe room details from this PC and pushes them, since
# TryHackMe refuses the CI runners. Run by a Windows scheduled task
# ("Paracausal THM refresh", hourly while logged on); safe to run by hand.
#
# Works in its own clone under %LOCALAPPDATA%\paracausal-meta-refresh, never
# in a checkout you edit: the clone is reset to origin/main on every run.
# Only writeups/meta/thm/ is committed. That push starts the content-index
# workflow, which rebuilds the pages and share cards with the new details.
#
# One-time setup (needs Python with Playwright and Chromium installed):
#   powershell -ExecutionPolicy Bypass -File scripts\refresh-thm-meta.ps1 -Register

param([switch]$Register)

$ErrorActionPreference = "Stop"
$root = Join-Path $env:LOCALAPPDATA "paracausal-meta-refresh"
$repo = Join-Path $root "repo"
$log = Join-Path $root "refresh.log"
$remote = "https://github.com/paracausaltelemetry/paracausaltelemetry.github.io.git"
$taskName = "Paracausal THM refresh"

if ($Register) {
  # runs the copy inside the clone, so it stays current with main
  New-Item -ItemType Directory -Force $root | Out-Null
  $script = Join-Path $repo "scripts\refresh-thm-meta.ps1"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1)
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Fetches TryHackMe room details for paracausaltelemetry.com writeups and pushes them (scripts/refresh-thm-meta.ps1)." -Force | Out-Null
  Write-Output "Registered '$taskName' (hourly). Log: $log"
  if (-not (Test-Path (Join-Path $repo ".git"))) { git clone -q $remote $repo }
  return
}

New-Item -ItemType Directory -Force $root | Out-Null
Start-Transcript -Path $log -Append | Out-Null
try {
  if (-not (Test-Path (Join-Path $repo ".git"))) { git clone -q $remote $repo }
  Set-Location $repo
  git fetch -q origin main
  git reset -q --hard origin/main
  git clean -qfd

  python scripts/fetch-writeup-meta.py --browser

  git add writeups/meta/thm
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { Write-Output "No new TryHackMe details."; return }

  git -c user.name="Xûr | Agent of the Nine" -c user.email="109699239+paracausaltelemetry@users.noreply.github.com" commit -q -m "Refresh TryHackMe room details"
  # the content-index bot may have pushed meanwhile: rebase and try again
  foreach ($attempt in 1..3) {
    # signs in with the GitHub CLI's login (a scheduled task can't prompt)
    git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -q origin HEAD:main
    if ($LASTEXITCODE -eq 0) { Write-Output "Pushed new TryHackMe details."; return }
    git pull -q --rebase origin main
  }
  throw "Push failed after 3 attempts"
} finally {
  Stop-Transcript | Out-Null
}
