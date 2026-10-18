param([ValidateSet('migrate', 'adversarial', 'profiles', 'restart-check', 'types')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$env:DATABASE_URL = 'postgresql://rc102d:rc102d-disposable@127.0.0.1:5434/rc102d_release_acceptance'
$env:PAYLOAD_SECRET = 'rc102d-disposable-secret-for-local-verification-only-20261017'
$env:APP_URL = 'https://admin.rc102d.test:38905'
$env:PROXY_MODE = 'trusted'
$env:EMAIL_MODE = 'disabled'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc102d-20261017/media'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc102d'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_02D_DISPOSABLE = 'yes'

switch ($Action) {
  'migrate' { npm.cmd run test:migrations:fresh }
  'adversarial' { npx.cmd tsx tests/rc1-02d/verify-adversarial-matrix.ts }
  'profiles' {
    $env:RENEGADE_MODULES = ''
    npx.cmd tsx tests/rc1-02d/verify-profiles.ts --lean
    $env:RENEGADE_MODULES = 'all'
    npx.cmd tsx tests/rc1-02d/verify-profiles.ts --all
  }
  'restart-check' { npx.cmd tsx tests/rc1-02d/verify-adversarial-matrix.ts --restart-check }
  'types' { npm.cmd run generate:types }
}
exit $LASTEXITCODE
