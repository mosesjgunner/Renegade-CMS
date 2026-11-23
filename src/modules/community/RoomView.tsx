'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { roomOverview } from './room-participation'
import { BroadcastControls } from '@/modules/live-media/BroadcastControls'
import type { theaterEvent } from './live-events'
import type { LiveState } from '@/modules/live-media/provider'

type Overview = Awaited<ReturnType<typeof roomOverview>>
type ChatMessage = {
  id: string
  body_html: string
  sender_id: string | null
  sequence_number: number
  room_question: boolean
}
type ChatData = { messages: ChatMessage[]; pinned: Pick<ChatMessage, 'id' | 'body_html'> | null }
type AttendeeData = {
  presentCount: number
  speakerRequests: { member_id: string; status: string }[]
}
type Playback = {
  live: string | null
  replay: string | null
  draftPreview?: boolean
  eventSource?: 'broadcast' | 'premiere' | 'external'
  eventEnded?: boolean
  premiereLobby?: boolean
  replays?: { href: string; contentType: 'hls' | 'mp4' }[]
  premiereStart?: string | null
  audio?: string | null
  captions?: string | null
  transcript?: string | null
  broadcast?: { state: LiveState; providerStopped: boolean; recording: boolean; revoked: boolean }
}
const broadcastLabel: Record<LiveState, string> = {
  starting: 'Lobby · The broadcast is starting.',
  live: 'Live · Playback may be several seconds behind the host.',
  reconnecting: 'The host connection dropped. Waiting for the source to return.',
  ended: 'The broadcast has ended.',
}

const buttonClass = 'rounded border px-3 py-1 text-sm disabled:opacity-50'
const panelClass = 'min-w-0 rounded-lg border p-4'
const fieldClass = 'block w-full rounded border p-2'

async function roomAction(endpoint: string, action: string, fields: Record<string, unknown> = {}) {
  const csrf = document.cookie.match(/(?:^|;\s*)renegade-member-csrf=([^;]+)/)?.[1]
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-member-csrf': csrf ? decodeURIComponent(csrf) : '',
    },
    body: JSON.stringify({ action, ...fields }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? 'This room action is temporarily unavailable.')
  }
  return response.json()
}

export function CreateRoomForm() {
  const router = useRouter()
  const [mode, setMode] = useState('chat')
  const [access, setAccess] = useState('members')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    const fields = Object.fromEntries([...data].filter(([, value]) => value !== ''))
    for (const key of ['startsAt', 'endsAt']) {
      if (fields[key]) fields[key] = new Date(String(fields[key])).toISOString()
    }
    try {
      const room = await roomAction('/api/rooms', 'create', fields)
      router.push(room.href)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Room creation failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className={panelClass}>
      <summary>Create a room</summary>
      <form className="mt-3 grid gap-3" onSubmit={create}>
        <label>
          Title <input className={fieldClass} name="title" required maxLength={256} />
        </label>
        <label>
          Mode{' '}
          <select
            className={fieldClass}
            name="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="chat">Chat</option>
            <option value="group">Group</option>
            <option value="content-attached">Content-attached</option>
            <option value="theater">Theater</option>
          </select>
        </label>
        <label>
          Access{' '}
          <select
            className={fieldClass}
            name="accessPolicy"
            value={access}
            onChange={(e) => setAccess(e.target.value)}
          >
            <option value="members">Site members</option>
            <option value="public">Public</option>
            <option value="paid">Paid entitlement</option>
            <option value="invite">Invitation only</option>
          </select>
        </label>
        <label>
          Group ID <input className={fieldClass} name="groupId" required={mode === 'group'} />
        </label>
        <label>
          Content ID{' '}
          <input className={fieldClass} name="contentId" required={mode === 'content-attached'} />
        </label>
        <label>
          Discussion ID <input className={fieldClass} name="discussionId" />
        </label>
        <label>
          Chat participant limit{' '}
          <input className={fieldClass} name="participantLimit" type="number" min={1} max={10000} />
        </label>
        {access !== 'public' && (
          <label>
            Chat history{' '}
            <select className={fieldClass} name="historyPolicy">
              <option value="all">All messages</option>
              <option value="from-join">From join</option>
            </select>
          </label>
        )}
        {access === 'paid' && (
          <>
            <label>
              Entitlement resource{' '}
              <input className={fieldClass} name="entitlementResource" required />
            </label>
            <label>
              Entitlement capability{' '}
              <input className={fieldClass} name="entitlementCapability" required />
            </label>
            <label>
              Entitlement scope <input className={fieldClass} name="entitlementScope" />
            </label>
          </>
        )}
        {mode === 'theater' && (
          <>
            <label>
              Starts (local time){' '}
              <input className={fieldClass} name="startsAt" type="datetime-local" />
            </label>
            <label>
              Ends (local time) <input className={fieldClass} name="endsAt" type="datetime-local" />
            </label>
          </>
        )}
        <button className={buttonClass} disabled={busy}>
          Create room
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  )
}

function TheaterPlayer({ endpoint, broadcasts }: { endpoint: string; broadcasts: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [playback, setPlayback] = useState<Playback | null>(null)
  const [problem, setProblem] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [replay, setReplay] = useState<number | null>(null)
  const resume = useRef(false)
  const replays =
    playback?.replays ??
    (playback?.replay ? [{ href: playback.replay, contentType: 'mp4' as const }] : [])
  const selected = replay === null ? null : replays[replay]
  const source = replay === null ? playback?.live : selected?.href
  const [audioOnly, setAudioOnly] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const premiereStart = replay === null ? playback?.premiereStart : null
  const filePlayback = selected?.contentType === 'mp4' || Boolean(premiereStart)
  const managedLive = Boolean(playback?.broadcast && replay === null)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function authorize() {
      let interval = 8000
      try {
        const response = await fetch(`${endpoint}/token`, { signal: controller.signal })
        if (!response.ok) {
          if (active && [401, 403, 404].includes(response.status)) setPlayback(null)
          throw new Error('Playback is currently unavailable.')
        }
        const result = (await response.json()) as Playback
        if (!active) return
        setPlayback(result)
        if (result.broadcast) interval = 4500
        else if (result.live && !result.premiereStart) interval = 240_000
      } catch {
        if (active) setProblem('Playback is currently unavailable.')
      } finally {
        if (active) timer = setTimeout(authorize, interval)
      }
    }
    void authorize()
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [endpoint, attempt])

  useEffect(() => {
    const player = video.current
    if (!player || !source || audioOnly) return
    let active = true
    let hls: { destroy: () => void } | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    const failed = () => {
      setProblem('Playback interrupted. Try the player again.')
      if (managedLive && !retry) retry = setTimeout(() => setAttempt((value) => value + 1), 5000)
    }
    const ready = () => {
      setBuffering(false)
      setProblem('')
    }
    const waiting = () => setBuffering(true)
    const sync = () => {
      if (!premiereStart || !Number.isFinite(player.duration)) return
      const elapsed = Math.max(0, (Date.now() - Date.parse(premiereStart)) / 1000)
      const target = Math.min(player.duration, elapsed)
      if (Math.abs(player.currentTime - target) > 3) player.currentTime = target
    }
    const playing = () => {
      resume.current = true
      sync()
    }
    player.addEventListener('waiting', waiting)
    player.addEventListener('loadedmetadata', sync)
    player.addEventListener('error', failed)
    player.addEventListener('canplay', ready)
    player.addEventListener('playing', playing)
    const attachFile = () => {
      player.src = source
      if (resume.current) void player.play().catch(() => undefined)
    }
    if (filePlayback) attachFile()
    else {
      void import('hls.js')
        .then(({ default: Hls }) => {
          if (!active) return
          if (!Hls.isSupported()) {
            if (player.canPlayType('application/vnd.apple.mpegurl')) attachFile()
            else failed()
            return
          }
          const instance = new Hls()
          hls = instance
          instance.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) failed()
          })
          instance.loadSource(source)
          instance.attachMedia(player)
          if (resume.current)
            instance.once(Hls.Events.MANIFEST_PARSED, () => {
              void player.play().catch(() => undefined)
            })
        })
        .catch(() => {
          if (active) failed()
        })
    }
    return () => {
      active = false
      clearTimeout(retry)
      hls?.destroy()
      player.removeEventListener('waiting', waiting)
      player.removeEventListener('loadedmetadata', sync)
      player.removeEventListener('error', failed)
      player.removeEventListener('canplay', ready)
      player.removeEventListener('playing', playing)
      player.removeAttribute('src')
      player.load()
    }
  }, [source, filePlayback, managedLive, attempt, premiereStart, audioOnly])

  if (playback?.eventSource === 'external') return null
  return (
    <section className={panelClass} aria-label="Theater player">
      {audioOnly && playback?.audio ? (
        <audio
          controls
          preload="none"
          src={playback.audio}
          aria-label="Event audio"
          onPlay={(event) => {
            const player = event.currentTarget
            if (premiereStart && Number.isFinite(player.duration))
              player.currentTime = Math.min(
                player.duration,
                Math.max(0, (Date.now() - Date.parse(premiereStart)) / 1000),
              )
          }}
        />
      ) : (
        <video
          ref={video}
          className="aspect-video w-full rounded bg-black"
          controls
          playsInline
          preload="metadata"
          aria-label={replay === null ? (premiereStart ? 'Premiere' : 'Live stream') : 'Replay'}
        >
          {playback?.captions && (
            <track kind="captions" src={playback.captions} srcLang="en" label="English" />
          )}
        </video>
      )}
      {buffering && source && !audioOnly && <p role="status">Buffering video…</p>}
      {playback?.audio && (
        <button className={buttonClass} onClick={() => setAudioOnly(!audioOnly)}>
          {audioOnly ? 'Switch to video' : 'Listen in audio only'}
        </button>
      )}
      {playback?.transcript && (
        <p>
          <a href={playback.transcript} download>
            Download transcript
          </a>
        </p>
      )}
      {playback?.broadcast && <p role="status">{broadcastLabel[playback.broadcast.state]}</p>}
      {playback?.broadcast?.state === 'ended' &&
        playback.broadcast.recording &&
        !replays.length && (
          <p role="status">
            {playback.broadcast.revoked
              ? 'Replay access was revoked.'
              : 'Replay is not available yet.'}
          </p>
        )}
      {!source && !problem && !playback?.broadcast && (
        <p role="status">
          {playback?.eventEnded
            ? replays.length
              ? 'Choose a replay to begin.'
              : 'Replay is not available yet.'
            : playback?.eventSource === 'premiere'
              ? playback.premiereLobby
                ? 'The premiere will open at the scheduled time.'
                : 'The premiere file is unavailable. Room chat remains available.'
              : broadcasts
                ? 'Lobby · Waiting for the host.'
                : 'The live stream is currently unavailable.'}
        </p>
      )}
      {problem && (!playback?.broadcast || source) && (
        <p role="status">
          {problem}{' '}
          <button className={buttonClass} onClick={() => setAttempt((value) => value + 1)}>
            Retry playback
          </button>
        </p>
      )}
      {replays.map((item, index) => (
        <a
          key={index}
          href={item.href}
          onClick={(event) => {
            event.preventDefault()
            setReplay(index)
          }}
        >
          {playback?.draftPreview
            ? replays.length === 1
              ? 'Preview private replay'
              : `Preview private replay · Part ${index + 1}`
            : replays.length === 1
              ? 'Watch replay'
              : `Watch replay · Part ${index + 1}`}
        </a>
      ))}
      {replay !== null && playback?.live && (
        <button className={buttonClass} onClick={() => setReplay(null)}>
          Return to live
        </button>
      )}
    </section>
  )
}

type TheaterEventData = Awaited<ReturnType<typeof theaterEvent>>

function TheaterEventPanel({
  endpoint,
  canManage,
  signedIn,
  broadcasts,
}: {
  endpoint: string
  canManage: boolean
  signedIn: boolean
  broadcasts: boolean
}) {
  const [revision, setRevision] = useState(0)
  const { data: event, unavailable } = useRoomViewData<TheaterEventData>(
    endpoint,
    'event',
    revision,
  )
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  async function change(action: string, fields: Record<string, unknown> = {}) {
    setBusy(true)
    setProblem('')
    try {
      await roomAction(endpoint, action, fields)
      setRevision((value) => value + 1)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The event could not be updated.')
    } finally {
      setBusy(false)
    }
  }
  if (!event && !canManage && !unavailable) return null
  return (
    <section className={panelClass} aria-label="Theater event">
      {event ? (
        <>
          <h2>{event.title}</h2>
          <p>
            <time dateTime={String(event.startsAt)}>
              {new Date(event.startsAt).toLocaleString(undefined, {
                timeZone: event.timeZone,
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>{' '}
            ({event.timeZone})
          </p>
          <p role="status">
            {event.ended
              ? event.published
                ? 'Replay available'
                : 'Event ended'
              : event.lobby
                ? 'Lobby'
                : event.reconnecting
                  ? 'Waiting for the host to reconnect'
                  : event.source === 'premiere'
                    ? 'Premiere in progress'
                    : event.source === 'external'
                      ? 'Watch party in progress'
                      : 'Show started'}
          </p>
          <p>
            <a href={`${endpoint}?view=event-calendar`}>Add to calendar</a>
          </p>
          {event.announcement && <p role="status">{event.announcement}</p>}
          {event.providerUrl && (
            <p>
              <a href={event.providerUrl} target="_blank" rel="noopener noreferrer">
                Open provider player
              </a>{' '}
              The provider may require your own account or subscription. If playback is blocked or
              offline, check availability on the provider site. Room chat is available here.
            </p>
          )}
          {event.rsvpEnabled &&
            !event.ended &&
            (signedIn ? (
              <button
                className={buttonClass}
                disabled={busy}
                onClick={() => void change(event.attending ? 'cancel-rsvp' : 'rsvp')}
              >
                {event.attending ? 'Cancel RSVP' : 'RSVP'}
              </button>
            ) : (
              <p>Sign in to RSVP.</p>
            ))}
          {canManage && (
            <>
              <form
                onSubmit={(submit) => {
                  submit.preventDefault()
                  void change('announce-event', {
                    announcement: new FormData(submit.currentTarget).get('announcement'),
                  })
                }}
              >
                <label>
                  Announcement{' '}
                  <input name="announcement" className={fieldClass} required maxLength={1000} />
                </label>
                <button className={buttonClass} disabled={busy}>
                  Post announcement
                </button>
              </form>
              {!event.ended && event.source !== 'broadcast' && (
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void change('end-event')}
                >
                  End event
                </button>
              )}
              {event.replayDraft && !event.published && (
                <p>
                  Private replay draft.{' '}
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void change('publish-event-replay')}
                  >
                    Publish replay to room audience
                  </button>
                </p>
              )}
            </>
          )}
        </>
      ) : (
        canManage &&
        !unavailable && (
          <details>
            <summary>Schedule theater event</summary>
            <form
              className="grid gap-2"
              onSubmit={(submit) => {
                submit.preventDefault()
                const data = new FormData(submit.currentTarget)
                void change('schedule-event', {
                  title: data.get('title'),
                  startsAt: new Date(String(data.get('startsAt'))).toISOString(),
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  source: data.get('source'),
                  providerUrl: data.get('providerUrl'),
                  rsvpEnabled: data.has('rsvp'),
                })
              }}
            >
              <label>
                Title <input className={fieldClass} name="title" required maxLength={160} />
              </label>
              <label>
                Start in your local time{' '}
                <input className={fieldClass} type="datetime-local" name="startsAt" required />
              </label>
              <label>
                Source{' '}
                <select className={fieldClass} name="source">
                  <option value="broadcast">Recorded live show</option>
                  <option value="premiere">Locally owned premiere</option>
                  <option value="external">External watch party</option>
                </select>
              </label>
              <label>
                Official playback URL (external only){' '}
                <input className={fieldClass} name="providerUrl" type="url" />
              </label>
              <label>
                <input type="checkbox" name="rsvp" /> Enable optional RSVP
              </label>
              <button className={buttonClass} disabled={busy}>
                Schedule event
              </button>
            </form>
          </details>
        )
      )}
      {canManage && event?.source === 'broadcast' && !broadcasts && (
        <p role="status">The recording provider is offline. The lobby and chat remain available.</p>
      )}
      {broadcasts && canManage && (!event || event.source === 'broadcast') && (
        <BroadcastControls
          endpoint={`${endpoint}/broadcast`}
          eventShow={event?.source === 'broadcast'}
        />
      )}
      {unavailable && <p role="status">Event details are temporarily unavailable.</p>}
      {problem && <p role="alert">{problem}</p>}
    </section>
  )
}

function useRoomViewData<T>(endpoint: string, view: string, revision: number) {
  const [data, setData] = useState<T | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function refresh() {
      try {
        const response = await fetch(`${endpoint}?view=${view}`, { signal: controller.signal })
        if (!response.ok) {
          if (active && [401, 403, 404].includes(response.status)) setData(null)
          throw new Error()
        }
        const result = (await response.json()) as T
        if (active) {
          setData(result)
          setUnavailable(false)
        }
      } catch {
        if (active) setUnavailable(true)
      } finally {
        if (active) timer = setTimeout(refresh, 4000)
      }
    }
    void refresh()
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [endpoint, view, revision])
  return { data, unavailable }
}

function RoomConversation({ endpoint, overview }: { endpoint: string; overview: Overview }) {
  const theater = overview.mode === 'theater'
  const [revision, setRevision] = useState(0)
  const { data: chat, unavailable: chatUnavailable } = useRoomViewData<ChatData>(
    endpoint,
    'chat',
    revision,
  )
  const { data: attendees, unavailable: attendeesUnavailable } = useRoomViewData<AttendeeData>(
    endpoint,
    'attendees',
    revision,
  )
  const [joined, setJoined] = useState(false)
  const [question, setQuestion] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [invitedMember, setInvitedMember] = useState('')
  const [invitationStatus, setInvitationStatus] = useState('')
  const marked = useRef(0)
  const messageKey = useRef('')
  const newest = chat?.messages.at(-1)?.sequence_number ?? 0

  useEffect(() => {
    if (!joined) return
    let active = true
    const timer = setInterval(() => {
      void roomAction(endpoint, 'join').catch(() => {
        if (active) {
          setJoined(false)
          setError('Participation ended. Join again to continue.')
        }
      })
    }, 30_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [endpoint, joined])

  useEffect(() => {
    if (!overview.signedIn || newest <= marked.current) return
    marked.current = newest
    void roomAction(endpoint, 'read', { sequence: newest }).catch(() => {
      marked.current = 0
    })
  }, [endpoint, overview.signedIn, newest, chat])

  async function act(action: string, fields?: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      await roomAction(endpoint, action, fields)
      if (action === 'join' || action === 'leave') setJoined(action === 'join')
      setRevision((value) => value + 1)
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Room action failed.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    messageKey.current ||= Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    if (await act('send', { body: draft, question, idempotencyKey: messageKey.current })) {
      setDraft('')
      messageKey.current = ''
    }
  }

  return (
    <aside className="grid content-start gap-4">
      <section className={panelClass} aria-label="Room conversation">
        <h2 className="text-lg font-semibold">{theater ? 'Chat and Q&A' : 'Chat'}</h2>
        {chatUnavailable && <p role="status">Chat is temporarily unavailable. Reconnecting…</p>}
        {chat?.pinned && (
          <div className="my-3 rounded border p-2">
            <strong>Pinned message</strong>
            <div dangerouslySetInnerHTML={{ __html: chat.pinned.body_html }} />
            {overview.canModerate && (
              <button className={buttonClass} disabled={busy} onClick={() => void act('unpin')}>
                Unpin
              </button>
            )}
          </div>
        )}
        {theater && (
          <div className="flex gap-2 py-2">
            <button
              className={buttonClass}
              aria-pressed={!question}
              onClick={() => {
                setQuestion(false)
                messageKey.current = ''
              }}
            >
              Chat
            </button>
            <button
              className={buttonClass}
              aria-pressed={question}
              onClick={() => {
                setQuestion(true)
                messageKey.current = ''
              }}
            >
              Questions
            </button>
          </div>
        )}
        <ol
          aria-label={question ? 'Questions' : 'Messages'}
          className="max-h-80 space-y-3 overflow-auto py-2"
        >
          {chat?.messages
            .filter((item) => item.room_question === question)
            .map((item) => (
              <li key={item.id} className="break-words border-b pb-2">
                <div dangerouslySetInnerHTML={{ __html: item.body_html }} />
                {item.sender_id && overview.canModerate && (
                  <div className="flex gap-2">
                    <button
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => void act('pin', { targetId: item.id })}
                    >
                      Pin
                    </button>
                    <button
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => void act('remove', { targetId: item.id })}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
        </ol>
        {overview.canWrite && !joined && (
          <button className={buttonClass} disabled={busy} onClick={() => void act('join')}>
            Join chat
          </button>
        )}
        {joined && (
          <form onSubmit={send} className="grid gap-2">
            <label>
              {question ? 'Your question' : 'Your message'}
              <textarea
                className="block w-full rounded border p-2"
                required
                maxLength={4000}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  messageKey.current = ''
                }}
              />
            </label>
            <button className={buttonClass} disabled={busy || chatUnavailable || !draft.trim()}>
              Send {question ? 'question' : 'message'}
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      <section className={panelClass} aria-label="Schedule and attendees">
        <h2 className="text-lg font-semibold">
          {theater ? 'Schedule and attendees' : 'Attendees'}
        </h2>
        {overview.startsAt && (
          <p>
            Starts{' '}
            <time dateTime={overview.startsAt}>
              {new Date(overview.startsAt).toLocaleString(undefined, { timeZone: 'UTC' })} UTC
            </time>
          </p>
        )}
        {overview.endsAt && (
          <p>
            Ends{' '}
            <time dateTime={overview.endsAt}>
              {new Date(overview.endsAt).toLocaleString(undefined, { timeZone: 'UTC' })} UTC
            </time>
          </p>
        )}
        {attendeesUnavailable && <p role="status">Attendee details are temporarily unavailable.</p>}
        {attendees && (
          <p>
            {attendees.presentCount}
            {overview.participantLimit ? ` / ${overview.participantLimit}` : ''} participating in
            chat
          </p>
        )}
        {joined && (
          <div className="my-2 flex flex-wrap gap-2">
            <button className={buttonClass} disabled={busy} onClick={() => void act('leave')}>
              Leave chat
            </button>
            {theater && (
              <button
                className={buttonClass}
                disabled={busy}
                onClick={() => void act('request-speaker')}
              >
                Request to speak
              </button>
            )}
          </div>
        )}
        {theater &&
          attendees?.speakerRequests.map((request) => (
            <div key={request.member_id} className="my-2">
              <p>
                Speaker request {overview.canModerate ? `from ${request.member_id} ` : ''}·{' '}
                {request.status}
              </p>
              {request.status === 'pending' && overview.canModerate && (
                <div className="flex gap-2">
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void act('approve-speaker', { targetId: request.member_id })}
                  >
                    Approve
                  </button>
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void act('decline-speaker', { targetId: request.member_id })}
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        {overview.discussionPath && (
          <a href={overview.discussionPath}>Continue in the discussion</a>
        )}
        {overview.canManage && overview.accessPolicy === 'invite' && (
          <div className="mt-3 space-y-2">
            <label>
              Member ID{' '}
              <input
                className="block w-full rounded border p-2"
                value={invitedMember}
                onChange={(event) => {
                  setInvitedMember(event.target.value)
                  setInvitationStatus('')
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonClass}
                disabled={busy || !invitedMember.trim()}
                onClick={async () => {
                  if (await act('invite', { memberId: invitedMember.trim() }))
                    setInvitationStatus('Invitation granted.')
                }}
              >
                Invite
              </button>
              <button
                className={buttonClass}
                disabled={busy || !invitedMember.trim()}
                onClick={async () => {
                  if (await act('revoke-invite', { memberId: invitedMember.trim() }))
                    setInvitationStatus('Invitation revoked.')
                }}
              >
                Revoke invitation
              </button>
            </div>
            {invitationStatus && <p role="status">{invitationStatus}</p>}
          </div>
        )}
      </section>
    </aside>
  )
}

export function RoomView({
  roomId,
  overview,
  broadcasts = false,
}: {
  roomId: string
  overview: Overview
  broadcasts?: boolean
}) {
  const endpoint = `/api/rooms/${roomId}`
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Link href="/rooms" className="text-sm">
        All rooms
      </Link>
      <h1 className="mb-5 text-3xl font-bold">{overview.title}</h1>
      {overview.lifecycle === 'closed' && <p className="mb-4">Chat is closed.</p>}
      <div
        className={
          overview.mode === 'theater'
            ? 'grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
            : 'max-w-3xl'
        }
      >
        {overview.mode === 'theater' && (
          <div className="min-w-0">
            <TheaterEventPanel
              endpoint={endpoint}
              canManage={overview.canManage}
              signedIn={overview.signedIn}
              broadcasts={broadcasts}
            />
            <TheaterPlayer endpoint={endpoint} broadcasts={broadcasts} />
          </div>
        )}
        <RoomConversation endpoint={endpoint} overview={overview} />
      </div>
    </main>
  )
}
