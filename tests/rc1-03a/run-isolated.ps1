param([ValidateSet('migrate', 'types', 'dev', 'verify', 'restart', 'browser', 'controls')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$env:DATABASE_URL = 'postgresql://rc103a:rc103a-isolated@127.0.0.1:5435/rc103a_release_acceptance'
$env:PAYLOAD_SECRET = 'rc103a-isolated-local-operator-proof-secret-20261017-ordinary-auth'
$env:APP_URL = 'http://127.0.0.1:38913'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc103a-20261017/media'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc103a'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:EMAIL_MODE = 'disabled'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_03A_DISPOSABLE = 'yes'
switch ($Action) {
  'migrate' { npm.cmd run test:migrations:fresh }
  'types' { npm.cmd run generate:types }
  'dev' { npx.cmd next dev --webpack --hostname 127.0.0.1 --port 38913 }
  'verify' { npx.cmd tsx tests/rc1-03a/verify-hierarchy.ts }
  'restart' { npx.cmd tsx tests/rc1-03a/verify-hierarchy.ts --restart }
  'browser' { npx.cmd tsx tests/rc1-03a/browser-public.ts }
  'controls' { npx.cmd tsx tests/rc1-03a/verify-hierarchy.ts --controls }
}
exit $LASTEXITCODE
