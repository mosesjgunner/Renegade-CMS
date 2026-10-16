param(
  [Parameter(Mandatory = $true)][string]$Repository,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$CandidateSha
)

$ErrorActionPreference = 'Stop'
$rcRepository = (Resolve-Path -LiteralPath $Repository).Path
$rcChecks = @()
function Read-RcGit {
  param([string[]]$GitArguments)
  $rcText = @(& git -C $rcRepository @GitArguments 2>&1 | ForEach-Object { "$_" })
  $rcCode = $LASTEXITCODE
  return [pscustomobject]@{command = @('git', '-C', $rcRepository) + $GitArguments; exitCode = $rcCode; output = $rcText}
}

$rcHead = Read-RcGit @('rev-parse', 'HEAD')
$rcTree = Read-RcGit @('rev-parse', 'HEAD^{tree}')
$rcStatus = Read-RcGit @('status', '--porcelain=v1', '--untracked-files=all')
$rcChecks += $rcHead, $rcTree, $rcStatus
$rcReasons = @()
if ($rcHead.exitCode -ne 0 -or $rcHead.output[0] -ne $CandidateSha) { $rcReasons += 'Checkout HEAD differs from supplied candidate SHA' }
if ($rcStatus.exitCode -ne 0 -or $rcStatus.output.Count -ne 0) { $rcReasons += 'Checkout is not clean' }

$rcReceipts = @()
foreach ($rcStage in 1..6) {
  $rcRelative = 'docs/rc/evidence/rc1/stage-{0:d2}/sol/HANDOFF.md' -f $rcStage
  $rcPath = Join-Path $rcRepository $rcRelative
  if (-not (Test-Path -LiteralPath $rcPath -PathType Leaf)) {
    $rcReasons += "Missing Sol Stage $rcStage handoff"
    $rcReceipts += [pscustomobject]@{stage = $rcStage; path = $rcRelative; status = 'MISSING'}
    continue
  }
  $rcText = [System.IO.File]::ReadAllText($rcPath)
  $rcFirstVerdict = [regex]::Match($rcText, 'STAGE 0[1-6] (?:SOL PASS|BLOCKED)')
  $rcExpected = 'STAGE {0:d2} SOL PASS' -f $rcStage
  if (-not $rcFirstVerdict.Success -or $rcFirstVerdict.Value -ne $rcExpected) { $rcReasons += "Sol Stage $rcStage does not have a leading PASS verdict" }
  $rcReceipts += [pscustomobject]@{stage = $rcStage; path = $rcRelative; status = $rcFirstVerdict.Value; sha256 = (Get-FileHash -LiteralPath $rcPath -Algorithm SHA256).Hash.ToLowerInvariant()}
}

$rcSources = @(
  'f487dcb67f0649ffc1ecd09b9a47cc845d705f61',
  'd311396876fabc104826e4375d26feef0b5e2b39',
  'b5369e78faa228d7e0b4375d9a3147b164363b2c',
  'f0a728c03d45c284813e2e7c5ea23167394800de',
  '3f464a6903ff26e7489179df29749f065cb55299',
  '51fa1c2310519ae478905e365befe6114c5ddcc1',
  '45713b95d8b0ad28a15c017c10425fbde8cf3532'
)
foreach ($rcSource in $rcSources) {
  $rcAncestor = Read-RcGit @('merge-base', '--is-ancestor', $rcSource, $CandidateSha)
  $rcChecks += $rcAncestor
  if ($rcAncestor.exitCode -ne 0) { $rcReasons += "Required source is not an ancestor: $rcSource" }
}

$rcIgnored = @('.env', '.env.production', '.env.restore', 'media', 'node_modules', '.next') | Where-Object { Test-Path -LiteralPath (Join-Path $rcRepository $_) }
if ($rcIgnored.Count -gt 0) { $rcReasons += 'Prepared checkout contains environment/runtime/dependency paths; inspect before fresh acceptance' }

[ordered]@{
  kind = 'read-only handoff prerequisite check; not release acceptance'
  scriptSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
  candidateSha = $CandidateSha
  readyToStart = ($rcReasons.Count -eq 0)
  acceptancePass = $false
  reasons = $rcReasons
  receipts = $rcReceipts
  commands = $rcChecks
  environmentFilesRead = $false
  runtimeStarted = $false
  limitation = 'Leading signatures and ancestry are necessary only. Raw execution receipts, dirty Stage 01 manifest, impacted workflows and image binding still require independent review.'
} | ConvertTo-Json -Depth 8
if ($rcReasons.Count -gt 0) { exit 1 }
exit 0
