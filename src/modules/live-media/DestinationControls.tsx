'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

type Provider = 'custom' | 'youtube' | 'twitch'
type Destination = {
  id: string
  provider: Provider
  privacy: string
  probe: string
  status: string
  connected: boolean
  revoked_at: string | null
  run_id: string | null
  attempt: number | null
  retry_budget: number
  byte_limit: string
  seconds_limit: number
  audit: { event: string; created_at: string }[]
}
type View = {
  enabled: boolean
  destinations: Destination[]
  capabilities: Record<Provider, { provisioning: string; privacy: string[]; termsUrl?: string }>
  bitrateKbps: number
  termsVersion: number
}

const names = { custom: 'Custom RTMP / RTMPS', youtube: 'YouTube Live', twitch: 'Twitch' }
const busy = ['queued', 'connecting', 'sending', 'retrying']
const button = 'rounded border px-2 py-1 text-sm disabled:opacity-50'

async function destinationRequest(endpoint: string, body?: Record<string, unknown>) {
  const csrf = document.cookie.match(/(?:^|;\s*)renegade-member-csrf=([^;]+)/)?.[1]
  const response = await fetch(
    endpoint,
    body
      ? {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-member-csrf': csrf ? decodeURIComponent(csrf) : '',
          },
          body: JSON.stringify(body),
        }
      : { cache: 'no-store' },
  )
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}

export function DestinationControls({
  endpoint,
  sessionId,
}: {
  endpoint: string
  sessionId?: string
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>()
  const [provider, setProvider] = useState<Provider>('custom')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const starts = useRef(new Map<string, string>())
  const destinationEndpoint = `${endpoint}/destinations`

  useEffect(() => {
    let current = true
    let polling = false
    const refresh = async () => {
      if (polling) return
      polling = true
      try {
        const result = await destinationRequest(destinationEndpoint)
        if (current) setView(result)
      } catch {
        if (current) setError('Destination status is unavailable.')
      } finally {
        polling = false
      }
    }
    void refresh()
    const timer = open ? setInterval(() => void refresh(), 2500) : undefined
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [destinationEndpoint, open])

  async function act(body: Record<string, unknown>) {
    setPending(true)
    setError('')
    try {
      await destinationRequest(destinationEndpoint, body)
      setView(await destinationRequest(destinationEndpoint))
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Destination action failed.')
      return false
    } finally {
      setPending(false)
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const body = {
      action: 'create',
      provider,
      privacy: values.get('privacy'),
      ingest: values.get('ingest'),
      streamKey: values.get('key'),
      retryBudget: Number(values.get('retries')),
      minutes: Number(values.get('minutes')),
      mebibytes: Number(values.get('mebibytes')),
      termsVersion: view?.termsVersion,
      authorized: values.get('authorized') === 'on',
    }
    form.reset()
    void act(body)
  }

  async function start(destinationId: string) {
    if (!sessionId) return
    const request = `${destinationId}/${sessionId}`
    const idempotencyKey = starts.current.get(request) ?? crypto.randomUUID()
    starts.current.set(request, idempotencyKey)
    if (await act({ action: 'start', destinationId, sessionId, idempotencyKey }))
      starts.current.delete(request)
  }

  return (
    <details className="rounded border p-3" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>External destinations</summary>
      {view && (
        <div className="mt-3 grid gap-3">
          {view && !view.enabled && <p>External relay is unavailable on this profile.</p>}
          {view?.enabled && (
            <form method="post" autoComplete="off" onSubmit={create} className="grid gap-2">
              <label>
                Destination{' '}
                <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as Provider)}
                >
                  {Object.entries(names).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <p>{view.capabilities[provider].provisioning}</p>
              {view.capabilities[provider].termsUrl && (
                <a
                  className="underline"
                  href={view.capabilities[provider].termsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Review {names[provider]} terms
                </a>
              )}
              <label>
                Ingest URL{' '}
                <input
                  className="rounded border p-1"
                  name="ingest"
                  type="password"
                  required
                  maxLength={300}
                />
              </label>
              <label>
                Stream key{' '}
                <input
                  className="rounded border p-1"
                  name="key"
                  type="password"
                  required
                  maxLength={256}
                />
              </label>
              <label>
                Provider privacy{' '}
                <select key={provider} name="privacy">
                  {view.capabilities[provider].privacy.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Retries{' '}
                <input name="retries" type="number" min={0} max={3} defaultValue={1} required />
              </label>
              <label>
                Maximum duration (minutes){' '}
                <input name="minutes" type="number" min={1} max={120} defaultValue={30} required />
              </label>
              <label>
                Maximum transfer (MiB){' '}
                <input
                  name="mebibytes"
                  type="number"
                  min={1}
                  max={4096}
                  defaultValue={600}
                  required
                />
              </label>
              <p>
                Up to {view.bitrateKbps} kbps nominal output. Your network provider may charge for
                transfer.
              </p>
              <label>
                <input type="checkbox" name="authorized" required /> I am authorized to broadcast
                this content to this destination, accept its broadcast and simulcasting terms, and
                have selected the stated privacy in its dashboard.
              </label>
              <div>
                <button type="submit" className={button} disabled={pending}>
                  Add destination
                </button>
              </div>
            </form>
          )}
          {view?.destinations.map((destination) => {
            const running = busy.includes(destination.status)
            const destinationId = destination.id
            return (
              <section key={destinationId} className="grid gap-2 border-t pt-2">
                <p>
                  {names[destination.provider]} / {destination.privacy} /{' '}
                  {destinationId.slice(0, 8)}
                </p>
                <p role="status">
                  {destination.revoked_at
                    ? 'Revoked'
                    : destination.connected
                      ? 'Connected'
                      : 'Disconnected'}{' '}
                  / {destination.status.replaceAll('_', ' ')} / endpoint {destination.probe}
                  {destination.attempt
                    ? `  /  attempt ${destination.attempt} of ${destination.retry_budget + 1}`
                    : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {destination.connected && (
                    <>
                      <button
                        type="button"
                        className={button}
                        disabled={pending || ['queued', 'checking'].includes(destination.probe)}
                        onClick={() => void act({ action: 'test', destinationId })}
                      >
                        Test endpoint
                      </button>
                      <button
                        type="button"
                        className={button}
                        disabled={pending || !sessionId || running}
                        onClick={() => void start(destinationId)}
                      >
                        Start relay
                      </button>
                      <button
                        type="button"
                        className={button}
                        disabled={pending}
                        onClick={() => void act({ action: 'disconnect', destinationId })}
                      >
                        Disconnect
                      </button>
                      <button
                        type="button"
                        className={button}
                        disabled={pending}
                        onClick={() => void act({ action: 'revoke', destinationId })}
                      >
                        Revoke locally
                      </button>
                    </>
                  )}
                  {running && (
                    <button
                      type="button"
                      className={button}
                      disabled={pending}
                      onClick={() =>
                        void act({ action: 'stop', destinationId, runId: destination.run_id })
                      }
                    >
                      Stop relay
                    </button>
                  )}
                </div>
                <details>
                  <summary>Audit history</summary>
                  <ul>
                    {destination.audit.map((entry, index) => (
                      <li key={index}>
                        {entry.event.replaceAll('_', ' ')} /{' '}
                        {new Date(entry.created_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
            )
          })}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </details>
  )
}
