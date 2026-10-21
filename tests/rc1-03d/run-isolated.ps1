param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start-db', 'migrate', 'verify', 'restart-check', 'types', 'serve', 'continue', 'negatives')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")

$containerName = 'rc103d-frozen-20261020'
$pgPort = '5465'
$dbName = 'rc103d_operator_release_acceptance'
$dbUri = "postgresql://postgres:postgres@127.0.0.1:$pgPort/$dbName"

$env:DATABASE_URL = $dbUri
$env:DATABASE_URI = $dbUri
$env:PAYLOAD_SECRET = 'rc103d-disposable-secret-for-local-verification-only-20261020'
$env:APP_URL = 'http://localhost:39035'
$env:PROXY_MODE = 'trusted'
$env:EMAIL_MODE = 'disabled'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc103d-frozen-20261020/media'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc103d-frozen-20261020'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_03D_DISPOSABLE = 'yes'

switch ($Action) {
  'start-db' {
    $existing = docker ps -a --filter "name=$containerName" --format '{{.Names}}'
    if ($existing -eq $containerName) {
      Write-Host "Container $containerName exists. Starting..."
      $label = ((docker inspect $containerName | ConvertFrom-Json)[0].Config.Labels.'renegade.acceptance')
      if ($label -ne 'rc103d-frozen-20261020') { throw 'Refusing to reuse an unowned container.' }
      docker start $containerName
    } else {
      Write-Host "Creating disposable PostgreSQL container $containerName on port $pgPort..."
      docker run -d --name $containerName -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=$dbName -l renegade.acceptance=rc103d-frozen-20261020 -p "127.0.0.1:${pgPort}:5432" postgres:17.6
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
    $label = ((docker inspect $containerName | ConvertFrom-Json)[0].Config.Labels.'renegade.acceptance')
    if ($label -ne 'rc103d-frozen-20261020') { throw 'Refusing to migrate an unowned container.' }
    $tableCount = docker exec $containerName psql -U postgres -d $dbName -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
    if ($LASTEXITCODE -ne 0 -or $tableCount.Trim() -ne '0') { throw 'Fresh migration requires this owned database to be empty.' }
    Write-Host 'Running fresh migrations in the empty, isolated 03D database.' 
    npm.cmd run test:migrations:fresh
  }

  'verify' {
    Write-Host "Executing 03D content import/export and end-to-end site build verification..."
    npx.cmd tsx tests/rc1-03d/verify-import-and-build.ts
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
    npx.cmd tsx tests/rc1-03d/verify-import-and-build.ts --restart
  }

  'continue' { npx.cmd tsx tests/rc1-03d/verify-import-and-build.ts --continue }
  'negatives' { npx.cmd tsx tests/rc1-03d/verify-negatives.ts }
  'serve' { node ./node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 39035 }

  'types' {
    npm.cmd run typecheck
  }
}
exit $LASTEXITCODE
