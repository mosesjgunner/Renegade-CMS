param([ValidateSet('migrate','journey','restart','serve','units','types')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$databaseName = if ($env:RC117A_LANE -eq 'final') { 'rc117a_final_release_acceptance' } else { 'rc117a_release_acceptance' }
if ($env:RC117A_LANE -eq 'confirmation') { $databaseName = 'rc117a_confirmation_release_acceptance' }
if ($env:RC117A_LANE -eq 'delivery') { $databaseName = 'rc117a_delivery_release_acceptance' }
if ($env:RC117A_LANE -eq 'verified') { $databaseName = 'rc117a_verified_release_acceptance' }
$env:DATABASE_URL = "postgresql://rc117a:rc117a-disposable@127.0.0.1:5467/$databaseName"
$env:PAYLOAD_SECRET = 'rc117a-disposable-only-20261102-secret-0123456789'
$env:APP_URL = 'http://localhost:39170'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc117a/media'
if ($env:RC117A_LANE -eq 'final') { $env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc117a-final/media' }
if ($env:RC117A_LANE -eq 'confirmation') { $env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc117a-confirmation/media' }
if ($env:RC117A_LANE -eq 'delivery') { $env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc117a-delivery/media' }
if ($env:RC117A_LANE -eq 'verified') { $env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc117a-verified/media' }
$env:STORAGE_DRIVER = 'local'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc117a'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:EMAIL_MODE = 'smtp'
$env:EMAIL_FROM = 'security@rc117a.test'
$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '39171'
$env:SMTP_SECURE = 'false'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:NODE_OPTIONS = '--no-deprecation --max-old-space-size=4096'
switch ($Action) {
  'migrate' { npm.cmd run test:migrations:fresh }
  'serve' { node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 39170 }
  'journey' {
    if ($env:RC117A_RESUME -eq 'true') { npx.cmd tsx tests/rc1-17a/journey.ts --resume }
    else { npx.cmd tsx tests/rc1-17a/journey.ts }
  }
  'restart' { npx.cmd tsx tests/rc1-17a/journey.ts --restart }
  'units' { npx.cmd vitest run tests/unit/security-negative-matrix.test.ts tests/unit/tenant-isolation.test.ts tests/unit/authorization-matrix.test.ts tests/unit/rc06-auth-attacks.test.ts tests/unit/rc1-17a-user-scope.test.ts }
  'types' { npm.cmd run typecheck }
}
exit $LASTEXITCODE
