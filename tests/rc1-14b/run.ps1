param([ValidateSet('migrate','journey','restart','product','product-restart')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc114b-20261101 | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $target[0].Config.Labels.'rc1.scope' -ne '14b' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc114b_release_acceptance') { throw 'Disposable containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5472/rc114b_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc114b-disposable-only-0123456789abcdef0123456789abcdef'
$env:AI_CREDENTIAL_KEY_BASE64URL = [Convert]::ToBase64String([byte[]](1..32)).TrimEnd('=').Replace('+','-').Replace('/','_')
$env:APP_URL = 'http://localhost:39047'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc114b/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:NODE_ENV = 'test'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc114b'
$env:NODE_OPTIONS = '--no-deprecation --max-old-space-size=4096'
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
node --import tsx tests/rc1-14b/journey.ts $Action
exit $LASTEXITCODE
