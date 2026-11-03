param([ValidateSet('migrate','journey','commit')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc117e-pub-20261103 | ConvertFrom-Json
if ($target[0].Config.Labels.'rc1.scope' -ne '17e-pub' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc117epub_release_acceptance') { throw 'Disposable target mismatch' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55418/rc117epub_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc117epub-disposable-secret-0123456789abcdef'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:APP_URL = 'http://localhost:39418'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc117epub/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:WORKER_POLL_INTERVAL_MS = '1000'
$env:WORKER_HEARTBEAT_FILE = Join-Path (Get-Location) 'scratch/rc117epub/heartbeat.json'
$env:RC117E_PUBLICATION = 'yes'
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
if ($Action -eq 'commit') { node --import tsx tests/rc1-17e/publication.ts commit-journey; exit $LASTEXITCODE }
node --import tsx tests/rc1-17e/publication.ts
exit $LASTEXITCODE
