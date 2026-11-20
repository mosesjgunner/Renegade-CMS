/**
 * UXI-11 — guided in-product health / backup / restore / update surfaces.
 *
 * Everything here sits ON the existing engines (diagnostics, backup,
 * lifecycle): this module translates their state into task language,
 * records the operator's backup-destination choice, evaluates update
 * pre-checks, and describes the support bundle's allowlist. It does not
 * reimplement any engine and it never shells out: executing a restore or
 * an upgrade stays with the isolated operator CLI flows, and these
 * surfaces end at a verified-ready state plus the one exact command.
 */

import { readFile, writeFile, mkdir, statfs } from 'node:fs/promises'
import path from 'node:path'
import { valid as validSemver, gt as semverGt } from 'semver'

import {
  backupDestinationLabel,
  parseBackupStatusRecord,
  type BackupDestination,
  type BackupStatusRecord,
} from './backup'
import type { OperationsDiagnostics } from './diagnostics'
import { assertRestoreVersionCompatibility } from './lifecycle'

// ---------------------------------------------------------------------------
// 1. Health in task terms
// ---------------------------------------------------------------------------

export type HealthItemState = 'healthy' | 'attention' | 'broken'

export type HealthItem = {
  id: string
  /** What is happening, in the operator's task language — never a raw engine code. */
  title: string
  state: HealthItemState
  /** What this means for the site's everyday work. */
  impact: string
  /** The repair or next action, in plain language. */
  nextAction: string
  /**
   * True when the operator dismissed this item but it is still broken or
   * needs attention. A dismissal hides a healthy tip; it never turns a
   * failure into a healthy render — the item stays visible with its real
   * state and this flag set.
   */
  dismissedButUnresolved: boolean
}

/**
 * Translate a diagnostics snapshot into task-language health items.
 * `dismissedIds` hides items whose state is `healthy` only; broken and
 * attention items always render, flagged when previously dismissed.
 */
export function translateDiagnosticsToHealthItems(
  diagnostics: OperationsDiagnostics,
  dismissedIds: readonly string[] = [],
): HealthItem[] {
  const dismissed = new Set(dismissedIds)
  const items: Omit<HealthItem, 'dismissedButUnresolved'>[] = []

  if (diagnostics.database.status !== 'healthy') {
    items.push({
      id: 'health.database',
      title: 'The site database is unreachable — the site cannot load or save anything',
      state: 'broken',
      impact: 'Visitors see errors and no one can publish, sign in, or check out.',
      nextAction: 'Start the database (docker compose up -d) and re-check this page.',
    })
  } else if (diagnostics.migrations.status === 'behind') {
    items.push({
      id: 'health.migrations',
      title: 'The site is behind on database updates — some features may fail or behave oddly',
      state: 'broken',
      impact: `${diagnostics.migrations.missing.length} update(s) have not been applied yet.`,
      nextAction: 'Run npm run db:migrate, then re-check this page.',
    })
  } else {
    items.push({
      id: 'health.database',
      title: 'Database and site updates are current',
      state: 'healthy',
      impact: 'The site can load and save normally.',
      nextAction: 'Nothing to do.',
    })
  }

  if (diagnostics.worker.status !== 'healthy') {
    items.push({
      id: 'health.worker',
      title: 'Scheduled tasks are paused — new posts will not publish on schedule',
      state: 'broken',
      impact:
        'Anything that runs in the background is stalled: scheduled posts, newsletters, media processing, and social posting.',
      nextAction: 'Restart the worker service (docker compose up -d) and re-check in a minute.',
    })
  } else if (diagnostics.jobs.failed > 0) {
    items.push({
      id: 'health.jobs',
      title: `${diagnostics.jobs.failed} background task(s) failed recently`,
      state: 'attention',
      impact:
        'The failed work did not complete — check whether a post, email, or upload is missing.',
      nextAction: 'Open the support bundle preview below and share it if you need help.',
    })
  } else {
    items.push({
      id: 'health.worker',
      title: 'Scheduled and background tasks are running',
      state: 'healthy',
      impact: 'Scheduled posts and background work will run on time.',
      nextAction: 'Nothing to do.',
    })
  }

  if (diagnostics.mediaStorage.status !== 'healthy') {
    items.push({
      id: 'health.media',
      title: 'Media storage is not writable — uploads will fail',
      state: 'broken',
      impact: 'New images, audio, and files cannot be saved.',
      nextAction: 'Give the application read/write access to the media folder and re-check.',
    })
  }

  if (diagnostics.backup.status === 'failed') {
    items.push({
      id: 'health.backup',
      title: 'The last backup failed — there may be no current safety copy',
      state: 'broken',
      impact: 'If something goes wrong now, recent work could be unrecoverable.',
      nextAction: 'Run a backup from the Backups section below and fix what it reports.',
    })
  } else if (diagnostics.backup.status === 'not_configured') {
    items.push({
      id: 'health.backup',
      title: 'No backup has been recorded yet',
      state: 'attention',
      impact: 'Without a backup, a disk failure or bad update loses the whole site.',
      nextAction: 'Set a backup destination below and run your first backup.',
    })
  } else {
    items.push({
      id: 'health.backup',
      title: 'Backups are running',
      state: 'healthy',
      impact: 'A recent safety copy exists (see its coverage and destination below).',
      nextAction: 'Nothing to do.',
    })
  }

  if (diagnostics.email.status === 'degraded') {
    items.push({
      id: 'health.email',
      title: 'Email delivery is degraded — sign-in links and newsletters may not arrive',
      state: 'attention',
      impact: 'Members may not receive magic links, receipts, or newsletters.',
      nextAction: 'Check the email provider settings in Admin Studio and send a test email.',
    })
  } else if (diagnostics.email.status === 'disabled') {
    items.push({
      id: 'health.email',
      title: 'Email is turned off — members cannot receive sign-in links',
      state: 'attention',
      impact: 'Passwordless sign-in depends on email; new members cannot sign in.',
      nextAction: 'Configure email in Admin Studio when you are ready for members.',
    })
  }

  for (const provider of diagnostics.providers.filter((item) => item.status === 'degraded')) {
    items.push({
      id: `health.provider.${provider.id}`,
      title: `A connected service needs attention: ${provider.label}`,
      state: 'attention',
      impact: 'Posting or payments through this connection may fail until it is reconnected.',
      nextAction: 'Reconnect this service in Admin Studio.',
    })
  }

  return items
    .map((item) => ({
      ...item,
      dismissedButUnresolved: dismissed.has(item.id) && item.state !== 'healthy',
    }))
    .filter((item) => !(dismissed.has(item.id) && item.state === 'healthy'))
}

// ---------------------------------------------------------------------------
// 2 + 3. Backup destination configuration (guided)
// ---------------------------------------------------------------------------

export type BackupDestinationConfig = {
  kind: 'local-disk' | 'operator-configured-remote'
  /** Local directory backups are written to (the engine's only built-in destination). */
  localPath: string
  /** Required when kind is remote: the destination type, e.g. "S3 bucket". */
  remoteType?: string
  updatedAt: string
}

const destinationFile = (mediaDir: string) =>
  path.join(mediaDir, '.renegade', 'backup-destination.json')

export function validateBackupDestinationConfig(input: {
  kind?: unknown
  localPath?: unknown
  remoteType?: unknown
}): { ok: true; value: Omit<BackupDestinationConfig, 'updatedAt'> } | { ok: false; error: string } {
  if (input.kind !== 'local-disk' && input.kind !== 'operator-configured-remote') {
    return {
      ok: false,
      error: 'Choose where backups go: this server, or an off-host destination you sync yourself.',
    }
  }
  const localPath = typeof input.localPath === 'string' ? input.localPath.trim() : ''
  if (!localPath || !path.isAbsolute(localPath)) {
    return {
      ok: false,
      error: 'Give the full folder path backups are written to, for example /srv/renegade-backups.',
    }
  }
  if (input.kind === 'operator-configured-remote') {
    const remoteType = typeof input.remoteType === 'string' ? input.remoteType.trim() : ''
    if (!remoteType) {
      return {
        ok: false,
        error:
          'Name the off-host destination type (for example "S3 bucket" or "second server (rsync)") so the label stays truthful.',
      }
    }
    return { ok: true, value: { kind: input.kind, localPath, remoteType } }
  }
  return { ok: true, value: { kind: input.kind, localPath } }
}

export async function loadBackupDestinationConfig(
  mediaDir: string,
): Promise<BackupDestinationConfig | null> {
  try {
    const parsed = JSON.parse(
      await readFile(destinationFile(mediaDir), 'utf8'),
    ) as BackupDestinationConfig
    const validated = validateBackupDestinationConfig(parsed)
    return validated.ok ? { ...validated.value, updatedAt: parsed.updatedAt ?? '' } : null
  } catch {
    return null
  }
}

export async function saveBackupDestinationConfig(
  mediaDir: string,
  value: Omit<BackupDestinationConfig, 'updatedAt'>,
): Promise<BackupDestinationConfig> {
  const config: BackupDestinationConfig = { ...value, updatedAt: new Date().toISOString() }
  await mkdir(path.dirname(destinationFile(mediaDir)), { recursive: true })
  await writeFile(destinationFile(mediaDir), `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  })
  return config
}

/** The destination the status labels should use: configured choice wins, else the status record's. */
export function effectiveBackupDestination(
  config: BackupDestinationConfig | null,
  status: BackupStatusRecord,
): BackupDestination {
  if (config) {
    return config.kind === 'operator-configured-remote'
      ? { kind: 'operator-configured-remote', remoteType: config.remoteType }
      : { kind: 'local-disk' }
  }
  return status.destination
}

export const KEY_CUSTODY_EXPLANATION =
  "Backups never contain your encryption keys, database passwords, or sign-in secrets — that is deliberate, so a stolen backup cannot unlock your site. The keys live only in the server's environment file (.env.production) and your password manager. If you lose the keys, a backup still restores your content and media, but encrypted credentials (connected services, provider tokens) cannot be recovered and must be reconnected. Keep a copy of .env.production somewhere separate from the server and separate from the backups."

export const OFF_HOST_EXPLANATION =
  'This app writes backups to a folder on this server. That protects against mistakes and bad updates, but not against losing the server or its disk. For a true off-host backup, point your own sync (rsync, rclone, your host\'s snapshot tool) at that folder, then choose "off-host destination" here and name the type — the status label only says "off-host" once you have told it where the copies actually go.'

// ---------------------------------------------------------------------------
// 4. Restore gating
// ---------------------------------------------------------------------------

export const LIVE_RESTORE_COMMAND =
  'npm run restore:operational -- --archive <backup-directory> --target-version <semver> --isolated --authorize-restore'

/** A live restore is offered only after a fixture restore verified. Pure gate. */
export function liveRestoreOffered(verification: { checksumsVerified: boolean } | null): boolean {
  return verification?.checksumsVerified === true
}

export function checkRestoreCompatibility(
  archiveVersion: string,
  targetVersion: string,
): string | null {
  try {
    assertRestoreVersionCompatibility({ archiveVersion, targetVersion })
    return null
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'This backup is not compatible with the target version.'
  }
}

// ---------------------------------------------------------------------------
// 5. Update preflight (surface ends at verified-ready + operator command)
// ---------------------------------------------------------------------------

export type UpdateCheck = {
  id: 'artifact' | 'backup' | 'disk'
  label: string
  status: 'pass' | 'fail'
  detail: string
  fix: string
}

export type UpdatePreflight = {
  ready: boolean
  currentVersion: string
  targetVersion: string | null
  checks: UpdateCheck[]
  downtimeStatement: string
  /** The one exact operator command, present only when ready. Null otherwise. */
  operatorCommand: string | null
}

export const UPDATE_BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const UPDATE_MIN_FREE_DISK_BYTES = 10 * 1024 * 1024 * 1024

export async function freeDiskBytes(targetPath: string): Promise<number | null> {
  try {
    const stats = await statfs(targetPath)
    return Number(stats.bavail) * Number(stats.bsize)
  } catch {
    return null
  }
}

export function evaluateUpdatePreflight(input: {
  currentVersion: string
  targetVersion?: string | null
  targetImageTag?: string | null
  backup: BackupStatusRecord
  freeDiskBytes: number | null
  now?: Date
}): UpdatePreflight {
  const now = input.now ?? new Date()
  const target = input.targetVersion?.trim() || null
  const checks: UpdateCheck[] = []

  const artifactOk =
    target !== null &&
    validSemver(target) !== null &&
    validSemver(input.currentVersion) !== null &&
    semverGt(target, input.currentVersion) &&
    checkRestoreCompatibility(input.currentVersion, target) === null
  checks.push({
    id: 'artifact',
    label: 'Update artifact is compatible',
    status: artifactOk ? 'pass' : 'fail',
    detail: target
      ? artifactOk
        ? `Version ${input.currentVersion} → ${target} is a compatible upgrade.`
        : `Version ${target} is not a valid, newer, compatible release for ${input.currentVersion}.`
      : 'No target version chosen yet.',
    fix: 'Enter the target release version from the release notes (it must be newer than the current version, same major line).',
  })

  const lastSuccess = input.backup.lastSuccessfulAt
    ? Date.parse(input.backup.lastSuccessfulAt)
    : NaN
  const backupRecent =
    input.backup.status === 'healthy' &&
    !Number.isNaN(lastSuccess) &&
    now.getTime() - lastSuccess <= UPDATE_BACKUP_MAX_AGE_MS
  checks.push({
    id: 'backup',
    label: 'A recoverable backup exists and is recent',
    status: backupRecent ? 'pass' : 'fail',
    detail: backupRecent
      ? `Last successful backup ${input.backup.lastSuccessfulAt} (${input.backup.destinationLabel}).`
      : input.backup.status === 'not_configured'
        ? 'No backup has been recorded yet.'
        : `Last successful backup: ${input.backup.lastSuccessfulAt ?? 'never'} — updates require one from the last 7 days.`,
    fix: 'Run a backup first (see the Backups section) and confirm it shows as verified here.',
  })

  const diskOk = input.freeDiskBytes !== null && input.freeDiskBytes >= UPDATE_MIN_FREE_DISK_BYTES
  checks.push({
    id: 'disk',
    label: 'Enough free disk space (at least 10 GB)',
    status: diskOk ? 'pass' : 'fail',
    detail:
      input.freeDiskBytes === null
        ? 'Free disk space could not be measured.'
        : `${(input.freeDiskBytes / 1024 ** 3).toFixed(1)} GB free.`,
    fix: 'Free up disk space (old backups and unused images are the usual wins) until at least 10 GB is available.',
  })

  const ready = checks.every((check) => check.status === 'pass')
  const tag = input.targetImageTag?.trim() || target
  return {
    ready,
    currentVersion: input.currentVersion,
    targetVersion: target,
    checks,
    downtimeStatement:
      'Expect the site to be unavailable during the update: services stop, database updates run, then services restart and a health check must pass before the update counts as done. Plan for minutes, and do it when low traffic is expected. Nothing is deleted; if the health check fails, restore the pre-update backup.',
    operatorCommand: ready
      ? `npm run upgrade:operational -- --target-image-tag ${tag} --target-version ${target} --backup <verified-backup-directory> --maintenance-window-confirmed`
      : null,
  }
}

// ---------------------------------------------------------------------------
// 6. Support bundle allowlist (by construction, not redaction)
// ---------------------------------------------------------------------------

/**
 * The support bundle is built ONLY from these fields, picked one by one in
 * `buildAllowlistedSupportBundle` (diagnostics.ts). There is no dump and
 * no redaction pass: a value that is not on this list cannot appear in the
 * bundle, whatever the diagnostics snapshot contains. Notably absent:
 * job error text, provider labels/keys beyond a count, configuration
 * warnings (free text), email addresses, and every secret-shaped field.
 */
export const SUPPORT_BUNDLE_ALLOWLIST = [
  'format',
  'generatedAt',
  'status',
  'version.app',
  'version.buildSha',
  'version.schemaVersion',
  'version.deploymentProfile',
  'database.status',
  'migrations.status',
  'migrations.applied',
  'migrations.expected',
  'migrations.missing',
  'worker.status',
  'worker.ageMs',
  'jobs.queued',
  'jobs.running',
  'jobs.failed',
  'jobs.recentFailures[].taskName',
  'jobs.recentFailures[].attemptCount',
  'jobs.recentFailures[].timestamps',
  'mediaStorage.status',
  'mediaStorage.driver',
  'backup.status',
  'backup.lastSuccessfulAt',
  'backup.lastFailureAt',
  'backup.destinationLabel',
  'email.provider',
  'email.status',
  'providers.count',
  'providers.degradedCount',
  'configuration.storageDriver',
  'configuration.emailMode',
  'configuration.proxyMode',
] as const

export function describeSupportBundlePreview(): { included: string[]; excluded: string } {
  return {
    included: [...SUPPORT_BUNDLE_ALLOWLIST],
    excluded:
      'Never included: passwords, tokens, API keys, email addresses, job error messages, provider names/keys, file paths beyond the storage driver, and any free-text configuration warnings.',
  }
}

export { backupDestinationLabel, parseBackupStatusRecord }
export type { BackupStatusRecord }
