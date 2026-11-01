param([ValidateSet('migrate','journey','restart')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc115d-20261101 | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $target[0].Config.Labels.'rc1.scope' -ne '15d' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc115d_release_acceptance') { throw 'Disposable containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5478/rc115d_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc115d-disposable-only-0123456789abcdef0123456789abcdef'
$env:AI_CREDENTIAL_KEY_BASE64URL = [Convert]::ToBase64String([byte[]](1..32)).TrimEnd('=').Replace('+','-').Replace('/','_')
$env:APP_URL = 'http://127.0.0.1:39063'
$env:NETWORKING_ENABLED = 'true'
$env:NETWORK_ALLOW_PRIVATE_DEVELOPMENT = 'true'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc115d/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:NODE_ENV = 'development'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc115d'
$env:NODE_OPTIONS = '--no-deprecation --max-old-space-size=4096'
$env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
if ($Action -eq 'journey') {
  if (Test-Path 'scratch/rc115d/state.json') { Remove-Item 'scratch/rc115d/state.json' -Force }
  if (Test-Path '.next-rc115d') { Remove-Item '.next-rc115d' -Recurse -Force }
}
node --import tsx tests/rc1-15d/journey.ts $Action
exit $LASTEXITCODE

