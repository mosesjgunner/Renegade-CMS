# Stage 07 final gate runner. Runs each gate in dependency order inside the clean checkout,
# against explicit disposable databases only. .env is never loaded; PAYLOAD_SECRET is generated per run.
param(
  [string]$Checkout = 'C:/Projects/RENEGADE CMS/rc1-stage07-final-5bda8bdd',
  [string]$Out = 'C:/Projects/RENEGADE CMS/Renegade-CMS/docs/rc/evidence/rc1/stage-07/gemini/final/records',
  [string[]]$Gates = @('format', 'lint', 'types', 'unit', 'mig-fresh', 'mig-upgrade', 'mig-commerce', 'integration', 'build', 'bundles')
)
$Gates = @($Gates | ForEach-Object { $_ -split ',' })
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force $Out | Out-Null
Set-Location $Checkout
$sha = (git rev-parse HEAD).Trim()
$base = 'postgresql://renegade:s07finalpw@127.0.0.1:55437'
$env:PAYLOAD_SECRET = -join ((48..57) + (97..122) | Get-Random -Count 48 | % { [char]$_ })
$env:BUILD_SHA = $sha
$env:APP_URL = 'http://localhost:3000'
$env:LOCAL_E2E_TEST_MODE = ''
$defs = [ordered]@{
  'format'       = @{ cmd = 'npm.cmd run format:check'; db = 'fresh' }
  'lint'         = @{ cmd = 'npm.cmd run lint'; db = 'fresh' }
  'types'        = @{ cmd = 'npm.cmd run typecheck'; db = 'fresh' }
  'unit'         = @{ cmd = 'npm.cmd test'; db = 'fresh' }
  'mig-fresh'    = @{ cmd = 'npm.cmd run test:migrations:fresh'; db = 'fresh' }
  'mig-upgrade'  = @{ cmd = 'npm.cmd run test:migrations:upgrade'; db = 'upgrade' }
  'mig-commerce' = @{ cmd = 'npm.cmd run test:migrations:commerce'; db = 'commerce' }
  'integration'  = @{ cmd = 'npm.cmd run test:integration'; db = 'fresh' }
  'build'        = @{ cmd = 'npm.cmd run build'; db = 'fresh' }
  'bundles'      = @{ cmd = 'npm.cmd run verify:presentation-bundles'; db = 'fresh' }
}
foreach ($g in $Gates) {
  $d = $defs[$g]
  $suffix = if ($g -eq 'mig-upgrade') { '_upgrade_acceptance' } else { '_release_acceptance' }; $url = "$base/$($d.db)$suffix"
  $env:DATABASE_URL = $url
  $env:INTEGRATION_DATABASE_URL = $url
  $env:UPGRADE_MIGRATION_DATABASE_URL = "$base/upgrade_upgrade_acceptance"
  $start = Get-Date
  $log = Join-Path $Out "$g.log.txt"
  cmd.exe /c "$($d.cmd) > `"$log`" 2>&1"
  $code = $LASTEXITCODE
  $rec = [ordered]@{ gate = $g; command = $d.cmd; sha = $sha; exitCode = $code; database = "$($d.db)_release_acceptance (disposable rc1s07-final-pg:55437)"; started = $start.ToString('o'); ended = (Get-Date).ToString('o'); node = (node -v) }
  $rec | ConvertTo-Json | Set-Content (Join-Path $Out "$g.json.txt")
  "$g exit $code"
  if ($code -ne 0) { break }
}



