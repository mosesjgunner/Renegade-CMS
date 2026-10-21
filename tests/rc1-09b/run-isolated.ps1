param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start-db', 'migrate', 'verify', 'restart-check', 'serve', 'types', 'unit', 'lint', 'stop-db')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")

$containerName = 'rc109b-20261020'
$pgPort = '5450'
$dbName = 'rc109b_release_acceptance'
$dbUri = "postgresql://postgres:postgres@127.0.0.1:$pgPort/$dbName"

$env:DATABASE_URL = $dbUri
$env:DATABASE_URI = $dbUri
$env:PAYLOAD_SECRET = 'rc109b-disposable-secret-for-local-verification-only-20261020'
$env:APP_URL = 'http://localhost:38998'
$env:EMAIL_MODE = 'development'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc109b-20261020/media'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc109b'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_09B_DISPOSABLE = 'yes'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

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
    Write-Host "Executing 09B Campaigns, Templates and Recipient Selection Acceptance..."
    node ./node_modules/tsx/dist/cli.mjs tests/rc1-09b/verify.ts
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
    node ./node_modules/tsx/dist/cli.mjs tests/rc1-09b/verify.ts --restart
  }

  'serve' {
    node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 38998
  }

  'types' {
    node ./node_modules/typescript/bin/tsc --noEmit -p tests/rc1-09b/tsconfig.json
  }

  'unit' {
    npx.cmd vitest run tests/unit/rc1-09b-campaigns-templates.test.ts
  }

  'lint' {
    npx.cmd eslint "src/modules/audience/**/*.ts" "src/app/(frontend)/api/admin/audience/**/*.ts" "src/modules/admin/EmailComposer.tsx" tests/rc1-09b/verify.ts tests/unit/rc1-09b-campaigns-templates.test.ts
  }

  'stop-db' {
    Write-Host "Stopping and removing container $containerName..."
    docker stop $containerName
    docker rm $containerName
    Write-Host "Cleaned up $containerName."
  }
}
