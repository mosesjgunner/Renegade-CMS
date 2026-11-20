'use client'

import { useCallback, useEffect, useState } from 'react'

import { ConfirmDestructive } from './forms'
import type { BackupCoverage } from '../operations/backup'
import type {
  BackupDestinationConfig,
  HealthItem,
  UpdatePreflight,
} from '../operations/guided-operations'

type GuidedResponse = {
  health: HealthItem[]
  backup: {
    status: string
    lastSuccessfulAt: string | null
    lastFailureAt: string | null
    verified: boolean | null
    coverage: BackupCoverage | null
    destinationLabel: string
    destinationConfig: BackupDestinationConfig | null
    keyCustodyExplanation: string
    offHostExplanation: string
  }
  update: UpdatePreflight
  supportBundlePreview: { included: string[]; excluded: string }
  error?: string
}

type RestoreResult = {
  verification: { version: string; migrationCount: number; totalBytes: number; targetRoot: string }
  compatibilityError: string | null
  liveRestoreOffered: boolean
  liveRestoreCommand: string
}

const DISMISSED_KEY = 'renegade-health-dismissed'
const readDismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

const HEALTH_STYLES: Record<HealthItem['state'], string> = {
  healthy: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  attention: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  broken: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

function CoverageTable({ coverage }: { coverage: BackupCoverage | null }) {
  if (!coverage) {
    return (
      <p className="text-xs text-stone-500">
        Coverage is not recorded for the last backup yet — run a new backup to record exactly what
        it contains.
      </p>
    )
  }
  const rows: Array<[string, string]> = [
    ['Database', coverage.database ? 'Included' : 'Not included'],
    ['Media & generated files', coverage.media ? 'Included' : 'Not included'],
    [
      'Configuration',
      coverage.configuration === 'non-secret-only'
        ? 'Non-secret settings only (secrets are never backed up)'
        : 'Not included',
    ],
    [
      'Encryption keys',
      coverage.encryptionKeys ? 'Included' : 'Not included — see key custody below',
    ],
    ['Version information', coverage.versionMetadata ? 'Included' : 'Not included'],
  ]
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-t border-stone-200 dark:border-stone-800">
            <td className="py-1.5 font-medium pr-3">{label}</td>
            <td className="py-1.5 text-stone-600 dark:text-stone-300">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function GuidedOperationsPanel() {
  const [data, setData] = useState<GuidedResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targetVersion, setTargetVersion] = useState('')
  const [kind, setKind] = useState<'local-disk' | 'operator-configured-remote'>('local-disk')
  const [localPath, setLocalPath] = useState('')
  const [remoteType, setRemoteType] = useState('')
  const [destinationMessage, setDestinationMessage] = useState<string | null>(null)
  const [archiveDir, setArchiveDir] = useState('')
  const [restore, setRestore] = useState<RestoreResult | null>(null)
  const [bundlePreview, setBundlePreview] = useState<string | null>(null)

  const load = useCallback(async (target?: string) => {
    const params = new URLSearchParams()
    const dismissed = readDismissed()
    if (dismissed.length) params.set('dismissed', dismissed.join(','))
    if (target) params.set('targetVersion', target)
    const response = await fetch(`/api/operations/guided?${params}`, {
      credentials: 'same-origin',
    })
    const body = (await response.json()) as GuidedResponse
    if (!response.ok) throw new Error(body.error ?? 'Guided operations are unavailable.')
    setData(body)
    if (body.backup.destinationConfig) {
      setKind(body.backup.destinationConfig.kind)
      setLocalPath(body.backup.destinationConfig.localPath)
      setRemoteType(body.backup.destinationConfig.remoteType ?? '')
    }
  }, [])

  useEffect(() => {
    load().catch((caught) =>
      setError(caught instanceof Error ? caught.message : 'Guided operations are unavailable.'),
    )
  }, [load])

  if (error) {
    return (
      <section className="surface-card p-5" aria-label="Guided operations">
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      </section>
    )
  }
  if (!data) {
    return (
      <section className="surface-card p-5" aria-label="Guided operations">
        <p className="text-sm text-stone-500" role="status">
          Checking site health, backups, and update readiness…
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <section className="surface-card p-5 space-y-3" aria-label="Site health">
        <h2 className="font-semibold text-base">Site health — in plain terms</h2>
        <ul className="divide-y divide-stone-200 dark:divide-stone-800 text-sm">
          {data.health.map((item) => (
            <li key={item.id} className="py-2.5 flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-stone-500">{item.impact}</p>
                <p className="text-xs text-stone-500">Next: {item.nextAction}</p>
                {item.dismissedButUnresolved ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    You dismissed this tip earlier, but it is still happening — hiding a tip never
                    marks a problem fixed.
                  </p>
                ) : null}
              </div>
              <span className="flex flex-col items-end gap-1">
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap ${HEALTH_STYLES[item.state]}`}
                >
                  {item.state}
                </span>
                <button
                  type="button"
                  className="text-[11px] underline text-stone-500"
                  onClick={() => {
                    const next = [...new Set([...readDismissed(), item.id])]
                    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
                    void load(targetVersion || undefined)
                  }}
                >
                  Dismiss tip
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="surface-card p-5 space-y-3" aria-label="Backups">
        <h2 className="font-semibold text-base">Backups</h2>
        <p className="text-sm">
          Status: <strong>{data.backup.status.replace('_', ' ')}</strong>
          {data.backup.lastSuccessfulAt
            ? ` · Last successful backup ${new Date(data.backup.lastSuccessfulAt).toLocaleString()}`
            : ' · No successful backup recorded yet'}
          {data.backup.verified !== null
            ? ` · Verified: ${data.backup.verified ? 'yes' : 'no'}`
            : ''}
        </p>
        <p className="text-sm font-medium" role="status">
          Destination: {data.backup.destinationLabel}
        </p>
        <CoverageTable coverage={data.backup.coverage} />
        <p className="text-xs text-stone-600 dark:text-stone-300">
          {data.backup.offHostExplanation}
        </p>
        <p className="text-xs text-stone-600 dark:text-stone-300">
          <strong>About your encryption keys:</strong> {data.backup.keyCustodyExplanation}
        </p>
        <form
          className="space-y-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault()
            void (async () => {
              const response = await fetch('/api/operations/backup-destination', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kind, localPath, remoteType }),
              })
              const body = (await response.json()) as { error?: string }
              setDestinationMessage(
                response.ok
                  ? 'Backup destination saved.'
                  : (body.error ?? 'That destination could not be saved.'),
              )
              if (response.ok) await load(targetVersion || undefined)
            })()
          }}
        >
          <p className="font-medium">Where backups go</p>
          <label className="block">
            <input
              type="radio"
              name="backup-kind"
              checked={kind === 'local-disk'}
              onChange={() => setKind('local-disk')}
            />{' '}
            This server&apos;s disk (same-disk snapshot — not an off-host backup)
          </label>
          <label className="block">
            <input
              type="radio"
              name="backup-kind"
              checked={kind === 'operator-configured-remote'}
              onChange={() => setKind('operator-configured-remote')}
            />{' '}
            An off-host destination I sync this folder to myself
          </label>
          <label className="block">
            Backup folder on this server
            <input
              className="block w-full border rounded px-2 py-1 mt-1"
              value={localPath}
              onChange={(event) => setLocalPath(event.target.value)}
              placeholder="/srv/renegade-backups"
              required
            />
          </label>
          {kind === 'operator-configured-remote' ? (
            <label className="block">
              Off-host destination type
              <input
                className="block w-full border rounded px-2 py-1 mt-1"
                value={remoteType}
                onChange={(event) => setRemoteType(event.target.value)}
                placeholder="S3 bucket, second server (rsync), …"
                required
              />
            </label>
          ) : null}
          <button type="submit" className="border rounded px-3 py-1">
            Save destination
          </button>
          {destinationMessage ? (
            <p className="text-xs" role="status">
              {destinationMessage}
            </p>
          ) : null}
        </form>
        <p className="text-xs text-stone-500">
          Run a backup on the server with:{' '}
          <code>
            npm run backup:operational -- --output &lt;backup-folder&gt;
            --maintenance-window-confirmed
          </code>
        </p>
      </section>

      <section className="surface-card p-5 space-y-3" aria-label="Restore">
        <h2 className="font-semibold text-base">Restore — test first, always</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          A restore is first proven on a separate copy: the backup is restored into its own test
          folder and verified (checksums, version, update list) while your live site stays
          untouched. Only a verified test restore unlocks the live restore instructions.
        </p>
        <label className="block text-sm">
          Backup folder to test-restore
          <input
            className="block w-full border rounded px-2 py-1 mt-1"
            value={archiveDir}
            onChange={(event) => setArchiveDir(event.target.value)}
            placeholder="/srv/renegade-backups/renegade-backup-…"
          />
        </label>
        <ConfirmDestructive
          triggerLabel="Test-restore this backup into a separate folder"
          scope="A separate test copy of this backup"
          consequence="The backup is copied to its own test folder and verified there. Your live site and live data are not changed or overwritten by this step."
          confirmLabel="Yes, test-restore it"
          onConfirm={async () => {
            const response = await fetch('/api/operations/restore-fixture', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ archiveDir }),
            })
            const body = (await response.json()) as RestoreResult & { error?: string }
            if (!response.ok) throw new Error(body.error ?? 'The test restore failed.')
            setRestore(body)
          }}
        />
        {restore ? (
          <div className="text-sm space-y-1" role="status">
            <p>
              Test restore verified: version {restore.verification.version},{' '}
              {restore.verification.migrationCount} database updates,{' '}
              {(restore.verification.totalBytes / 1024).toFixed(1)} KB, checksums match. Live data
              was not touched.
            </p>
            {restore.compatibilityError ? (
              <p className="text-red-700 dark:text-red-300">{restore.compatibilityError}</p>
            ) : null}
            {restore.liveRestoreOffered ? (
              <p>
                This backup is verified and compatible. Restoring over a live installation runs on
                the server (isolated stack, never from this web page) with:{' '}
                <code>{restore.liveRestoreCommand}</code>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="surface-card p-5 space-y-3" aria-label="Update">
        <h2 className="font-semibold text-base">Update</h2>
        <p className="text-sm">
          Current version: <strong>{data.update.currentVersion}</strong>
          {data.update.targetVersion ? (
            <>
              {' '}
              → Target: <strong>{data.update.targetVersion}</strong>
            </>
          ) : null}
        </p>
        <label className="block text-sm">
          Target version from the release notes
          <span className="flex gap-2 mt-1">
            <input
              className="border rounded px-2 py-1"
              value={targetVersion}
              onChange={(event) => setTargetVersion(event.target.value)}
              placeholder="e.g. 1.1.0"
            />
            <button
              type="button"
              className="border rounded px-3 py-1"
              onClick={() => void load(targetVersion || undefined)}
            >
              Check readiness
            </button>
          </span>
        </label>
        <ul className="text-sm space-y-2">
          {data.update.checks.map((check) => (
            <li key={check.id}>
              <span aria-hidden="true">{check.status === 'pass' ? '✓' : '✗'}</span>{' '}
              <strong>{check.label}</strong> — {check.detail}
              {check.status === 'fail' ? (
                <span className="block text-xs text-stone-500">Fix: {check.fix}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-stone-600 dark:text-stone-300">
          {data.update.downtimeStatement}
        </p>
        {data.update.ready && data.update.operatorCommand ? (
          <p className="text-sm" role="status">
            Verified ready. Updates run on the server — this web app never touches the Docker socket
            — with this one command: <code>{data.update.operatorCommand}</code>
          </p>
        ) : (
          <p className="text-sm" role="status">
            Not ready yet — fix the checks above. There is deliberately no “Update now” button:
            running an update from the web app would not be safe in this setup.
          </p>
        )}
      </section>

      <section className="surface-card p-5 space-y-3" aria-label="Support bundle">
        <h2 className="font-semibold text-base">Support bundle</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          A small file with your site&apos;s health summary, for sharing when you ask for help. It
          is built from a fixed list of safe fields only. {data.supportBundlePreview.excluded}
        </p>
        <p className="text-xs text-stone-500">
          Included fields: {data.supportBundlePreview.included.join(', ')}
        </p>
        <span className="flex gap-2">
          <button
            type="button"
            className="border rounded px-3 py-1 text-sm"
            onClick={() => {
              void (async () => {
                const response = await fetch('/api/operations/support-bundle?preview=1', {
                  credentials: 'same-origin',
                })
                setBundlePreview(JSON.stringify(await response.json(), null, 2))
              })()
            }}
          >
            Preview exactly what is included
          </button>
          <a className="border rounded px-3 py-1 text-sm" href="/api/operations/support-bundle">
            Download support bundle
          </a>
        </span>
        {bundlePreview ? (
          <pre className="text-[11px] overflow-auto max-h-80 border rounded p-2">
            {bundlePreview}
          </pre>
        ) : null}
      </section>
    </div>
  )
}
