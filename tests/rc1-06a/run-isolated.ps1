param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start-db', 'migrate', 'verify', 'restart-check', 'serve', 'types', 'lint', 'unit')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")

$containerName = 'rc106a-20261018'
$pgPort = '5446'
$dbName = 'rc106a_release_acceptance'
$dbUri = "postgresql://postgres:postgres@127.0.0.1:$pgPort/$dbName"

$env:DATABASE_URL = $dbUri
$env:DATABASE_URI = $dbUri
$env:PAYLOAD_SECRET = 'rc106a-disposable-secret-for-local-verification-only-20261018'
$env:APP_URL = 'http://localhost:38980'
$env:EMAIL_MODE = 'development'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc106a-20261018/media'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc106a'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_06A_DISPOSABLE = 'yes'

switch ($Action) {
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
    Write-Host "Executing 06A metadata, schema, and indexing controls verification..."
    node ./node_modules/tsx/dist/cli.mjs tests/rc1-06a/verify.ts
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
    node ./node_modules/tsx/dist/cli.mjs tests/rc1-06a/verify.ts --restart
  }

  'serve' {
    node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 38980
  }

  'types' {
    node ./node_modules/typescript/bin/tsc --noEmit -p tests/rc1-06a/tsconfig.json
  }

  'lint' {
    node ./node_modules/eslint/bin/eslint.js src/globals/SiteSettings.ts src/modules/core/site-settings.ts src/collections/Publishing.ts src/collections/PageLayouts.ts src/modules/editorial/publishing-pass.ts src/modules/public/discovery.ts "src/app/(frontend)/[...path]/page.tsx" "src/app/(frontend)/login/layout.tsx" "src/app/(frontend)/enroll/layout.tsx" "src/app/(frontend)/members/settings/layout.tsx" "src/app/(frontend)/member-auth/layout.tsx" "src/app/(frontend)/messages/layout.tsx" "src/app/(frontend)/notifications/layout.tsx" "src/app/(frontend)/preferences/layout.tsx" next.config.ts src/migrations/20261018_060000_rc1_taxonomy_layout_seo_fields.ts tests/unit/rc1-06a-metadata-schema-indexing.test.ts tests/rc1-06a/verify.ts
  }

  'unit' {
    node ./node_modules/vitest/vitest.mjs run tests/unit/rc1-06a-metadata-schema-indexing.test.ts tests/unit/disc-00-discovery-contract.test.ts tests/unit/disc-01-publisher-workflow.test.ts tests/unit/disc-02-schema-graph.test.ts tests/unit/disc-05-rendered-audit.test.ts tests/unit/rich-editor-draft-preview.test.tsx
  }
}
exit $LASTEXITCODE
