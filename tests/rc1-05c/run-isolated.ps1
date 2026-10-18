param([Parameter(Mandatory=$true)][ValidateSet('start-db','migrate','verify','restart-check','serve','types','export','restore-migrate','restore','response')][string]$Action)
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5445/rc105c_release_acceptance'
$env:DATABASE_URI=$env:DATABASE_URL
$env:PAYLOAD_SECRET='rc105c-disposable-secret-for-local-verification-only-20261018'
$env:APP_URL='http://localhost:38970'
$env:EMAIL_MODE='development'
$env:MEDIA_DIR=Join-Path (Get-Location) 'scratch/rc105c-20261018/media'
$env:RENEGADE_NEXT_DIST_DIR='.next-rc105c'
$env:RENEGADE_MODULES='all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT='true'
$env:LOCAL_E2E_TEST_MODE='false'
$env:ENABLE_TEST_ROUTES='false'
$env:SEED_ON_INIT='false'
$env:DISABLE_PAYLOAD_HMR='true'
$env:RC1_05C_DISPOSABLE='yes'
if ($Action -in @('restore-migrate','restore')) {
 $env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5445/rc105c_restore_release_acceptance'
 $env:DATABASE_URI=$env:DATABASE_URL
 $env:MEDIA_DIR=Join-Path (Get-Location) 'scratch/rc105c-20261018/restored-media'
}
switch ($Action) {
 'start-db' {
  if (docker ps -a --filter 'name=^rc105c-20261018$' --format '{{.Names}}') { throw 'Disposable name exists; inspect instead of reusing.' }
  docker run -d --name rc105c-20261018 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rc105c_release_acceptance -p 127.0.0.1:5445:5432 postgres:17.6
 }
 'migrate' { npm.cmd run test:migrations:fresh }
 'verify' { npx.cmd tsx tests/rc1-05c/verify.ts }
 'restart-check' { npx.cmd tsx tests/rc1-05c/verify.ts --restart }
 'serve' { npx.cmd next dev --hostname 127.0.0.1 --port 38970 }
 'export' { npx.cmd tsx tests/rc1-05c/portability.ts }
 'response' { npx.cmd tsx tests/rc1-05c/verify-response.ts }
 'restore-migrate' {
  docker exec rc105c-20261018 createdb -U postgres rc105c_restore_release_acceptance
  if ($LASTEXITCODE -ne 0) { throw 'Restore database exists or unavailable; refusing migration.' }
  npm.cmd run test:migrations:fresh
 }
 'restore' { npx.cmd tsx tests/rc1-05c/portability.ts --restore }
 'types' { npx.cmd tsc --noEmit -p tests/rc1-05c/tsconfig.json }
}
exit $LASTEXITCODE


