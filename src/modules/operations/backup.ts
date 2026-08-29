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
  const manifest: OperationalBackupManifest = {
    ...input,
    format: OPERATIONAL_BACKUP_FORMAT,
    version: OPERATIONAL_BACKUP_VERSION,
    files,
    totals: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) },
    exclusions: [
      'environment variables and .env files',
      'database passwords',
      'Payload secrets',
      'provider credentials',
      'archive encryption keys',
      'rebuildable backup diagnostic status',
    ],
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

export async function directoryIsEmpty(directory: string) {
  try {
    return (await readdir(directory)).length === 0
  } catch {
    return true
  }
}
