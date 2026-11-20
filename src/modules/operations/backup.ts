import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

/** This is deliberately separate from the portable-content interchange format. */
export const OPERATIONAL_BACKUP_FORMAT = 'renegade-operational-backup'
export const OPERATIONAL_BACKUP_VERSION = 1
export const OPERATIONAL_BACKUP_COMPONENTS = ['database.dump', 'media.tar.gz'] as const

export type BackupFile = {
  path: (typeof OPERATIONAL_BACKUP_COMPONENTS)[number]
  sha256: string
  bytes: number
}

/**
 * UXI-11 — where a backup actually lives, recorded explicitly at creation
 * time. Never inferred from a path string: a path that merely *looks*
 * remote proves nothing about which disk holds the bytes.
 * - `local-disk`: the destination is on the same disk/volume as the live
 *   data (the engine's only built-in destination today).
 * - `operator-configured-remote`: the operator configured a remote
 *   destination (their own sync/replication of the backup directory) and
 *   named its type.
 * - `unknown`: legacy records created before this field existed — treated
 *   as same-disk everywhere a label is shown.
 */
export type BackupDestinationKind = 'local-disk' | 'operator-configured-remote' | 'unknown'
export type BackupDestination = {
  kind: BackupDestinationKind
  /** Destination type for off-host backups, e.g. "S3 bucket", "second server (rsync)". */
  remoteType?: string
}

/** Per-component coverage, as the engine actually records it. */
export type BackupCoverage = {
  database: boolean
  media: boolean
  /** Backups carry non-secret installation metadata only — never the full config/secrets. */
  configuration: 'non-secret-only' | 'none'
  /** Archive encryption keys are deliberately excluded from every backup. */
  encryptionKeys: boolean
  versionMetadata: boolean
}

export const SAME_DISK_BACKUP_LABEL = 'same-disk snapshot — not an off-host backup'

export function normalizeBackupDestinationKind(value: unknown): BackupDestinationKind {
  return value === 'local-disk' || value === 'operator-configured-remote' ? value : 'unknown'
}

/**
 * The label shown wherever a backup's status appears. `local-disk` and
 * `unknown` both get the same-disk warning; only an explicitly recorded
 * remote destination is ever called off-host, and it is labelled with its
 * destination type.
 */
export function backupDestinationLabel(destination: BackupDestination | null | undefined): string {
  if (destination?.kind === 'operator-configured-remote') {
    const type = destination.remoteType?.trim()
    return type ? `off-host backup — ${type}` : 'off-host backup — operator-configured remote'
  }
  return SAME_DISK_BACKUP_LABEL
}

/** Derive the truthful coverage record from what a manifest actually contains. */
export function deriveBackupCoverage(input: {
  files?: readonly { path: string }[]
  includedComponents?: readonly string[]
  exclusions?: readonly string[]
  renegade?: { version?: string }
}): BackupCoverage {
  const included = input.includedComponents ?? []
  const files = (input.files ?? []).map((file) => file.path)
  return {
    database: files.includes('database.dump') || included.includes('postgresql-data'),
    media: files.includes('media.tar.gz') || included.includes('media-and-local-generated-assets'),
    configuration: included.includes('non-secret-installation-metadata')
      ? 'non-secret-only'
      : 'none',
    encryptionKeys: !(input.exclusions ?? []).some((entry) => /encryption key/i.test(entry)),
    versionMetadata: Boolean(input.renegade?.version),
  }
}
export type OperationalBackupManifest = {
  format: typeof OPERATIONAL_BACKUP_FORMAT
  version: typeof OPERATIONAL_BACKUP_VERSION
  createdAt: string
  renegade: { version: string; buildSha: string | null }
  postgresql: { version: string }
  consistency: { mode: 'maintenance-window'; confirmedAt: string }
  includedComponents: readonly [
    'postgresql-data',
    'media-and-local-generated-assets',
    'db-extension-and-capability-state',
    'non-secret-installation-metadata',
  ]
  files: BackupFile[]
  totals: { files: number; bytes: number }
  /** UXI-11 (additive): recorded at creation; absent on legacy manifests. */
  destination?: BackupDestination
  /** UXI-11 (additive): derived from the components actually captured. */
  coverage?: BackupCoverage
  migrationState: string[]
  installation: { storageDriver: 'local'; mediaDir: string; imageTag: string | null }
  exclusions: readonly string[]
}

const digest = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const secretKey = /(secret|password|credential|token|private.?key|api.?key|database.?url)/i
const operationalMetadataIsSafe = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.every(operationalMetadataIsSafe)
  if (!value || typeof value !== 'object') return true
  return Object.entries(value as Record<string, unknown>).every(
    ([key, nested]) => !secretKey.test(key) && operationalMetadataIsSafe(nested),
  )
}
function assertManifestShape(manifest: OperationalBackupManifest) {
  if (!operationalMetadataIsSafe(manifest))
    throw new Error('Operational backup manifest must not contain secret material.')
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length !== OPERATIONAL_BACKUP_COMPONENTS.length
  )
    throw new Error('Operational backup manifest is missing required components.')
  const listed = new Set(manifest.files.map((file) => file.path))
  if (
    listed.size !== OPERATIONAL_BACKUP_COMPONENTS.length ||
    OPERATIONAL_BACKUP_COMPONENTS.some((file) => !listed.has(file))
  )
    throw new Error('Operational backup manifest is missing required components.')
}
export async function describeBackupFile(
  root: string,
  relative: BackupFile['path'],
): Promise<BackupFile> {
  const target = path.join(root, relative)
  const [contents, info] = await Promise.all([readFile(target), stat(target)])
  if (!info.isFile()) throw new Error(`Backup component is not a file: ${relative}`)
  return { path: relative, sha256: digest(contents), bytes: info.size }
}

export async function createOperationalBackupManifest(
  root: string,
  input: Omit<OperationalBackupManifest, 'format' | 'version' | 'files' | 'totals' | 'exclusions'>,
): Promise<OperationalBackupManifest> {
  const files = await Promise.all(
    OPERATIONAL_BACKUP_COMPONENTS.map((file) => describeBackupFile(root, file)),
  )
  const exclusions = [
    'environment variables and .env files',
    'database passwords',
    'Payload secrets',
    'provider credentials',
    'archive encryption keys',
    'rebuildable backup diagnostic status',
  ] as const
  const manifest: OperationalBackupManifest = {
    ...input,
    format: OPERATIONAL_BACKUP_FORMAT,
    version: OPERATIONAL_BACKUP_VERSION,
    files,
    totals: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) },
    destination: input.destination ?? { kind: 'local-disk' },
    coverage:
      input.coverage ??
      deriveBackupCoverage({
        files,
        includedComponents: input.includedComponents,
        exclusions,
        renegade: input.renegade,
      }),
    exclusions,
  }
  assertManifestShape(manifest)
  return manifest
}

export async function readOperationalBackupManifest(
  root: string,
): Promise<OperationalBackupManifest> {
  const parsed = JSON.parse(
    await readFile(path.join(root, 'manifest.json'), 'utf8'),
  ) as OperationalBackupManifest
  if (parsed.format !== OPERATIONAL_BACKUP_FORMAT || parsed.version !== OPERATIONAL_BACKUP_VERSION)
    throw new Error('Unsupported operational backup format.')
  assertManifestShape(parsed)

  return parsed
}

export async function verifyOperationalBackup(root: string): Promise<OperationalBackupManifest> {
  const manifest = await readOperationalBackupManifest(root)
  const actual = await Promise.all(
    manifest.files.map((file) => describeBackupFile(root, file.path)),
  )
  for (const file of actual) {
    const expected = manifest.files.find((candidate) => candidate.path === file.path)
    if (!expected || expected.sha256 !== file.sha256 || expected.bytes !== file.bytes)
      throw new Error(`Operational backup checksum mismatch: ${file.path}`)
  }
  if (
    manifest.totals.files !== actual.length ||
    manifest.totals.bytes !== actual.reduce((sum, file) => sum + file.bytes, 0)
  )
    throw new Error('Operational backup manifest totals do not match components.')
  return manifest
}

export function assertRestoreSafety(options: {
  isolated: boolean
  authorized: boolean
  composeFile: string
}) {
  if (!options.isolated || !options.authorized)
    throw new Error('Restore requires --isolated and --authorize-restore.')
  if (!/restore/i.test(path.basename(options.composeFile)))
    throw new Error('Restore refuses a non-isolated Compose target.')
}

export async function backupStatusFromMedia(mediaDir: string) {
  try {
    const state = JSON.parse(
      await readFile(path.join(mediaDir, '.renegade', 'backup-status.json'), 'utf8'),
    ) as unknown
    return state
  } catch {
    return null
  }
}

/** Typed view of the `.renegade/backup-status.json` record the backup script writes. */
export type BackupStatusRecord = {
  status: 'healthy' | 'failed' | 'not_configured'
  lastSuccessfulAt: string | null
  lastFailureAt: string | null
  verified: boolean | null
  destination: BackupDestination
  destinationLabel: string
  coverage: BackupCoverage | null
}

const isoOrNull = (value: unknown) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null

export function parseBackupStatusRecord(raw: unknown): BackupStatusRecord {
  if (!raw || typeof raw !== 'object') {
    return {
      status: 'not_configured',
      lastSuccessfulAt: null,
      lastFailureAt: null,
      verified: null,
      destination: { kind: 'unknown' },
      destinationLabel: backupDestinationLabel({ kind: 'unknown' }),
      coverage: null,
    }
  }
  const record = raw as Record<string, unknown>
  const destination: BackupDestination = {
    kind: normalizeBackupDestinationKind(
      (record.destination as { kind?: unknown } | undefined)?.kind ?? record.destinationKind,
    ),
    ...(typeof (record.destination as { remoteType?: unknown } | undefined)?.remoteType === 'string'
      ? { remoteType: (record.destination as { remoteType: string }).remoteType }
      : typeof record.destinationRemoteType === 'string'
        ? { remoteType: record.destinationRemoteType }
        : {}),
  }
  const coverage =
    record.coverage && typeof record.coverage === 'object'
      ? (record.coverage as BackupCoverage)
      : null
  return {
    status:
      record.status === 'healthy' || record.status === 'failed' ? record.status : 'not_configured',
    lastSuccessfulAt: isoOrNull(record.lastSuccessfulAt),
    lastFailureAt: isoOrNull(record.lastFailureAt),
    verified: typeof record.verified === 'boolean' ? record.verified : null,
    destination,
    destinationLabel: backupDestinationLabel(destination),
    coverage,
  }
}

export type FixtureRestoreVerification = {
  targetRoot: string
  version: string
  buildSha: string | null
  migrationCount: number
  files: BackupFile[]
  totalBytes: number
  checksumsVerified: boolean
  coverage: BackupCoverage
  destinationLabel: string
}

/**
 * UXI-11 guided restore, step 1: restore a backup into a SEPARATE fixture
 * target and verify it there. This never touches live data — the target
 * must be a new/empty directory distinct from the source — and the
 * verification (component checksums, totals, version, migration list) is
 * what a later live restore is gated on. The live restore itself remains
 * the isolated CLI flow (`restore:operational`), which restores into an
 * isolated Compose stack and health-checks it.
 */
export async function restoreBackupToFixtureTarget(options: {
  sourceRoot: string
  targetRoot: string
}): Promise<FixtureRestoreVerification> {
  const sourceRoot = path.resolve(options.sourceRoot)
  const targetRoot = path.resolve(options.targetRoot)
  if (sourceRoot === targetRoot)
    throw new Error('Fixture restore target must be separate from the backup source.')
  // Verify the source before copying anything anywhere.
  const manifest = await verifyOperationalBackup(sourceRoot)
  if (!(await directoryIsEmpty(targetRoot)))
    throw new Error('Fixture restore target must be empty.')
  const { cp, mkdir } = await import('node:fs/promises')
  await mkdir(targetRoot, { recursive: true })
  await cp(path.join(sourceRoot, 'manifest.json'), path.join(targetRoot, 'manifest.json'))
  for (const file of manifest.files) {
    await cp(path.join(sourceRoot, file.path), path.join(targetRoot, file.path))
  }
  // Verify the restored copy on its own terms: checksums + totals must
  // match its manifest, and every digest must equal the source's.
  const restored = await verifyOperationalBackup(targetRoot)
  for (const file of restored.files) {
    const sourceFile = manifest.files.find((candidate) => candidate.path === file.path)
    if (!sourceFile || sourceFile.sha256 !== file.sha256)
      throw new Error(`Fixture restore verification mismatch: ${file.path}`)
  }
  return {
    targetRoot,
    version: restored.renegade.version,
    buildSha: restored.renegade.buildSha,
    migrationCount: restored.migrationState.length,
    files: restored.files,
    totalBytes: restored.totals.bytes,
    checksumsVerified: true,
    coverage:
      restored.coverage ??
      deriveBackupCoverage({
        files: restored.files,
        includedComponents: restored.includedComponents,
        exclusions: restored.exclusions,
        renegade: restored.renegade,
      }),
    destinationLabel: backupDestinationLabel(restored.destination ?? { kind: 'unknown' }),
  }
}

export async function directoryIsEmpty(directory: string) {
  try {
    return (await readdir(directory)).length === 0
  } catch {
    return true
  }
}
