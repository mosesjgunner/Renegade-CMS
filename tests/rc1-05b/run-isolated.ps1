param([Parameter(Mandatory=$true)][ValidateSet('start-db','migrate','verify','restart-check','serve','types','studio','studio-restart')][string]$Action)
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5444/rc105b_release_acceptance'
$env:DATABASE_URI=$env:DATABASE_URL
$env:PAYLOAD_SECRET='rc105b-disposable-secret-for-local-verification-only-20261018'
$env:APP_URL='http://localhost:38960'
$env:EMAIL_MODE='development'
$env:MEDIA_DIR=Join-Path (Get-Location) 'scratch/rc105b-20261018/media'
$env:RENEGADE_NEXT_DIST_DIR='.next-rc105b'
$env:RENEGADE_MODULES='all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT='true'
$env:LOCAL_E2E_TEST_MODE='false'
$env:ENABLE_TEST_ROUTES='false'
$env:SEED_ON_INIT='false'
$env:DISABLE_PAYLOAD_HMR='true'
$env:RC1_05B_DISPOSABLE='yes'
$env:FFMPEG_PATH=Join-Path (Get-Location) 'scratch/rc105b-20261018/tools/ffmpeg/package/ffmpeg.exe'
$env:FFPROBE_PATH=Join-Path (Get-Location) 'scratch/rc105b-20261018/tools/ffprobe/package/ffprobe.exe'
switch ($Action) {
 'start-db' {
  if (docker ps -a --filter 'name=^rc105b-20261018$' --format '{{.Names}}') { throw 'Disposable name exists; inspect instead of reusing.' }
  docker run -d --name rc105b-20261018 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rc105b_release_acceptance -p 127.0.0.1:5444:5432 postgres:17.6
 }
 'migrate' { npm.cmd run test:migrations:fresh }
 'verify' { npx.cmd tsx tests/rc1-05b/verify.ts }
 'restart-check' { npx.cmd tsx tests/rc1-05b/verify.ts --restart }
 'serve' { npx.cmd next dev --hostname 127.0.0.1 --port 38960 }
 'studio' { npx.cmd tsx tests/rc1-05b/verify-studio.ts }
 'studio-restart' { npx.cmd tsx tests/rc1-05b/verify-studio.ts --restart }
 'types' { npx.cmd tsc --noEmit -p tests/rc1-05b/tsconfig.json }
}
exit $LASTEXITCODE

