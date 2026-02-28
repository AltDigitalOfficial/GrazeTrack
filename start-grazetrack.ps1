$ErrorActionPreference = "Stop"

$repoRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$webappPath = Join-Path $repoRoot "webapp"
$backendPath = Join-Path $repoRoot "backend"
$firebasePath = Join-Path $backendPath "secrets\firebase-service-account.json"

if (-not (Test-Path -Path $webappPath -PathType Container)) {
  throw "Missing webapp directory: $webappPath"
}

if (-not (Test-Path -Path $backendPath -PathType Container)) {
  throw "Missing backend directory: $backendPath"
}

if (-not (Test-Path -Path $firebasePath -PathType Leaf)) {
  throw "Missing Firebase service account file: $firebasePath"
}

$webappCmd = "Set-Location `"$webappPath`"; npm run dev"
$backendCmd = "`$env:FIREBASE_SERVICE_ACCOUNT_PATH=`"$firebasePath`"; Set-Location `"$backendPath`"; npx ts-node ./src/server.ts"

Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoExit",
  "-Command",
  $webappCmd
) | Out-Null

Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoExit",
  "-Command",
  $backendCmd
) | Out-Null

Write-Host "Started GrazeTrack frontend and backend in separate terminals."
