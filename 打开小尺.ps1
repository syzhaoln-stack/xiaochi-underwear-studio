$ErrorActionPreference = 'Stop'
$studioRoot = $PSScriptRoot
$serverScript = Join-Path $studioRoot 'serve.cjs'
$indexFile = Join-Path $studioRoot 'dist\index.html'
if (-not (Test-Path -LiteralPath $indexFile)) { throw '找不到网页成品，请先构建本应用。' }
$studioUrl = 'http://127.0.0.1:5184/'
$studioRunning = $false
try { $studioResponse = Invoke-WebRequest -Uri $studioUrl -TimeoutSec 2; $studioRunning = $studioResponse.Content -match '小尺' } catch { }
if (-not $studioRunning) {
  $nodeProgram = (Get-Command node -ErrorAction Stop).Source
  Start-Process -FilePath $nodeProgram -ArgumentList @('"' + $serverScript + '"', '5184') -WorkingDirectory $studioRoot -WindowStyle Hidden
  Start-Sleep -Milliseconds 700
}
Start-Process $studioUrl
