param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start-db', 'migrate', 'verify', 'restart-check', 'serve', 'types')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")

$containerName = 'rc107a-20261018'
$pgPort = '5449'
$dbName = 'rc107a_release_acceptance'
$dbUri = "postgresql://postgres:postgres@127.0.0.1:$pgPort/$dbName"

$env:DATABASE_URL = $dbUri
$env:DATABASE_URI = $dbUri
$env:PAYLOAD_SECRET = 'rc107a-disposable-secret-for-local-verification-only-20261018'
$env:APP_URL = 'http://localhost:38983'
$env:EMAIL_MODE = 'development'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc107a-20261018/media'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc107a'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_07A_DISPOSABLE = 'yes'

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
    Write-Host "Executing 07A editorial review and lock acceptance..."
    node ./node_modules/tsx/dist/cli.mjs tests/rc1-07a/verify.ts
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
    node ./node_modules/tsx/dist/cli.mjs tests/rc1-07a/verify.ts --restart
  }

  'serve' {
    node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 38983
  }

  'types' {
    node ./node_modules/typescript/bin/tsc --noEmit -p tests/rc1-07a/tsconfig.json
  }

}
exit $LASTEXITCODE
