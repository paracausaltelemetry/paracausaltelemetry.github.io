# Refreshes TryHackMe room details from this PC and pushes them, since
# TryHackMe refuses the CI runners. Run by a Windows scheduled task
# ("Paracausal THM refresh", hourly while logged on); safe to run by hand.
#
# Everything lives under %USERPROFILE%\.paracausal-meta-refresh:
#   bin\   copies of this script and fetch-writeup-meta.py, taken when you run
#          -Register from a checkout you trust. The task only runs these.
#   repo\  a clone reset to origin/main on every run. It is only ever data
#          (writeups/index.json in, writeups/meta/thm/ out): no code from it
#          runs, so whatever lands on main can't run on this PC.
# Only writeups/meta/thm/ is committed. That push starts the content-index
# workflow, which rebuilds the pages and share cards with the new details.
#
# One-time setup (needs Python with Playwright and Chromium installed), from a
# checkout of reviewed code; run it again after either script changes:
#   powershell -ExecutionPolicy Bypass -File scripts\refresh-thm-meta.ps1 -Register
# Optional, recommended: push with a fine-grained token limited to this repo
# (Contents: read and write) instead of the GitHub CLI's login. Prompts for it
# and stores it encrypted for your Windows account (DPAPI):
#   powershell -ExecutionPolicy Bypass -File scripts\refresh-thm-meta.ps1 -SetToken

param([switch]$Register, [switch]$SetToken)

$ErrorActionPreference = "Stop"
# not under AppData: a packaged app (such as Claude desktop) that runs -Register
# gets AppData writes virtualised into its own package folder, which the
# scheduled task can't see
$root = Join-Path $env:USERPROFILE ".paracausal-meta-refresh"
$bin = Join-Path $root "bin"
$repo = Join-Path $root "repo"
$log = Join-Path $root "refresh.log"
$tokenFile = Join-Path $root "push-token.dat"
$remote = "https://github.com/paracausaltelemetry/paracausaltelemetry.github.io.git"
$taskName = "Paracausal THM refresh"

if ($SetToken) {
  New-Item -ItemType Directory -Force $root | Out-Null
  Read-Host "Fine-grained token (Contents: read and write on this repo only)" -AsSecureString | ConvertFrom-SecureString | Set-Content $tokenFile
  Write-Output "Saved. Pushes now use this token instead of the GitHub CLI login."
  return
}

if ($Register) {
  New-Item -ItemType Directory -Force $bin | Out-Null
  foreach ($source in $PSCommandPath, (Join-Path $PSScriptRoot "fetch-writeup-meta.py")) {
    $target = Join-Path $bin (Split-Path $source -Leaf)
    if ((Resolve-Path $source).Path -ne $target) { Copy-Item $source $target -Force }
  }
  $script = Join-Path $bin "refresh-thm-meta.ps1"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1)
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Fetches TryHackMe room details for paracausaltelemetry.com writeups and pushes them (scripts/refresh-thm-meta.ps1)." -Force | Out-Null
  Write-Output "Registered '$taskName' (hourly), running $script. Log: $log"
  return
}

New-Item -ItemType Directory -Force $root | Out-Null
Start-Transcript -Path $log -Append | Out-Null
try {
  $python = (Get-Command python.exe -CommandType Application | Select-Object -First 1).Source
  if (-not (Test-Path (Join-Path $repo ".git"))) { git clone -q $remote $repo }
  Set-Location $repo
  git fetch -q origin main
  git reset -q --hard origin/main
  git clean -qfd

  # the trusted copy, isolated (-I) from the clone and from PYTHON* variables
  $env:PT_SITE_ROOT = $repo
  & $python -I (Join-Path $bin "fetch-writeup-meta.py") --browser
  Remove-Item Env:PT_SITE_ROOT

  git add writeups/meta/thm
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { Write-Output "No new TryHackMe details."; return }

  git -c user.name="Xûr | Agent of the Nine" -c user.email="109699239+paracausaltelemetry@users.noreply.github.com" commit -q -m "Refresh TryHackMe room details"
  # a scheduled task can't prompt: use the saved token, else the GitHub CLI login
  if (Test-Path $tokenFile) {
    $secure = Get-Content $tokenFile | ConvertTo-SecureString
    $env:PT_PUSH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    $helper = 'credential.helper=!f() { echo username=x-access-token; echo password=$PT_PUSH_TOKEN; }; f'
  } else {
    $helper = 'credential.helper=!gh auth git-credential'
  }
  try {
    # the content-index bot may have pushed meanwhile: rebase and try again
    foreach ($attempt in 1..3) {
      git -c credential.helper= -c $helper push -q origin HEAD:main
      if ($LASTEXITCODE -eq 0) { Write-Output "Pushed new TryHackMe details."; return }
      git pull -q --rebase origin main
    }
    throw "Push failed after 3 attempts"
  } finally {
    Remove-Item Env:PT_PUSH_TOKEN -ErrorAction SilentlyContinue
  }
} finally {
  Stop-Transcript | Out-Null
}
