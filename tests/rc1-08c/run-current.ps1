param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start-db', 'migrate', 'verify', 'types', 'generate-types', 'unit', 'lint', 'restart-check')]
  [string]$Action
)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$containerName = 'rc108c-current-20261020'
$dbName = 'rc108c_accepted_release_acceptance'
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5466/rc108c_accepted_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc108c-current-disposable-process-only-test-secret-20261020'
$env:APP_URL = 'http://localhost:39036'
$env:EMAIL_MODE = 'disabled'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc108c-current-20261020/media'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc108c-current-20261020'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_08C_CURRENT_DISPOSABLE = 'yes'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:SOCIAL_LOCAL_ADAPTER_ORIGINS = 'http://127.0.0.1:3132'
$env:SOCIAL_LOCAL_ADAPTER_TIMEOUT_MS = '4000'
$env:WORKER_POLL_INTERVAL_MS = '1000'
$env:WORKER_HEARTBEAT_FILE = Join-Path (Get-Location) 'scratch/rc108c-current-20261020/heartbeat.json'
$env:NODE_ENV = 'development'
switch ($Action) {
  'start-db' {
    if (docker ps -a --filter "name=^${containerName}$" --format '{{.Names}}') { throw 'Disposable target already exists; inspect it before any reuse.' }
    docker run -d --name $containerName -l renegade.acceptance=rc108c-current-20261020 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=$dbName -p '127.0.0.1:5466:5432' postgres:17.6
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    for ($i=0; $i -lt 30; $i++) {
      docker exec $containerName pg_isready -U postgres | Out-Null
      if ($LASTEXITCODE -eq 0) { exit 0 }
      Start-Sleep -Seconds 1
    }
    throw 'Disposable database did not become ready.'
  }
  'migrate' {
    $owned = (docker inspect $containerName | ConvertFrom-Json)[0]
    if ($owned.Config.Labels.'renegade.acceptance' -ne 'rc108c-current-20261020') { throw 'Database is not owned by this test.' }
    $tables = docker exec $containerName psql -U postgres -d $dbName -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
    if ($LASTEXITCODE -ne 0 -or $tables.Trim() -ne '0') { throw 'Fresh migration requires the owned target to be empty.' }
    npm.cmd run test:migrations:fresh
  }
  'verify' { node ./node_modules/tsx/dist/cli.mjs tests/rc1-08c/verify-current.ts }
  'restart-check' {
    $owned = (docker inspect $containerName | ConvertFrom-Json)[0]
    if ($owned.Config.Labels.'renegade.acceptance' -ne 'rc108c-current-20261020') { throw 'Refusing to restart an unowned target.' }
    docker restart $owned.Id
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    for ($i=0; $i -lt 30; $i++) {
      docker exec $owned.Id pg_isready -U postgres | Out-Null
      if ($LASTEXITCODE -eq 0) { break }
      Start-Sleep -Seconds 1
    }
    if ($LASTEXITCODE -ne 0) { throw 'Disposable database restart failed.' }
    node ./node_modules/tsx/dist/cli.mjs tests/rc1-08c/verify-current.ts --restart
  }
  'types' { node ./node_modules/typescript/bin/tsc --noEmit -p tests/rc1-08c/tsconfig.current.json }
  'generate-types' { npm.cmd run generate:types }
  'unit' { $env:NODE_ENV='test'; npx.cmd vitest run tests/unit/rc1-08c-current.test.ts tests/unit/rc1-08c-social-dispatch.test.ts tests/unit/social-contracts.test.ts }
  'lint' { npx.cmd eslint src/modules/social/tasks.ts src/modules/social/dispatch-boundary.ts src/modules/social/adapters/bluesky.ts src/modules/social/adapters/mastodon.ts src/modules/social/contracts.ts src/collections/Social.ts src/scripts/run-jobs-worker.ts 'src/app/(frontend)/api/admin/social/worker/route.ts' 'src/app/(frontend)/api/admin/social/drafts/route.ts' src/modules/admin/SocialCommandCenter.tsx tests/rc1-08c/verify-current.ts tests/unit/rc1-08c-current.test.ts --max-warnings=0 }
}
exit $LASTEXITCODE
