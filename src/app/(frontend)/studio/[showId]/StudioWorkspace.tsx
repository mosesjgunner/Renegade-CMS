'use client'

/**
 * POD-05 Podcast Studio workspace — session state surface. Every control
 * drives the session state engine through the staff API
 * (/api/podcast-studio/sessions). POD-06 added the capture device panel;
 * POD-07 extended the mixer snapshot editor into channel strips (fader,
 * mute/solo, pan, per-participant mix-minus assignment display) whose
 * state shape is the POD-07 mixer core's snapshot
 * (src/modules/podcast-studio/mixer/state.ts). POD-08 adds the player
 * bank: the 8 clip players run on the POD-08 player engine core, and
 * every player/cart button is wired through the shared
 * `dispatchPlayerAction` dispatcher (the same entry point POD-15's
 * keyboard/MIDI map will call). The Web Audio engines that consume
 * this state are UNVERIFIED in a real browser (POD-07/POD-08 handoffs).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PlayerEngine } from '@/modules/podcast-studio/players/player-engine'
import {
  dispatchPlayerAction,
  type PlayerAction,
  type PlayerActionArgs,
} from '@/modules/podcast-studio/players/players-browser'
import {
  CONTROL_STRIPS,
  StudioActionBus,
  type StudioActionHandler,
} from '@/modules/podcast-studio/control/action-map'
import {
  attachStudioKeyboard,
  createLocalStoragePrefsStorage,
} from '@/modules/podcast-studio/control/keyboard-browser'
import {
  KeyboardPrefsStore,
  resolveBindings,
  type KeyboardOverrides,
} from '@/modules/podcast-studio/control/keyboard-map'

import { CaptureDevicePanel } from './CaptureDevicePanel'
import { ControlSurfacePanel } from './ControlSurfacePanel'
import { EditProjectPanel } from './EditProjectPanel'
import { GuestLobbyPanel } from './GuestLobbyPanel'
import { LiveSettingsPanel } from './LiveSettingsPanel'

type SessionDoc = {
  id: string
  showId: string
  showTitle: string
  state: string
  elapsedSec: number
  rundown: Array<{
    id: string
    type: string
    title: string
    plannedSec: number
    actualSec: number | null
    status: string
    clipId?: string
    url?: string
  }>
  cartwall: {
    banks: Array<{
      id: string
      name: string
      clips: Array<{
        id: string
        title: string
        cueInSec: number
        cueOutSec: number
        fadeInSec: number
        fadeOutSec: number
        loop: boolean
        armed: boolean
        state: string
      }>
    }>
  }
  mixer: {
    channels: Array<{
      id: string
      gainDb: number
      muted: boolean
      /** POD-07 strip extensions, preserved verbatim by the session contract. */
      kind?: string
      solo?: boolean
      pan?: number
      pfl?: boolean
    }>
    masterGainDb: number
    limiterCeilingDb: number
  }
  chapters: Array<{ startTime?: number; start?: number; title: string }>
  log: Array<{ type: string; level?: string; atElapsedSec?: number; [key: string]: unknown }>
  rundownSourceHash?: string
}

type SessionRecordView = {
  id: string
  title: string
  state: string
  lastSavedAt: string | null
  session: SessionDoc
}

const fmtSec = (sec: number) => {
  const sign = sec < 0 ? '-' : ''
  const abs = Math.abs(Math.round(sec))
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
}

export function StudioWorkspace({
  showId,
  showTitle,
  initialSessions,
  participantId = 'host',
}: {
  showId: string
  showTitle: string
  initialSessions: SessionRecordView[]
  participantId?: string
}) {
  const [records, setRecords] = useState<SessionRecordView[]>(initialSessions)
  const [activeId, setActiveId] = useState<string | null>(initialSessions[0]?.id ?? null)
  const [status, setStatus] = useState<string>('')
  const [selectedItem, setSelectedItem] = useState(0)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemPlanned, setNewItemPlanned] = useState('300')
  const [messageText, setMessageText] = useState('')
  const [deckJson, setDeckJson] = useState('')
  const rundownRef = useRef<HTMLDivElement>(null)

  // POD-08 player bank: one engine instance per mounted workspace; all
  // player controls go through dispatchPlayerAction (POD-15's entry point).
  const [playerEngine] = useState(() => new PlayerEngine())
  const playerEngineRef = useRef(playerEngine)
  const [, setPlayerTick] = useState(0)
  const [playerFlash, setPlayerFlash] = useState<number | null>(null)
  const [displayModes, setDisplayModes] = useState<Record<number, 'elapsed' | 'remaining'>>({})
  const dispatchPlayer = useCallback(
    (action: PlayerAction, args: PlayerActionArgs = {}) => {
      const result = dispatchPlayerAction(playerEngine, action, args)
      if (result.reason === 'already-loaded' && result.playerIndex !== undefined) {
        setPlayerFlash(result.playerIndex)
        setTimeout(() => setPlayerFlash(null), 600)
      }
      setPlayerTick((tick) => tick + 1)
      return result
    },
    [playerEngine],
  )

  const active = records.find((record) => record.id === activeId) ?? null
  const session = active?.session ?? null
  const sessionRef = useRef<SessionDoc | null>(null)
  useEffect(() => {
    sessionRef.current = session
  }, [session])
  const selectedItemRef = useRef(selectedItem)
  useEffect(() => {
    selectedItemRef.current = selectedItem
  }, [selectedItem])

  // POD-15 control surface: one StudioActionBus for the workspace.
  // Player/cart actions route through dispatchPlayerAction (POD-08);
  // session/rundown/mixer actions route through the studio API ops —
  // the same ops the on-screen buttons call. Keyboard overrides are
  // per participant (POD-06 prefs pattern) over localStorage.
  const [keyboardStore] = useState(() => new KeyboardPrefsStore(createLocalStoragePrefsStorage()))
  const [keyboardOverrides, setKeyboardOverrides] = useState<KeyboardOverrides>(() =>
    keyboardStore.load(participantId),
  )
  const [talkbackMuted, setTalkbackMuted] = useState(true)
  const [actionBus] = useState(() => new StudioActionBus())
  const applyOpRef = useRef<(op: Record<string, unknown>) => Promise<void>>(async () => {})
  const dispatchPlayerRef = useRef(dispatchPlayer)
  useEffect(() => {
    dispatchPlayerRef.current = dispatchPlayer
  }, [dispatchPlayer])

  useEffect(() => {
    const handlers: Record<string, StudioActionHandler> = {}
    const api = (op: Record<string, unknown>) => () => {
      void applyOpRef.current(op)
      return { ok: true }
    }
    handlers['session.prepare'] = api({ op: 'set-state', state: 'ready' })
    // POD-21: the sessions API now carries the POD-09 recording-state
    // ops, so record start/stop drive the real recording state (not
    // just the desk state) and marker.drop persists a real marker.
    handlers['record.start'] = api({ op: 'recording-start' })
    handlers['record.stop'] = api({ op: 'recording-stop' })
    handlers['marker.drop'] = api({ op: 'drop-marker' })
    handlers['stop-all'] = () => {
      dispatchPlayerRef.current('stop-all')
      void applyOpRef.current({ op: 'stop-all' })
      return { ok: true }
    }
    for (let n = 1; n <= 8; n++) {
      const index = n - 1
      handlers[`player.${n}.play`] = () => dispatchPlayerRef.current('play', { playerIndex: index })
      handlers[`player.${n}.pause`] = () =>
        dispatchPlayerRef.current('pause', { playerIndex: index })
      handlers[`player.${n}.stop`] = () => dispatchPlayerRef.current('stop', { playerIndex: index })
      handlers[`player.${n}.pfl`] = () => {
        const engine = playerEngineRef.current
        return dispatchPlayerRef.current('set-pfl', {
          playerIndex: index,
          pfl: !(engine.players[index]?.pfl ?? false),
        })
      }
      handlers[`player.${n}.fader`] = (payload) =>
        payload.valueDb === undefined
          ? { ok: false, reason: 'no-value' }
          : dispatchPlayerRef.current('set-fader', { playerIndex: index, gainDb: payload.valueDb })
      handlers[`cart.${n}.fire`] = () => {
        const clip = sessionRef.current?.cartwall.banks.flatMap((bank) => bank.clips)[index]
        if (!clip) return { ok: false, reason: 'no-such-cart' }
        if (clip.state === 'playing') return { ok: false, reason: 'already-playing' }
        if (!clip.armed) void applyOpRef.current({ op: 'arm', clipId: clip.id })
        void applyOpRef.current({ op: 'fire', clipId: clip.id })
        return { ok: true }
      }
      handlers[`cart.${n}.stop`] = () => {
        const clip = sessionRef.current?.cartwall.banks.flatMap((bank) => bank.clips)[index]
        if (!clip) return { ok: false, reason: 'no-such-cart' }
        void applyOpRef.current({ op: 'stop-clip', clipId: clip.id })
        return { ok: true }
      }
    }
    const mixerPatch = (fn: (mixer: SessionDoc['mixer']) => void) => () => {
      const current = sessionRef.current
      if (!current) return { ok: false, reason: 'no-session' }
      const mixer = JSON.parse(JSON.stringify(current.mixer)) as SessionDoc['mixer']
      fn(mixer)
      void applyOpRef.current({ op: 'set-mixer', mixer })
      return { ok: true }
    }
    const clampDb = (db: number) => Math.min(6, Math.max(-60, db))
    for (const strip of CONTROL_STRIPS) {
      const findChannel = (mixer: SessionDoc['mixer']) =>
        mixer.channels.find((channel) => channel.id === strip.stripId) ??
        mixer.channels.find((channel) => channel.kind === strip.key) ??
        (strip.key === 'guest' ? mixer.channels[2] : undefined)
      handlers[`mixer.${strip.key}.mute`] = mixerPatch((mixer) => {
        const channel = findChannel(mixer)
        if (channel) channel.muted = !channel.muted
      })
      handlers[`mixer.${strip.key}.fader-up`] = mixerPatch((mixer) => {
        const channel = findChannel(mixer)
        if (channel) channel.gainDb = clampDb(channel.gainDb + 1)
      })
      handlers[`mixer.${strip.key}.fader-down`] = mixerPatch((mixer) => {
        const channel = findChannel(mixer)
        if (channel) channel.gainDb = clampDb(channel.gainDb - 1)
      })
      handlers[`mixer.${strip.key}.fader`] = (payload) =>
        payload.valueDb === undefined
          ? { ok: false, reason: 'no-value' }
          : mixerPatch((mixer) => {
              const channel = findChannel(mixer)
              if (channel) channel.gainDb = clampDb(payload.valueDb!)
            })()
    }
    handlers['mixer.master.mute'] = mixerPatch((mixer) => {
      const muted = !(mixer.channels[0]?.muted ?? false)
      for (const channel of mixer.channels) channel.muted = muted
    })
    handlers['mixer.master.fader-up'] = mixerPatch((mixer) => {
      mixer.masterGainDb = clampDb(mixer.masterGainDb + 1)
    })
    handlers['mixer.master.fader-down'] = mixerPatch((mixer) => {
      mixer.masterGainDb = clampDb(mixer.masterGainDb - 1)
    })
    handlers['mixer.master.fader'] = (payload) =>
      payload.valueDb === undefined
        ? { ok: false, reason: 'no-value' }
        : mixerPatch((mixer) => {
            mixer.masterGainDb = clampDb(payload.valueDb!)
          })()
    handlers['talkback.toggle'] = () => {
      setTalkbackMuted((muted) => !muted)
      return { ok: true }
    }
    handlers['talkback.hold'] = (payload) => {
      setTalkbackMuted(payload.phase !== 'down')
      return { ok: true }
    }
    handlers['rundown.next'] = () => {
      setSelectedItem((index) =>
        Math.min(index + 1, Math.max(0, (sessionRef.current?.rundown.length ?? 1) - 1)),
      )
      return { ok: true }
    }
    handlers['rundown.prev'] = () => {
      setSelectedItem((index) => Math.max(index - 1, 0))
      return { ok: true }
    }
    handlers['rundown.move-up'] = () => {
      const index = selectedItemRef.current
      if (index <= 0) return { ok: false, reason: 'index-out-of-range' }
      void applyOpRef.current({ op: 'move-item', fromIdx: index, toIdx: index - 1 })
      setSelectedItem(index - 1)
      return { ok: true }
    }
    handlers['rundown.move-down'] = () => {
      const index = selectedItemRef.current
      void applyOpRef.current({ op: 'move-item', fromIdx: index, toIdx: index + 1 })
      setSelectedItem(index + 1)
      return { ok: true }
    }
    handlers['rundown.start'] = () => {
      const item = sessionRef.current?.rundown[selectedItemRef.current]
      if (!item) return { ok: false, reason: 'no-such-item' }
      void applyOpRef.current({ op: 'start-segment', itemId: item.id })
      return { ok: true }
    }
    handlers['rundown.complete'] = () => {
      const item = sessionRef.current?.rundown[selectedItemRef.current]
      if (!item) return { ok: false, reason: 'no-such-item' }
      void applyOpRef.current({ op: 'complete-segment', itemId: item.id })
      return { ok: true }
    }
    handlers['rundown.skip'] = () => {
      const item = sessionRef.current?.rundown[selectedItemRef.current]
      if (!item) return { ok: false, reason: 'no-such-item' }
      void applyOpRef.current({ op: 'skip-segment', itemId: item.id })
      return { ok: true }
    }
    handlers['rundown.remove'] = () => {
      const item = sessionRef.current?.rundown[selectedItemRef.current]
      if (!item) return { ok: false, reason: 'no-such-item' }
      void applyOpRef.current({ op: 'remove-item', itemId: item.id })
      return { ok: true }
    }
    actionBus.registerAll(handlers)
  }, [actionBus])

  const bindingsRef = useRef(resolveBindings(keyboardOverrides))
  useEffect(() => {
    bindingsRef.current = resolveBindings(keyboardOverrides)
  }, [keyboardOverrides])
  useEffect(() => {
    const attachment = attachStudioKeyboard({
      bus: actionBus,
      getBindings: () => bindingsRef.current,
      activeContexts: ['studio', 'global'],
    })
    return () => attachment.detach()
  }, [actionBus])

  const rollup = useMemo(() => {
    if (!session) return null
    const plannedTotalSec = session.rundown.reduce((sum, item) => sum + item.plannedSec, 0)
    const done = session.rundown.filter((item) => item.status === 'done')
    const donePlannedSec = done.reduce((sum, item) => sum + item.plannedSec, 0)
    const doneActualSec = done.reduce((sum, item) => sum + (item.actualSec ?? 0), 0)
    return {
      plannedTotalSec,
      doneActualSec,
      varianceSec: doneActualSec - donePlannedSec,
      done: done.length,
      playing: session.rundown.filter((item) => item.status === 'playing').length,
      pending: session.rundown.filter((item) => item.status === 'pending').length,
    }
  }, [session])

  const replaceRecord = useCallback((view: SessionRecordView) => {
    setRecords((current) => {
      const index = current.findIndex((record) => record.id === view.id)
      if (index < 0) return [view, ...current]
      const next = current.slice()
      next[index] = view
      return next
    })
  }, [])

  const applyOp = useCallback(
    async (op: Record<string, unknown>) => {
      if (!activeId) return
      const response = await fetch(`/api/podcast-studio/sessions/${activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op),
      })
      const view = (await response.json()) as SessionRecordView & {
        ok?: boolean
        error?: string
        opml?: string
      }
      if (view.session) replaceRecord(view)
      if (view.opml) setDeckJson(view.opml)
      setStatus(
        response.status === 409
          ? `Conflict: ${view.error ?? 'the OPML target changed since import — force the export only if you mean to overwrite it.'}`
          : view.ok === false
            ? `Rejected: ${view.error ?? 'operation rejected (see the session log)'}`
            : `Saved ${new Date().toLocaleTimeString()}`,
      )
    },
    [activeId, replaceRecord],
  )
  useEffect(() => {
    applyOpRef.current = applyOp
  }, [applyOp])

  const createSession = async (starter: 'blank' | 'example') => {
    const response = await fetch('/api/podcast-studio/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId, starter }),
    })
    const view = (await response.json()) as SessionRecordView
    if (view.id) {
      replaceRecord(view)
      setActiveId(view.id)
      setStatus('Session created.')
    } else {
      setStatus('Could not create a session.')
    }
  }

  const reopen = async () => {
    if (!activeId) return
    const response = await fetch(`/api/podcast-studio/sessions/${activeId}`)
    const view = (await response.json()) as SessionRecordView
    if (view.session) {
      replaceRecord(view)
      // Reopening applies the engine restore: nothing auto-plays.
      await applyOp({ op: 'restore' })
      setStatus('Session reopened (restore applied — nothing auto-plays).')
    }
  }

  const onRundownKeyDown = (event: React.KeyboardEvent) => {
    if (!session) return
    const count = session.rundown.length
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedItem((index) => Math.min(index + 1, count - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (event.altKey && selectedItem > 0) {
        void applyOp({ op: 'move-item', fromIdx: selectedItem, toIdx: selectedItem - 1 })
        setSelectedItem((index) => index - 1)
      } else {
        setSelectedItem((index) => Math.max(index - 1, 0))
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = session.rundown[selectedItem]
      if (!item) return
      void applyOp({
        op: item.status === 'playing' ? 'complete-segment' : 'start-segment',
        itemId: item.id,
      })
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      const item = session.rundown[selectedItem]
      if (item) void applyOp({ op: 'remove-item', itemId: item.id })
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="border-b border-stone-200 dark:border-stone-800 pb-4">
        <h1 className="text-3xl font-extrabold font-display">Podcast Studio — {showTitle}</h1>
        <p className="text-sm text-stone-600">
          Session desk. Session actions save through the studio API; the player bank runs on the
          POD-08 engine core (browser audio adapter UNVERIFIED).
        </p>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <select
            className="form-select"
            aria-label="Saved sessions"
            value={activeId ?? ''}
            onChange={(event) => setActiveId(event.target.value || null)}
          >
            <option value="">Select a session…</option>
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {record.title} — {record.state}
                {record.lastSavedAt
                  ? ` (saved ${new Date(record.lastSavedAt).toLocaleString()})`
                  : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void createSession('blank')}
          >
            New blank session
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void createSession('example')}
          >
            New starter session
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void reopen()}
            disabled={!active}
          >
            Reopen (restore)
          </button>
        </div>
        <p role="status" className="mt-2 text-sm">
          {status}
        </p>
      </header>

      {!session ? (
        <p className="text-sm">Create or select a session to open the desk.</p>
      ) : (
        <>
          {/* On-air bar */}
          <section
            aria-label="On-air bar"
            className={`p-4 rounded flex flex-wrap gap-3 items-center ${
              session.state === 'live' ? 'bg-red-700 text-white' : 'surface-card'
            }`}
          >
            <strong>{session.state === 'live' ? '● ON AIR' : `Desk: ${session.state}`}</strong>
            <span>Elapsed {fmtSec(session.elapsedSec)}</span>
            {(['ready', 'live', 'paused', 'ended'] as const).map((state) => (
              <button
                key={state}
                type="button"
                className="btn btn-secondary"
                onClick={() => void applyOp({ op: 'set-state', state })}
              >
                {state === 'live' ? 'Go live' : state[0].toUpperCase() + state.slice(1)}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void applyOp({ op: 'tick', sec: 30 })}
            >
              Tick +0:30
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void applyOp({ op: 'tick', sec: 300 })}
            >
              Tick +5:00
            </button>
          </section>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Rundown editor */}
            <section className="surface-card p-5 space-y-3" aria-label="Rundown editor">
              <h2 className="text-lg font-bold">Rundown</h2>
              {rollup ? (
                <p className="text-sm">
                  Planned {fmtSec(rollup.plannedTotalSec)} · Done actual{' '}
                  {fmtSec(rollup.doneActualSec)} · Variance {rollup.varianceSec >= 0 ? '+' : ''}
                  {fmtSec(rollup.varianceSec)} · {rollup.done} done / {rollup.playing} playing /{' '}
                  {rollup.pending} pending
                </p>
              ) : null}
              <div
                ref={rundownRef}
                tabIndex={0}
                role="listbox"
                aria-label="Rundown items (arrow keys select, Alt+ArrowUp moves, Enter starts/completes, Delete removes)"
                onKeyDown={onRundownKeyDown}
                className="space-y-1 outline-none"
              >
                {session.rundown.map((item, index) => (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={index === selectedItem}
                    onClick={() => setSelectedItem(index)}
                    className={`flex flex-wrap gap-2 items-center p-2 rounded border ${
                      index === selectedItem
                        ? 'border-stone-800 dark:border-stone-200'
                        : 'border-stone-200 dark:border-stone-800'
                    } ${item.status === 'done' ? 'opacity-60' : ''}`}
                  >
                    <span className="text-xs uppercase">{item.type}</span>
                    <span className="flex-1">{item.title}</span>
                    <span className="text-xs">
                      {fmtSec(item.plannedSec)}
                      {item.actualSec !== null ? ` / ${fmtSec(item.actualSec)}` : ''} ·{' '}
                      {item.status}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        void applyOp({ op: 'move-item', fromIdx: index, toIdx: index - 1 })
                      }
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        void applyOp({ op: 'move-item', fromIdx: index, toIdx: index + 1 })
                      }
                      disabled={index === session.rundown.length - 1}
                    >
                      ↓
                    </button>
                    {item.status === 'pending' ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void applyOp({ op: 'start-segment', itemId: item.id })}
                      >
                        Start
                      </button>
                    ) : null}
                    {item.status === 'playing' ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void applyOp({ op: 'complete-segment', itemId: item.id })}
                      >
                        Complete
                      </button>
                    ) : null}
                    {item.status === 'pending' || item.status === 'playing' ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void applyOp({ op: 'skip-segment', itemId: item.id })}
                      >
                        Skip
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void applyOp({ op: 'remove-item', itemId: item.id })}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!newItemTitle) return
                  void applyOp({
                    op: 'add-item',
                    item: {
                      title: newItemTitle,
                      type: 'segment',
                      plannedSec: Number(newItemPlanned) || 0,
                    },
                  })
                  setNewItemTitle('')
                }}
              >
                <input
                  className="form-input"
                  aria-label="New item title"
                  value={newItemTitle}
                  onChange={(event) => setNewItemTitle(event.target.value)}
                  placeholder="New segment title"
                />
                <input
                  className="form-input"
                  aria-label="Planned seconds"
                  value={newItemPlanned}
                  onChange={(event) => setNewItemPlanned(event.target.value)}
                  size={5}
                />
                <button type="submit" className="btn btn-secondary">
                  Add item
                </button>
              </form>
              <p className="text-xs text-stone-500">
                Keyboard: ↑/↓ select · Alt+↑ move up · Enter start/complete · Delete remove. Chapter
                markers: {session.chapters.length} (emitted on segment/guest start only).
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void applyOp({ op: 'export-opml' })}
                >
                  Export OPML (guarded)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void applyOp({ op: 'export-opml', force: true })}
                >
                  Force OPML export
                </button>
              </div>
              {deckJson ? (
                <textarea
                  className="form-textarea w-full"
                  aria-label="Exported OPML / deck JSON"
                  rows={6}
                  value={deckJson}
                  readOnly
                />
              ) : null}
            </section>

            {/* Cartwall */}
            <section className="surface-card p-5 space-y-3" aria-label="Cartwall">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">Cartwall</h2>
                <button
                  type="button"
                  className="btn btn-secondary bg-red-700 text-white"
                  onClick={() => {
                    dispatchPlayer('stop-all')
                    void applyOp({ op: 'stop-all' })
                  }}
                >
                  STOP ALL
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    void applyOp({
                      op: 'add-bank',
                      name: `Deck ${session.cartwall.banks.length + 1}`,
                    })
                  }
                >
                  Add deck
                </button>
              </div>
              {session.cartwall.banks.map((bank) => (
                <div key={bank.id} className="space-y-2">
                  <div className="flex flex-wrap gap-2 items-center">
                    <h3 className="font-semibold">{bank.name}</h3>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setDeckJson(JSON.stringify(bank, null, 2))}
                    >
                      Share deck JSON
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void applyOp({ op: 'reset-bank', bankId: bank.id })}
                    >
                      Reset (with backup)
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void applyOp({ op: 'restore-bank', bankId: bank.id })}
                    >
                      Restore backup
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        void applyOp({
                          op: 'add-clip',
                          bankId: bank.id,
                          clip: { title: `Clip ${bank.clips.length + 1}`, cueOutSec: 10 },
                        })
                      }
                    >
                      Add clip
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {bank.clips.map((clip) => (
                      <div
                        key={clip.id}
                        className={`p-2 rounded border border-stone-300 dark:border-stone-700 ${
                          clip.state === 'played' ? 'opacity-50' : ''
                        } ${clip.state === 'playing' ? 'bg-red-100 dark:bg-red-900' : ''}`}
                      >
                        <p className="font-medium">{clip.title}</p>
                        <p className="text-xs">
                          cue {clip.cueInSec}–{clip.cueOutSec}s · {clip.state}
                          {clip.armed ? ' · ARMED' : ''}
                          {clip.loop ? ' · loop' : ''}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() =>
                              void applyOp({ op: clip.armed ? 'disarm' : 'arm', clipId: clip.id })
                            }
                          >
                            {clip.armed ? 'Disarm' : 'Arm'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void applyOp({ op: 'fire', clipId: clip.id })}
                          >
                            Fire
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void applyOp({ op: 'stop-clip', clipId: clip.id })}
                          >
                            Stop
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void applyOp({ op: 'finish-clip', clipId: clip.id })}
                          >
                            Mark played
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() =>
                              dispatchPlayer('load', {
                                clip: {
                                  assetId: clip.id,
                                  title: clip.title,
                                  durationSec: Math.max(0, clip.cueOutSec - clip.cueInSec),
                                  cueInSec: 0,
                                  cueOutSec: Math.max(0, clip.cueOutSec - clip.cueInSec),
                                },
                              })
                            }
                          >
                            Load in player
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Players (POD-08): 8-player bank on the player engine core.
              State surface — audio flows through the browser adapter
              (players-browser.ts), UNVERIFIED in a real browser. */}
          <section className="surface-card p-5 space-y-3" aria-label="Clip players">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">Players</h2>
              <span className="text-xs text-stone-500">
                Engine state via dispatchPlayerAction · PFL routes to the cue bus only · played
                clips dim
              </span>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
              {playerEngine.players.map((player) => {
                const mode = displayModes[player.index] ?? 'elapsed'
                const display = playerEngine.displayModel(player.index, mode)
                const dimmed = player.clip ? playerEngine.isPlayed(player.clip.assetId) : false
                return (
                  <div
                    key={player.index}
                    className={`p-2 rounded border ${
                      playerFlash === player.index
                        ? 'border-amber-500 bg-amber-100 dark:bg-amber-900'
                        : 'border-stone-300 dark:border-stone-700'
                    } ${player.status === 'playing' ? 'bg-red-100 dark:bg-red-900' : ''} ${
                      display.endWarning ? 'ring-2 ring-amber-500' : ''
                    } ${dimmed ? 'opacity-50' : ''}`}
                  >
                    <p className="font-medium text-sm">
                      P{player.index + 1} · {player.clip ? player.clip.title : 'Empty'}
                    </p>
                    <p className="text-xs">
                      {player.status}
                      {player.pfl ? ' · PFL (cue)' : ' · CLIPS bus'}
                      {player.clip
                        ? ` · cue ${player.cueInSec.toFixed(1)}–${player.cueOutSec.toFixed(1)}s`
                        : ''}
                      {dimmed ? ' · played' : ''}
                    </p>
                    <button
                      type="button"
                      className="text-xs underline"
                      aria-label={`Player ${player.index + 1} time display mode`}
                      onClick={() =>
                        setDisplayModes((current) => ({
                          ...current,
                          [player.index]: mode === 'elapsed' ? 'remaining' : 'elapsed',
                        }))
                      }
                    >
                      {mode === 'elapsed' ? 'Elapsed' : 'Remaining'} {fmtSec(display.displaySec)}
                      {display.endWarning ? ' · ending!' : ''}
                    </button>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!player.clip}
                        onClick={() => dispatchPlayer('play', { playerIndex: player.index })}
                      >
                        Play
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!player.clip}
                        onClick={() => dispatchPlayer('pause', { playerIndex: player.index })}
                      >
                        Pause
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!player.clip}
                        onClick={() => dispatchPlayer('stop', { playerIndex: player.index })}
                      >
                        Stop
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!player.clip}
                        onClick={() => dispatchPlayer('dump', { playerIndex: player.index })}
                      >
                        Dump
                      </button>
                      <button
                        type="button"
                        className={`btn btn-secondary ${player.pfl ? 'bg-yellow-300 text-black' : ''}`}
                        disabled={!player.clip}
                        aria-pressed={player.pfl}
                        onClick={() =>
                          dispatchPlayer('set-pfl', {
                            playerIndex: player.index,
                            pfl: !player.pfl,
                          })
                        }
                      >
                        PFL
                      </button>
                    </div>
                    <label className="flex items-center gap-2 mt-1 text-xs">
                      Fader
                      <input
                        type="range"
                        min={-60}
                        max={6}
                        step={1}
                        value={player.gainDb}
                        aria-label={`Player ${player.index + 1} fader dB`}
                        onWheel={(event) =>
                          dispatchPlayer('wheel-fader', {
                            playerIndex: player.index,
                            wheelDeltaY: event.deltaY,
                          })
                        }
                        onChange={(event) =>
                          dispatchPlayer('set-fader', {
                            playerIndex: player.index,
                            gainDb: Number(event.target.value),
                          })
                        }
                      />
                      {player.gainDb} dB
                    </label>
                  </div>
                )
              })}
            </div>
          </section>

          {/* POD-15 control surfaces (keyboard + MIDI action maps) */}
          <ControlSurfacePanel
            participantId={participantId}
            bus={actionBus}
            keyboardOverrides={keyboardOverrides}
            onKeyboardOverridesChange={setKeyboardOverrides}
            talkbackMuted={talkbackMuted}
          />

          {/* POD-06 capture devices (pickers + per-participant prefs) */}
          <CaptureDevicePanel participantId={participantId} />

          {/* POD-10 guest lobby (invites, admission, drop/revoke) */}
          {activeId && <GuestLobbyPanel sessionRecordId={activeId} />}

          {/* POD-21 live ingest (program bus → ingest endpoint → relay) */}

          {/* Live-stream settings (per-show profile + source credential form) */}
          <LiveSettingsPanel showId={showId} />

          {/* POD-12 EDL timeline editor (pure engine consumer; server peaks) */}
          <EditProjectPanel showId={showId} />

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Mixer channel strips (POD-07) */}
            <section className="surface-card p-5 space-y-3" aria-label="Mixer channel strips">
              <h2 className="text-lg font-bold">Mixer — channel strips</h2>
              {session.mixer.channels.map((channel, index) => {
                const kind =
                  channel.kind ??
                  (channel.id === 'host' ? 'host' : channel.id === 'clips' ? 'clips' : 'guest')
                const updateChannel = (patch: Partial<SessionDoc['mixer']['channels'][number]>) => {
                  const mixer = JSON.parse(JSON.stringify(session.mixer)) as SessionDoc['mixer']
                  Object.assign(mixer.channels[index], patch)
                  void applyOp({ op: 'set-mixer', mixer })
                }
                return (
                  <div key={channel.id} className="border rounded p-3 space-y-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="w-20 font-medium">{channel.id}</span>
                      <input
                        type="range"
                        min={-60}
                        max={6}
                        step={0.5}
                        value={channel.gainDb}
                        aria-label={`${channel.id} fader dB`}
                        onChange={(event) => updateChannel({ gainDb: Number(event.target.value) })}
                      />
                      <span className="w-16">{channel.gainDb} dB</span>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={channel.muted}
                          onChange={(event) => updateChannel({ muted: event.target.checked })}
                        />
                        Mute
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={channel.solo ?? false}
                          aria-label={`${channel.id} solo (PFL cue)`}
                          onChange={(event) => updateChannel({ solo: event.target.checked })}
                        />
                        Solo/PFL
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-20">Pan</span>
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.05}
                        value={channel.pan ?? 0}
                        aria-label={`${channel.id} pan`}
                        onChange={(event) => updateChannel({ pan: Number(event.target.value) })}
                      />
                      <span className="w-16">
                        {(channel.pan ?? 0) === 0
                          ? 'C'
                          : (channel.pan ?? 0) < 0
                            ? `L${Math.round(Math.abs(channel.pan ?? 0) * 100)}`
                            : `R${Math.round((channel.pan ?? 0) * 100)}`}
                      </span>
                    </div>
                    <p className="text-xs opacity-80">
                      {kind === 'guest'
                        ? `Mix-minus send: program − ${channel.id} (+ host talkback). This participant never hears their own return.`
                        : kind === 'host'
                          ? 'Cue/PFL bus: solo/PFL strips, else guests + clips — no host self-sidetone. Talkback goes to guest sends only, never to program.'
                          : 'Program bus: 1/N headroom staging across unmuted sources; limiter ceiling is the final guard only.'}
                    </p>
                  </div>
                )
              })}
              <p className="text-sm">
                Master {session.mixer.masterGainDb} dB · Limiter ceiling{' '}
                {session.mixer.limiterCeilingDb} dB
              </p>
            </section>

            {/* Message bar / session log */}
            <section className="surface-card p-5 space-y-3" aria-label="Message bar">
              <h2 className="text-lg font-bold">Message bar — session log</h2>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!messageText) return
                  void applyOp({ op: 'message', text: messageText })
                  setMessageText('')
                }}
              >
                <input
                  className="form-input flex-1"
                  aria-label="Message"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Post a message to the desk log"
                />
                <button type="submit" className="btn btn-secondary">
                  Post
                </button>
              </form>
              <ul className="space-y-1 text-sm max-h-64 overflow-auto">
                {session.log
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <li
                      key={index}
                      className={
                        entry.level === 'error'
                          ? 'text-red-700'
                          : entry.level === 'warn'
                            ? 'text-amber-700'
                            : ''
                      }
                    >
                      [{fmtSec(entry.atElapsedSec ?? 0)}] {entry.type}
                      {typeof entry.text === 'string' ? `: ${entry.text}` : ''}
                      {entry.type === 'cue-fire-rejected' ? ' — unarmed fire rejected' : ''}
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </main>
  )
}
