param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start-db', 'migrate', 'verify', 'restart-check', 'serve', 'types', 'lint', 'unit', 'generate-types', 'worker', 'serve-core', 'verify-core')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")

$containerName = 'rc106b-20261018'
$pgPort = '5447'
$dbName = 'rc106b_release_acceptance'
$dbUri = "postgresql://postgres:postgres@127.0.0.1:$pgPort/$dbName"

$env:DATABASE_URL = $dbUri
$env:DATABASE_URI = $dbUri
$env:PAYLOAD_SECRET = 'rc106b-disposable-secret-for-local-verification-only-20261018'
$env:APP_URL = 'http://localhost:38981'
$env:EMAIL_MODE = 'development'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc106b-20261018/media'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc106b'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_06B_DISPOSABLE = 'yes'

switch ($Action) {
  'generate-types' {
    npm.cmd run generate:types
  }
  'start-db' {
    $existing = docker ps -a --filter "name=^${containerName}$" --format '{{.Names}}'
    if ($existing -eq $containerName) {
      Write-Host "Container $containerName exists. Starting..."
      docker start $containerName
    } else {
      Write-Host "Creating disposable PostgreSQL container $containerName on port $pgPort..."
      docker run -d --name $containerName -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=$dbName -p "127.0.0.1:${pgPort}:5432" postgres:17.6
    }
    Write-Host "Waiting for database readiness..."
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
      try {
        $res = docker exec $containerName pg_isready -U postgres
        if ($res -like "*accepting connections*") {
          $ready = $true
          break
        }
      } catch {}
      Start-Sleep -Seconds 1
    }
    if (-not $ready) {
      throw "Database in $containerName failed to become ready."
    }
    Write-Host "PostgreSQL is ready on port $pgPort."
  }

  'migrate' {
    Write-Host "Running fresh migrations on $dbUri..."
    npm.cmd run test:migrations:fresh
  }

  'verify' {
    Write-Host "Executing 06B metadata, schema, and indexing controls verification..."
    node ./node_modules/tsx/dist/cli.mjs tests/rc1-06b/verify.ts
  }

  'restart-check' {
    Write-Host "Restarting container $containerName..."
    docker restart $containerName
    Start-Sleep -Seconds 3
    for ($i = 0; $i -lt 30; $i++) {
      try {
        $res = docker exec $containerName pg_isready -U postgres
        if ($res -like "*accepting connections*") { break }
      } catch {}
      Start-Sleep -Seconds 1
    }
    Write-Host "Verifying state persistence after restart..."
    node ./node_modules/tsx/dist/cli.mjs tests/rc1-06b/verify.ts --restart
  }

  'serve-core' {
    $env:RENEGADE_MODULES = ''
    node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 38981
  }
  'verify-core' { node ./node_modules/tsx/dist/cli.mjs tests/rc1-06b/verify.ts --core }
  'serve' {
    node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 38981
  }

  'types' {
    node ./node_modules/typescript/bin/tsc --noEmit -p tests/rc1-06b/tsconfig.json
  }

  'lint' { node ./node_modules/eslint/bin/eslint.js src/collections/Publishing.ts src/modules/public/public-modified.ts src/migrations/20261018_062000_rc1_public_modified.ts src/migrations/index.ts src/modules/public/HierarchyView.tsx src/modules/public/hierarchy.ts src/modules/public/archive-pagination.tsx src/modules/public/content-archives.tsx src/modules/public/crawler.ts src/modules/public/discovery.ts src/app/robots.ts "src/app/(frontend)/browse/page.tsx" "src/app/(frontend)/sitemaps/[page]/route.ts" "src/app/(frontend)/articles/page.tsx" "src/app/(frontend)/[...path]/page.tsx" "src/app/(frontend)/feed.xml/route.ts" "src/app/(frontend)/feed.json/route.ts" "src/app/(frontend)/feeds/[scope]/[slug]/route.ts" "src/app/(frontend)/events/feed.ics/route.ts" tests/rc1-06b/verify.ts tests/unit/rc1-06b-discovery.test.tsx tests/unit/content-archives.test.tsx }
  'unit' { node ./node_modules/vitest/vitest.mjs run tests/unit/rc1-06b-discovery.test.tsx tests/unit/content-archives.test.tsx tests/unit/disc-03-crawler-infrastructure.test.ts tests/unit/rc1-06a-metadata-schema-indexing.test.ts tests/unit/discovery-contracts.test.ts }
  'worker' {
    $env:WORKER_POLL_INTERVAL_MS = '1000'
    $env:WORKER_HEARTBEAT_FILE = Join-Path (Get-Location) 'scratch/rc106b-20261018/heartbeat.json'
    node ./node_modules/tsx/dist/cli.mjs src/scripts/run-jobs-worker.ts
  }
}

exit $LASTEXITCODE
