'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'

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
}: {
  src: string
  type?: string
  title: string
  chapters?: Chapter[]
  transcript?: TranscriptSegment[]
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [copied, setCopied] = useState(false)

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

  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.hash.startsWith('#t=')) return
    const seconds = Number(window.location.hash.slice(3))
    if (Number.isFinite(seconds) && seconds >= 0) {
      seek(seconds)
    }
  }, [duration, seek])

  const copyAtTime = async () => {
    try {
      const url = new URL(window.location.href)
      url.hash = `t=${Math.floor(time)}`
      await navigator.clipboard?.writeText(url.toString())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write failed fallback
    }
  }

  // Active chapter tracking
  const activeChapterIndex = useMemo(() => {
    if (!normalizedChapters.length) return -1
    for (let i = normalizedChapters.length - 1; i >= 0; i--) {
      if (time >= normalizedChapters[i].startTime) {
        return i
      }
    }
    return 0
  }, [normalizedChapters, time])

  // Active transcript segment tracking
  const activeSegmentIndex = useMemo(() => {
    if (!transcript.length) return -1
    for (let i = transcript.length - 1; i >= 0; i--) {
      const start = Number(transcript[i].startSeconds || 0)
      const end =
        transcript[i].endSeconds !== undefined ? Number(transcript[i].endSeconds) : Infinity
      if (time >= start && time <= end) {
        return i
      }
    }
    return -1
  }, [transcript, time])

  return (
    <section
      aria-label={`Audio player: ${title}`}
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
          </div>
        </div>
      </div>

      {/* Chapters list */}
      {normalizedChapters.length > 0 && (
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
                    <span className="truncate">{chapter.title || `Chapter ${index + 1}`}</span>
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

      {/* Interactive transcript navigation */}
      {transcript.length > 0 && (
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
