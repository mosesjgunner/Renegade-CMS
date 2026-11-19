'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'

import {
  activeChapterIndexAt,
  activeSegmentIndexAt,
  buildShareUrl,
  nextChapterStart,
  parseShareTimestamp,
  previousChapterStart,
  sleepTimerExpired,
  sleepTimerRemainingSec,
  SLEEP_TIMER_MINUTE_OPTIONS,
  type SleepTimerSetting,
} from './podcast-player-model'

export type Chapter = {
  title?: string
  startSeconds?: number
  startTime?: number
  url?: string
  image?: string | { id?: string }
}

export type TranscriptSegment = {
  id?: string
  startSeconds?: number
  endSeconds?: number
  text?: string
  speaker?: string
}

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds || 0))
  const hrs = Math.floor(whole / 3600)
  const mins = Math.floor((whole % 3600) / 60)
  const secs = whole % 60
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export function PodcastPlayer({
  src,
  type = 'audio/mpeg',
  title,
  chapters = [],
  transcript = [],
  locked = false,
  lockedMessage = 'This episode is for members. Members can listen through their private member feed.',
  compact = false,
}: {
  src?: string
  type?: string
  title: string
  chapters?: Chapter[]
  transcript?: TranscriptSegment[]
  /** POD-14: members-only locked state — renders NO audio element and NO enclosure URL anywhere. */
  locked?: boolean
  lockedMessage?: string
  /** POD-18: compact mode for iframe embeds — transport only, no chapter/transcript panels. */
  compact?: boolean
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [copied, setCopied] = useState(false)
  const [muted, setMuted] = useState(false)
  const [sleepSetting, setSleepSetting] = useState<SleepTimerSetting>({ kind: 'off' })
  const [sleepSetAt, setSleepSetAt] = useState(0)
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null)

  const normalizedChapters = useMemo(() => {
    return (chapters || []).map((ch) => ({
      title: ch.title || '',
      startTime: Number(ch.startTime ?? ch.startSeconds ?? 0),
      url: ch.url,
      image: typeof ch.image === 'string' ? ch.image : ch.image?.id,
    }))
  }, [chapters])

  const seek = useCallback(
    (value: number) => {
      if (!audio.current) return
      const clamped = Math.max(0, Math.min(value, duration || value))
      audio.current.currentTime = clamped
      setTime(clamped)
    },
    [duration],
  )

  const togglePlay = () => {
    if (!audio.current) return
    if (audio.current.paused) {
      audio.current.play().catch(() => undefined)
    } else {
      audio.current.pause()
    }
  }

  // Share-at-timestamp consumption: canonical ?t= first, legacy #t= second.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const seconds = parseShareTimestamp({
      search: window.location.search,
      hash: window.location.hash,
    })
    if (seconds !== null && seconds >= 0) {
      seek(seconds)
    }
  }, [duration, seek])

  // Sleep timer: a minutes timer pauses playback at expiry; the
  // episode-end setting pauses on the audio element's ended event.
  useEffect(() => {
    if (sleepSetting.kind !== 'minutes') {
      setSleepRemaining(null)
      return
    }
    const tick = () => {
      const now = Date.now()
      setSleepRemaining(sleepTimerRemainingSec(sleepSetting, sleepSetAt, now))
      if (sleepTimerExpired(sleepSetting, sleepSetAt, now)) {
        audio.current?.pause()
        setSleepSetting({ kind: 'off' })
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [sleepSetting, sleepSetAt])

  const copyAtTime = async () => {
    try {
      await navigator.clipboard?.writeText(buildShareUrl(window.location.href, time))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write failed fallback
    }
  }

  // Active chapter + transcript segment tracking (player model).
  const activeChapterIndex = useMemo(
    () => activeChapterIndexAt(normalizedChapters, time),
    [normalizedChapters, time],
  )
  const activeSegmentIndex = useMemo(
    () =>
      activeSegmentIndexAt(
        transcript.map((segment) => ({
          startSeconds: Number(segment.startSeconds || 0),
          endSeconds: segment.endSeconds,
        })),
        time,
      ),
    [transcript, time],
  )

  // Keyboard control: space/K play-pause, J/L ∓10 s, arrows ∓5 s,
  // M mute, [ / ] chapter navigation. Form fields keep their keys.
  const onPlayerKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('input, select, textarea')) return
    const key = event.key
    if (key === ' ' || key.toLowerCase() === 'k') {
      event.preventDefault()
      togglePlay()
    } else if (key.toLowerCase() === 'j') seek(time - 10)
    else if (key.toLowerCase() === 'l') seek(time + 10)
    else if (key === 'ArrowLeft') seek(time - 5)
    else if (key === 'ArrowRight') seek(time + 5)
    else if (key.toLowerCase() === 'm') {
      const next = !muted
      setMuted(next)
      if (audio.current) audio.current.muted = next
    } else if (key === '[') seek(previousChapterStart(normalizedChapters, time))
    else if (key === ']') {
      const next = nextChapterStart(normalizedChapters, time)
      if (next !== null) seek(next)
    }
  }

  if (locked || !src) {
    return (
      <section
        aria-label={`Audio player: ${title}`}
        data-locked="true"
        data-compact={compact ? 'true' : undefined}
        className="p-6 rounded-2xl bg-neutral-900/90 text-neutral-100 border border-neutral-800 shadow-xl space-y-4"
      >
        <div>
          <span className="text-xs font-semibold tracking-wider text-amber-400 uppercase">
            Members only
          </span>
          <h2 className="text-lg font-bold text-white truncate max-w-xl">{title}</h2>
        </div>
        <p role="status" className="text-sm text-neutral-300">
          {lockedMessage}
        </p>
      </section>
    )
  }

  return (
    <section
      aria-label={`Audio player: ${title}`}
      data-compact={compact ? 'true' : undefined}
      tabIndex={0}
      onKeyDown={onPlayerKeyDown}
      className="p-6 rounded-2xl bg-neutral-900/90 text-neutral-100 border border-neutral-800 shadow-xl space-y-6"
    >
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
            Now Playing
          </span>
          <h2 className="text-lg font-bold text-white truncate max-w-xl">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${src}?download=true`}
            download
            className="text-xs px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition"
            aria-label="Download audio file"
          >
            Download audio
          </a>
        </div>
      </div>

      {/* Native audio element fallback and media engine */}
      <audio
        ref={audio}
        controls
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          if (sleepSetting.kind === 'episode-end') setSleepSetting({ kind: 'off' })
        }}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        className="w-full sr-only"
      >
        <source src={src} type={type} />
        Your browser does not support HTML audio.{' '}
        <a href={`${src}?download=true`}>Download this episode.</a>
      </audio>

      {/* Custom accessible web player UI */}
      <div className="space-y-4">
        {/* Progress scrub bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-mono text-neutral-400">
            <span>{clock(time)}</span>
            <span>{clock(duration)}</span>
          </div>
          <input
            aria-label="Seek position"
            type="range"
            min="0"
            max={Number.isFinite(duration) && duration > 0 ? duration : 100}
            step="0.5"
            value={time}
            onChange={(event) => seek(Number(event.target.value))}
            className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>

        {/* Player controls toolbar */}
        <div
          className="flex flex-wrap items-center justify-between gap-4"
          aria-label="Player controls"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => seek(time - 15)}
              aria-label="Skip backward 15 seconds"
              className="p-2 rounded-full hover:bg-neutral-800 text-neutral-300 transition text-sm font-semibold"
            >
              -15s
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
              className="px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-sm shadow-md transition"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => seek(time + 30)}
              aria-label="Skip forward 30 seconds"
              className="p-2 rounded-full hover:bg-neutral-800 text-neutral-300 transition text-sm font-semibold"
            >
              +30s
            </button>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-300">
              Speed:
              <select
                aria-label="Playback speed"
                value={speed}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setSpeed(next)
                  if (audio.current) audio.current.playbackRate = next
                }}
                className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2 py-1 outline-none"
              >
                <option value="0.75">0.75×</option>
                <option value="1">1×</option>
                <option value="1.25">1.25×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => void copyAtTime()}
              aria-label={`Copy shareable link at ${clock(time)}`}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition"
            >
              {copied ? 'Copied link!' : `Share at ${clock(time)}`}
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !muted
                setMuted(next)
                if (audio.current) audio.current.muted = next
              }}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              aria-pressed={muted}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition"
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>

            <label className="flex items-center gap-2 text-xs font-medium text-neutral-300">
              Sleep:
              <select
                aria-label="Sleep timer"
                value={
                  sleepSetting.kind === 'minutes' ? String(sleepSetting.minutes) : sleepSetting.kind
                }
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'off') setSleepSetting({ kind: 'off' })
                  else if (value === 'episode-end') setSleepSetting({ kind: 'episode-end' })
                  else {
                    setSleepSetting({ kind: 'minutes', minutes: Number(value) })
                    setSleepSetAt(Date.now())
                  }
                }}
                className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2 py-1 outline-none"
              >
                <option value="off">Off</option>
                {SLEEP_TIMER_MINUTE_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
                <option value="episode-end">End of episode</option>
              </select>
              {sleepRemaining !== null && sleepSetting.kind === 'minutes' && (
                <span aria-live="polite" className="font-mono text-neutral-400">
                  {clock(sleepRemaining)}
                </span>
              )}
            </label>
          </div>
        </div>
        <p className="text-[11px] text-neutral-500">
          Keyboard: Space play/pause · J/L back/forward 10s · ←/→ 5s · [ / ] chapters · M mute
        </p>
      </div>

      {/* Chapters list (full mode only; embeds are transport-only) */}
      {!compact && normalizedChapters.length > 0 && (
        <section
          aria-label="Episode chapters"
          className="border-t border-neutral-800 pt-4 space-y-3"
        >
          <h3 className="text-sm font-semibold text-neutral-300">Chapters</h3>
          <ol className="grid gap-2 max-h-48 overflow-y-auto pr-2">
            {normalizedChapters.map((chapter, index) => {
              const isActive = index === activeChapterIndex
              return (
                <li key={`${chapter.title}-${index}`}>
                  <button
                    type="button"
                    onClick={() => seek(chapter.startTime)}
                    className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs transition ${
                      isActive
                        ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 font-semibold'
                        : 'bg-neutral-800/60 hover:bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {chapter.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/media/${chapter.image}`}
                          alt=""
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <span className="truncate">{chapter.title || `Chapter ${index + 1}`}</span>
                    </span>
                    <span className="font-mono text-neutral-400 ml-4">
                      {clock(chapter.startTime)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {/* Interactive transcript navigation (full mode only) */}
      {!compact && transcript.length > 0 && (
        <section
          aria-label="Episode transcript"
          className="border-t border-neutral-800 pt-4 space-y-3"
        >
          <h3 className="text-sm font-semibold text-neutral-300">Transcript</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2 text-xs">
            {transcript.map((segment, index) => {
              const isActive = index === activeSegmentIndex
              const start = Number(segment.startSeconds || 0)
              return (
                <div
                  key={`${segment.startSeconds}-${index}`}
                  className={`p-2.5 rounded-lg transition ${
                    isActive
                      ? 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-200'
                      : 'hover:bg-neutral-800/40 text-neutral-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => seek(start)}
                    className="font-mono font-bold text-emerald-400 hover:underline mr-2"
                  >
                    [{clock(start)}]
                  </button>
                  {segment.speaker && (
                    <strong className="text-white mr-1">{segment.speaker}:</strong>
                  )}
                  <span>{segment.text}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </section>
  )
}
