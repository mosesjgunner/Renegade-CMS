param([ValidateSet('migrate', 'operator', 'dev', 'browser', 'restart-check', 'inventory', 'controls', 'upgrade', 'types', 'comments', 'comments-restart', 'build', 'start', 'proxy')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$env:DATABASE_URL = 'postgresql://rc102c:rc102c-disposable@127.0.0.1:5433/rc102c_release_acceptance'
$env:PAYLOAD_SECRET = 'rc102c-disposable-secret-for-local-verification-only-20261017'
$env:APP_URL = 'https://admin.rc102c.test:38903'
$env:PROXY_MODE = 'trusted'
$env:EMAIL_MODE = 'disabled'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc102c-20261017/media'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc102c'
if ($Action -in @('build', 'start')) { $env:RENEGADE_NEXT_DIST_DIR = '.next-rc102c-prod' }
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_02C_DISPOSABLE = 'yes'
switch ($Action) {
  'migrate' { npm.cmd run test:migrations:fresh }
  'operator' { npx.cmd tsx tests/rc1-02c/verify-redirects.ts }
  'dev' { npx.cmd next dev --turbopack --hostname 127.0.0.1 --port 38903 }
  'browser' { npx.cmd tsx tests/rc1-02c/browser-02c.ts }
  'restart-check' { npx.cmd tsx tests/rc1-02c/verify-redirects.ts --restart-check }
  'inventory' { npx.cmd tsx tests/rc1-02c/inventory.ts }
  'controls' { npx.cmd tsx tests/rc1-02c/verify-controls.ts }
  'upgrade' { npm.cmd run db:migrate -- --skip-confirmation }
  'types' { npm.cmd run generate:types }
  'comments' { npx.cmd tsx tests/rc1-02c/verify-comments.ts }
  'comments-restart' { npx.cmd tsx tests/rc1-02c/verify-comments.ts --restart-check }
  'build' { npm.cmd run build }
  'start' { $env:PORT = '38904'; $env:HOSTNAME = '127.0.0.1'; node .next-rc102c-prod/standalone/server.js }
  'proxy' { node tests/rc1-02c/tls-proxy.mjs }
}
exit $LASTEXITCODE
