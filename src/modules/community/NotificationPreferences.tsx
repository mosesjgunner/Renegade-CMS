'use client'

import { useEffect, useState } from 'react'

type Frequency = 'immediate' | 'daily_digest' | 'weekly_digest' | 'off'
type Channel = 'in_app' | 'email' | 'sms'
const channels: Channel[] = ['in_app', 'email', 'sms']

export function NotificationPreferences({ siteId }: { siteId: string }) {
  const [values, setValues] = useState<Partial<Record<Channel, Frequency>>>({})
  const [status, setStatus] = useState('')
  useEffect(() => {
    void fetch(`/api/community/notification-preferences?siteId=${encodeURIComponent(siteId)}`).then(
      async (response) => {
        if (response.ok) setValues((await response.json()).preferences)
        else setStatus('Could not load notification preferences.')
      },
    )
  }, [siteId])
  async function update(channel: Channel, frequency: Frequency) {
    const token = document.cookie
      .split('; ')
      .find((part) => part.startsWith('renegade-member-csrf='))
      ?.split('=')[1]
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (token) headers['x-member-csrf'] = decodeURIComponent(token)
    const response = await fetch('/api/community/notification-preferences', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ siteId, channel, frequency }),
    })
    if (response.ok) {
      setValues((current) => ({ ...current, [channel]: frequency }))
      setStatus('Notification preference saved.')
    } else setStatus((await response.json()).error ?? 'Could not save notification preference.')
  }
  return (
    <section className="mt-8" aria-label="Notification preferences">
      <h2 className="text-xl font-semibold">Notification preferences</h2>
      {channels.map((channel) => (
        <label className="mt-3 block" key={channel}>
          {channel === 'in_app' ? 'In-app' : channel.toUpperCase()}
          <select
            className="form-input ml-3"
            value={values[channel] ?? ''}
            onChange={(event) => void update(channel, event.target.value as Frequency)}
          >
            {!values[channel] && <option value="">Loading</option>}
            <option value="immediate">Immediately</option>
            <option value="daily_digest">Daily digest</option>
            <option value="weekly_digest">Weekly digest</option>
            <option value="off">Off</option>
          </select>
        </label>
      ))}
      <p role="status">{status}</p>
    </section>
  )
}
