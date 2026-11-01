param([ValidateSet('migrate','journey','restart')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc115e-20261101 | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $target[0].Config.Labels.'rc1.scope' -ne '15e' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc115e_release_acceptance') { throw 'Disposable containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5479/rc115e_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc115e-disposable-only-0123456789abcdef0123456789abcdef'
$env:AI_CREDENTIAL_KEY_BASE64URL = [Convert]::ToBase64String([byte[]](1..32)).TrimEnd('=').Replace('+','-').Replace('/','_')
$env:APP_URL = 'http://127.0.0.1:39064'
$env:NETWORKING_ENABLED = 'true'
$env:NETWORK_ALLOW_PRIVATE_DEVELOPMENT = 'true'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc115e/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:NODE_ENV = 'development'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc115e'
$env:NODE_OPTIONS = '--no-deprecation --max-old-space-size=4096'
$env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
if ($Action -eq 'journey') {
  if (Test-Path 'scratch/rc115e/state.json') { Remove-Item 'scratch/rc115e/state.json' -Force }
  if (Test-Path '.next-rc115e') { Remove-Item '.next-rc115e' -Recurse -Force }
}
node --import tsx tests/rc1-15e/journey.ts $Action
exit $LASTEXITCODE
