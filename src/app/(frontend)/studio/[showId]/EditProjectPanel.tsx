'use client'

/**
 * POD-12 (POD-REQ-26, POD-REQ-27) — EDL timeline editor panel in the
 * POD-05 studio workspace. The panel is a thin consumer of the pure
 * EDL engine (`src/modules/podcast-studio/edit/edl-engine.ts`): every
 * toolbar action runs an engine op, logs it in the inspectable
 * undo/redo history, autosaves the resulting EDL (PATCH → bounded
 * server version history), and surfaces the op's RemapReport — timed
 * metadata consequences are never silent.
 *
 * Waveforms are drawn from POD-08 SERVER peaks (`waveformPeaks` on
 * the source media assets, fetched with the project) — the client
 * never decodes full tracks. Playback is a scrub model (playhead +
 * J/L/K shuttle, no audio output) — the transport advances the
 * playhead deterministically; audible preview rides the POD-07/08
 * browser adapters and is UNVERIFIED headlessly (see the POD-12
 * handoff). No destructive audio writes exist anywhere here: the EDL
 * is the only thing an edit changes (POD-13 renders from it).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  addClipFromSource,
  applyToHistory,
  copyClips,
  createHistory,
  cutRange,
  deleteRangeInTrack,
  editDurationSec,
  edlHash,
  importToNewLane,
  moveClip,
  pasteClips,
  rateStretchClip,
  redoHistory,
  setClipFades,
  setClipGain,
  setClipMuted,
  setTrackGain,
  setTrackMuted,
  setTrackProcessing,
  splitClipAt,
  trimClip,
  undoHistory,
  type EditEdl,
  type EditHistory,
  type RemapReport,
} from '@/modules/podcast-studio/edit/edl-engine'
import { chaptersFromMarkers } from '@/modules/podcast-studio/edit/project'
import { fitView, timeToX, xToTime } from '@/modules/podcast-studio/players/waveform'
import { StudioActionBus } from '@/modules/podcast-studio/control/action-map'
import { attachStudioKeyboard } from '@/modules/podcast-studio/control/keyboard-browser'
import { resolveBindings } from '@/modules/podcast-studio/control/keyboard-map'
import type { WaveformPeaksData } from '@/modules/media/peaks'

type ProjectSummary = { id: string; title: string; lastSavedAt: string | null }
type RecordingSummary = {
  id: string
  state: string
  finalizedAt: string | null
  trackCount: number
}
type VersionEntry = { version: number; savedAt: string; label: string; edlHash: string }

const fmt = (sec: number): string => {
  const total = Math.max(0, sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

const CANVAS_W = 960
const LANE_H = 56

export function EditProjectPanel({ showId }: { showId: string }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const [selectedRecordingId, setSelectedRecordingId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [peaksByAssetId, setPeaksByAssetId] = useState<Record<string, WaveformPeaksData>>({})
  const [history, setHistory] = useState<EditHistory | null>(null)
  const [lastReport, setLastReport] = useState<RemapReport | null>(null)
  const [status, setStatus] = useState('')
  // POD-13: preview/master render state. The preview excerpt FILE is
  // rendered server-side through the same ffmpeg graph as the master;
  // browser playback of it is UNVERIFIED headlessly.
  const [renderBusy, setRenderBusy] = useState(false)
  const [previewAssetId, setPreviewAssetId] = useState('')
  const [renderNote, setRenderNote] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [error, setError] = useState('')
  const [playhead, setPlayhead] = useState(0)
  const [rate, setRate] = useState(0)
  const [inPoint, setInPoint] = useState(0)
  const [outPoint, setOutPoint] = useState(0)
  const [secPerPixel, setSecPerPixel] = useState(0.1)
  const [offsetSec, setOffsetSec] = useState(0)
  const [selection, setSelection] = useState<{ trackId: string; clipId: string } | null>(null)
  const [clipboard, setClipboard] = useState<ReturnType<typeof copyClips>>([])
  const [moveTarget, setMoveTarget] = useState('')
  const [assetIdInput, setAssetIdInput] = useState('')
  const [laneIdInput, setLaneIdInput] = useState('')
  const [laneDurationInput, setLaneDurationInput] = useState(60)
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const historyRef = useRef<EditHistory | null>(null)
  useEffect(() => {
    historyRef.current = history
  }, [history])

  const edl: EditEdl | null = history?.present ?? null
  const duration = edl ? editDurationSec(edl) : 0

  const loadProjects = useCallback(async () => {
    const res = await fetch(`/api/podcast-studio/edit-projects?showId=${showId}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return setError(String(body.error ?? 'Failed to list edit projects.'))
    setProjects((body.projects as ProjectSummary[]) ?? [])
    const recRes = await fetch(`/api/podcast-studio/edit-projects?showId=${showId}&view=recordings`)
    const recBody = await recRes.json().catch(() => ({}))
    if (recRes.ok) setRecordings((recBody.recordings as RecordingSummary[]) ?? [])
  }, [showId])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const loadProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/podcast-studio/edit-projects/${id}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return setError(String(body.error ?? 'Failed to load edit project.'))
    setProjectId(id)
    setProjectTitle(String(body.title ?? ''))
    setVersions((body.project?.versions as VersionEntry[]) ?? [])
    setPeaksByAssetId((body.peaksByAssetId as Record<string, WaveformPeaksData>) ?? {})
    const nextHistory = createHistory(body.project.edl as EditEdl)
    setHistory(nextHistory)
    setLastReport(null)
    setSelection(null)
    setPlayhead(0)
    setOffsetSec(0)
    setSecPerPixel(fitView(editDurationSec(body.project.edl as EditEdl), CANVAS_W).secPerPixel)
    setStatus(
      `Loaded “${String(body.title ?? '')}” — EDL ${String(body.edlHash ?? '').slice(0, 12)}…`,
    )
  }, [])

  const autosave = useCallback(
    async (nextHistory: EditHistory, label: string) => {
      if (!projectId) return
      setSaveStatus('Saving…')
      const res = await fetch(`/api/podcast-studio/edit-projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ edl: nextHistory.present, label }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveStatus('Save failed')
        setError(String(body.error ?? 'Autosave failed.'))
        return
      }
      setVersions((body.project?.versions as VersionEntry[]) ?? [])
      setSaveStatus(
        `Saved ${new Date().toLocaleTimeString()} — hash ${edlHash(nextHistory.present).slice(0, 12)}…`,
      )
    },
    [projectId],
  )

  const runOp = useCallback(
    (label: string, op: (current: EditEdl) => { edl: EditEdl; report: RemapReport }) => {
      const current = historyRef.current
      if (!current) return
      try {
        const result = op(current.present)
        const next = applyToHistory(current, label, result, new Date().toISOString())
        setHistory(next)
        setLastReport(result.report)
        setStatus(
          `${label} — duration ${result.report.durationBefore}s → ${result.report.durationAfter}s`,
        )
        void autosave(next, label)
      } catch (error) {
        setError(error instanceof Error ? error.message : `${label} failed.`)
      }
    },
    [autosave],
  )

  // POD-15: the editor's keys (J/L/K shuttle, I/O, split, undo/redo…)
  // run through the shared StudioActionBus + keyboard map (editor
  // context) with the shared focus guard — replacing the POD-12 ad-hoc
  // J/L/K listener. The bus carries ONLY editor handlers here, so the
  // workspace's global STOP ALL stays single-owned by the workspace.
  const playheadRef = useRef(playhead)
  useEffect(() => {
    playheadRef.current = playhead
  }, [playhead])
  const inOutRef = useRef({ inPoint, outPoint })
  useEffect(() => {
    inOutRef.current = { inPoint, outPoint }
  }, [inPoint, outPoint])
  const selectionRef = useRef(selection)
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])
  const clipboardRef = useRef(clipboard)
  useEffect(() => {
    clipboardRef.current = clipboard
  }, [clipboard])
  const runOpRef = useRef(runOp)
  useEffect(() => {
    runOpRef.current = runOp
  }, [runOp])

  useEffect(() => {
    if (!edl) return
    const bus = new StudioActionBus()
    bus.registerAll({
      'editor.shuttle.reverse': () => {
        setRate((prev) => (prev > 0 ? -1 : Math.max(-4, prev === 0 ? -1 : prev * 2)))
      },
      'editor.shuttle.stop': () => setRate(0),
      'editor.shuttle.forward': () => {
        setRate((prev) => (prev < 0 ? 1 : Math.min(4, prev === 0 ? 1 : prev * 2)))
      },
      'editor.transport.play-pause': () => setRate((prev) => (prev === 0 ? 1 : 0)),
      'editor.mark-in': () => {
        setInPoint(playheadRef.current)
        setOutPoint((prev) => Math.max(prev, playheadRef.current))
      },
      'editor.mark-out': () => setOutPoint(Math.max(playheadRef.current, inOutRef.current.inPoint)),
      'editor.split': () => {
        const sel = selectionRef.current
        if (sel)
          runOpRef.current('split at playhead', (current) =>
            splitClipAt(current, sel.trackId, playheadRef.current),
          )
        return { ok: Boolean(sel), reason: sel ? undefined : 'no-selection' }
      },
      'editor.cut-range': () => {
        const { inPoint: start, outPoint: end } = inOutRef.current
        if (end > start)
          runOpRef.current('cut range (gap closes)', (current) => cutRange(current, { start, end }))
        return { ok: end > start, reason: end > start ? undefined : 'no-range' }
      },
      'editor.delete-range': () => {
        const sel = selectionRef.current
        const { inPoint: start, outPoint: end } = inOutRef.current
        if (sel && end > start)
          runOpRef.current('delete in lane (silence)', (current) =>
            deleteRangeInTrack(current, sel.trackId, { start, end }),
          )
        return {
          ok: Boolean(sel && end > start),
          reason: sel && end > start ? undefined : 'no-range-or-selection',
        }
      },
      'editor.undo': () => {
        const next = historyRef.current && undoHistory(historyRef.current, new Date().toISOString())
        if (next && next !== historyRef.current) {
          setHistory(next)
          void autosave(next, 'undo')
        }
      },
      'editor.redo': () => {
        const next = historyRef.current && redoHistory(historyRef.current, new Date().toISOString())
        if (next && next !== historyRef.current) {
          setHistory(next)
          void autosave(next, 'redo')
        }
      },
      'editor.copy': () => {
        const sel = selectionRef.current
        if (sel && historyRef.current) {
          setClipboard(copyClips(historyRef.current.present, sel.trackId, [sel.clipId]))
          setStatus('Copied clip to clipboard.')
        }
      },
      'editor.paste': () => {
        const sel = selectionRef.current
        if (sel && clipboardRef.current.length > 0)
          runOpRef.current('paste clip', (current) =>
            pasteClips(current, sel.trackId, clipboardRef.current, playheadRef.current),
          )
        return {
          ok: Boolean(sel && clipboardRef.current.length > 0),
          reason: sel && clipboardRef.current.length > 0 ? undefined : 'nothing-to-paste',
        }
      },
      'editor.markers-to-chapters': () => {
        runOpRef.current('markers to chapters', (current) => ({
          edl: chaptersFromMarkers(current),
          report: {
            op: 'chapters-from-markers',
            durationBefore: editDurationSec(current),
            durationAfter: editDurationSec(current),
            droppedChapters: [],
            shiftedChapters: [],
            droppedCues: [],
            splitCues: [],
            clampedCues: [],
            droppedMarkers: [],
            shiftedMarkers: [],
            clamped: [],
          },
        }))
      },
      'editor.zoom-in': () => setSecPerPixel((v) => Math.max(0.001, v / 2)),
      'editor.zoom-out': () => setSecPerPixel((v) => Math.min(60, v * 2)),
      'editor.zoom-fit': () => {
        if (historyRef.current) {
          setSecPerPixel(fitView(editDurationSec(historyRef.current.present), CANVAS_W).secPerPixel)
          setOffsetSec(0)
        }
      },
    })
    const attachment = attachStudioKeyboard({
      bus,
      getBindings: () => resolveBindings(null),
      activeContexts: ['editor'],
    })
    return () => attachment.detach()
    // Mounted once per loaded project; handlers read live state via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (rate === 0 || !edl) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setPlayhead((prev) => {
        const next = prev + dt * rate
        return next < 0 ? 0 : next > duration ? duration : next
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [rate, edl, duration])

  const drawLanes = useCallback(() => {
    if (!edl) return
    for (const track of edl.tracks) {
      const canvas = canvasRefs.current[track.id]
      if (!canvas) continue
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.clearRect(0, 0, CANVAS_W, LANE_H)
      ctx.fillStyle = track.muted ? '#3f3f46' : '#27272a'
      ctx.fillRect(0, 0, CANVAS_W, LANE_H)
      for (const clip of track.clips) {
        const clipRate = clip.rate ?? 1
        const clipSpan = (clip.sourceOut - clip.sourceIn) / clipRate
        const x0 = timeToX({ secPerPixel, offsetSec }, clip.timelineStart)
        const x1 = timeToX({ secPerPixel, offsetSec }, clip.timelineStart + clipSpan)
        ctx.fillStyle = clip.muted ? '#52525b' : '#0e7490'
        ctx.fillRect(x0, 6, Math.max(1, x1 - x0), LANE_H - 12)
        const peaks = clip.sourceId
          ? peaksByAssetId[
              edl.sources.find((source) => source.id === clip.sourceId)?.mediaAssetId ?? ''
            ]
          : undefined
        if (peaks) {
          ctx.strokeStyle = '#a5f3fc'
          ctx.beginPath()
          for (let x = Math.max(0, Math.floor(x0)); x < Math.min(CANVAS_W, Math.ceil(x1)); x++) {
            const t = xToTime({ secPerPixel, offsetSec }, x)
            const sourceTime = clip.sourceIn + (t - clip.timelineStart) * clipRate
            const idx = Math.floor(sourceTime * peaks.peaksPerSecond)
            if (idx < 0 || idx >= peaks.min.length) continue
            const mid = LANE_H / 2
            const amp = Math.max(0, peaks.max[idx]) * (LANE_H / 2 - 8)
            ctx.moveTo(x, mid - amp)
            ctx.lineTo(x, mid + Math.max(0, -peaks.min[idx]) * (LANE_H / 2 - 8))
          }
          ctx.stroke()
        }
        if (selection?.clipId === clip.id) {
          ctx.strokeStyle = '#facc15'
          ctx.lineWidth = 2
          ctx.strokeRect(x0 + 1, 7, Math.max(1, x1 - x0 - 2), LANE_H - 14)
          ctx.lineWidth = 1
        }
      }
      const px = timeToX({ secPerPixel, offsetSec }, playhead)
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, LANE_H)
      ctx.stroke()
      ctx.lineWidth = 1
      if (inPoint < outPoint) {
        const ix0 = timeToX({ secPerPixel, offsetSec }, inPoint)
        const ix1 = timeToX({ secPerPixel, offsetSec }, outPoint)
        ctx.fillStyle = 'rgba(250, 204, 21, 0.15)'
        ctx.fillRect(ix0, 0, ix1 - ix0, LANE_H)
      }
    }
  }, [edl, peaksByAssetId, playhead, secPerPixel, offsetSec, inPoint, outPoint, selection])

  useEffect(() => {
    drawLanes()
  }, [drawLanes])

  const createFromRecording = async () => {
    setError('')
    if (!selectedRecordingId) return setError('Pick a finalized recording first.')
    const res = await fetch('/api/podcast-studio/edit-projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ showId, recordingId: selectedRecordingId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return setError(String(body.error ?? 'Failed to create edit project.'))
    await loadProjects()
    await loadProject(String(body.id))
  }

  const selectedTrack = edl?.tracks.find((track) => track.id === selection?.trackId)
  const selectedClip = selectedTrack?.clips.find((clip) => clip.id === selection?.clipId)

  return (
    <section className="surface-card p-5 space-y-3" aria-label="EDL editor">
      <h2 className="text-lg font-bold">Editor — EDL timeline</h2>
      <p className="text-sm text-muted">
        Non-destructive edits only: every action rewrites the EDL, never the audio. Lanes draw from
        server peaks; playback here is a scrub model (J/L/K) — audible preview is UNVERIFIED
        headlessly.
      </p>

      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="border rounded px-2 py-1 text-sm"
          value={selectedRecordingId}
          onChange={(event) => setSelectedRecordingId(event.target.value)}
          aria-label="Recording to edit"
        >
          <option value="">Create from recording…</option>
          {recordings.map((recording) => (
            <option key={recording.id} value={recording.id}>
              {recording.id.slice(0, 8)} · {recording.state} · {recording.trackCount} tracks
              {recording.finalizedAt
                ? ` · ${new Date(recording.finalizedAt).toLocaleDateString()}`
                : ''}
            </option>
          ))}
        </select>
        <button
          className="border rounded px-3 py-1 text-sm"
          onClick={() => void createFromRecording()}
        >
          New edit project
        </button>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={projectId}
          onChange={(event) => {
            const id = event.target.value
            if (id) void loadProject(id)
          }}
          aria-label="Open edit project"
        >
          <option value="">Open project…</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
        {saveStatus && <span className="text-xs text-muted">{saveStatus}</span>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {status && <p className="text-sm text-muted">{status}</p>}
      {renderNote && <p className="text-sm text-muted">{renderNote}</p>}
      {previewAssetId && (
        <audio
          controls
          src={`/media/${previewAssetId}`}
          aria-label="Rendered preview excerpt (browser playback UNVERIFIED headlessly)"
        />
      )}

      {edl && (
        <>
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <strong>{projectTitle}</strong>
            <span>Duration {fmt(duration)}</span>
            <span>Playhead {fmt(playhead)}</span>
            <span>Rate {rate === 0 ? 'paused' : `${rate}×`}</span>
            <button
              className="border rounded px-2 py-0.5"
              onClick={() => setRate(rate === 0 ? 1 : 0)}
            >
              {rate === 0 ? 'Play' : 'Pause'}
            </button>
            <button
              className="border rounded px-2 py-0.5"
              onClick={() => {
                setInPoint(playhead)
                setOutPoint(Math.max(outPoint, playhead))
              }}
            >
              Set I ({fmt(inPoint)})
            </button>
            <button
              className="border rounded px-2 py-0.5"
              onClick={() => setOutPoint(Math.max(playhead, inPoint))}
            >
              Set O ({fmt(outPoint)})
            </button>
            <button
              className="border rounded px-2 py-0.5"
              disabled={!projectId || renderBusy}
              onClick={() => {
                // POD-13 preview: excerpt through the same render graph
                // (selection I/O when set, else the first 15 seconds).
                void (async () => {
                  setRenderBusy(true)
                  setRenderNote('')
                  try {
                    const range =
                      outPoint > inPoint
                        ? { startSec: inPoint, durationSec: outPoint - inPoint }
                        : { startSec: 0, durationSec: Math.min(15, duration) }
                    const res = await fetch(
                      `/api/podcast-studio/edit-projects/${projectId}/render`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ profile: 'preview', range }),
                      },
                    )
                    const body = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(String(body.error ?? 'Preview render failed.'))
                    const assetId = String(body.outputs?.wavMaster?.mediaAssetId ?? '')
                    setPreviewAssetId(assetId)
                    setRenderNote(
                      `Preview rendered: ${String(body.report?.durationSec ?? '')}s at ${String(
                        body.report?.measurements?.integratedLufs ?? '',
                      )} LUFS (excerpt file verified server-side; browser playback UNVERIFIED).`,
                    )
                  } catch (err) {
                    setRenderNote(err instanceof Error ? err.message : 'Preview render failed.')
                  } finally {
                    setRenderBusy(false)
                  }
                })()
              }}
            >
              {renderBusy ? 'Rendering…' : 'Preview render'}
            </button>
            <button
              className="border rounded px-2 py-0.5"
              disabled={!projectId || renderBusy}
              onClick={() => {
                // POD-13 master: queued on the podcast-render task; the
                // render record + episode provenance carry the result.
                void (async () => {
                  setRenderBusy(true)
                  try {
                    const res = await fetch(
                      `/api/podcast-studio/edit-projects/${projectId}/render`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ profile: 'master' }),
                      },
                    )
                    const body = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(String(body.error ?? 'Render queue failed.'))
                    setRenderNote(
                      body.queued
                        ? 'Master render queued (podcast-render task).'
                        : 'Master render already queued or complete for this EDL.',
                    )
                  } catch (err) {
                    setRenderNote(err instanceof Error ? err.message : 'Render queue failed.')
                  } finally {
                    setRenderBusy(false)
                  }
                })()
              }}
            >
              Render master
            </button>
            <button
              className="border rounded px-2 py-0.5"
              onClick={() => setSecPerPixel((v) => Math.max(0.001, v / 2))}
            >
              Zoom in
            </button>
            <button
              className="border rounded px-2 py-0.5"
              onClick={() => setSecPerPixel((v) => Math.min(60, v * 2))}
            >
              Zoom out
            </button>
            <button
              className="border rounded px-2 py-0.5"
              onClick={() => {
                setSecPerPixel(fitView(duration, CANVAS_W).secPerPixel)
                setOffsetSec(0)
              }}
            >
              Fit
            </button>
            <button
              className="border rounded px-2 py-0.5"
              onClick={() => {
                const next =
                  historyRef.current && undoHistory(historyRef.current, new Date().toISOString())
                if (next && next !== historyRef.current) {
                  setHistory(next)
                  void autosave(next, 'undo')
                }
              }}
            >
              Undo
            </button>
            <button
              className="border rounded px-2 py-0.5"
              onClick={() => {
                const next =
                  historyRef.current && redoHistory(historyRef.current, new Date().toISOString())
                if (next && next !== historyRef.current) {
                  setHistory(next)
                  void autosave(next, 'redo')
                }
              }}
            >
              Redo
            </button>
          </div>

          <div className="space-y-2">
            {edl.tracks.map((track) => (
              <div key={track.id} className="flex gap-2 items-start">
                <div className="w-40 shrink-0 text-xs space-y-1">
                  <div className="font-semibold truncate" title={track.id}>
                    {track.label ?? track.id}
                    {track.muted ? ' (muted ref)' : ''}
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="border rounded px-1"
                      onClick={() =>
                        runOp(`mute ${track.id}`, (current) =>
                          setTrackMuted(current, track.id, !(track.muted ?? false)),
                        )
                      }
                    >
                      {track.muted ? 'Unmute' : 'Mute'}
                    </button>
                    <button
                      className="border rounded px-1"
                      onClick={() =>
                        runOp(`gain ${track.id}`, (current) =>
                          setTrackGain(current, track.id, Math.max(0, track.gain - 0.1)),
                        )
                      }
                    >
                      Gain {track.gain.toFixed(1)}
                    </button>
                  </div>
                </div>
                <canvas
                  ref={(el) => {
                    canvasRefs.current[track.id] = el
                  }}
                  width={CANVAS_W}
                  height={LANE_H}
                  className="border rounded cursor-text"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    const x = ((event.clientX - rect.left) / rect.width) * CANVAS_W
                    const t = xToTime({ secPerPixel, offsetSec }, x)
                    setPlayhead(Math.max(0, Math.min(duration, t)))
                    const hit = track.clips.find(
                      (clip) =>
                        t >= clip.timelineStart &&
                        t <
                          clip.timelineStart + (clip.sourceOut - clip.sourceIn) / (clip.rate ?? 1),
                    )
                    setSelection(hit ? { trackId: track.id, clipId: hit.id ?? '' } : null)
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <button
              className="border rounded px-2 py-1"
              disabled={!selection}
              onClick={() =>
                selection &&
                runOp('split at playhead', (current) =>
                  splitClipAt(current, selection.trackId, playhead),
                )
              }
            >
              Split at playhead
            </button>
            <button
              className="border rounded px-2 py-1"
              disabled={!(outPoint > inPoint)}
              onClick={() =>
                runOp('cut range (gap closes)', (current) =>
                  cutRange(current, { start: inPoint, end: outPoint }),
                )
              }
            >
              Cut I/O (gap closes)
            </button>
            <button
              className="border rounded px-2 py-1"
              disabled={!(outPoint > inPoint && selection)}
              onClick={() =>
                selection &&
                runOp('delete in lane (silence)', (current) =>
                  deleteRangeInTrack(current, selection.trackId, { start: inPoint, end: outPoint }),
                )
              }
            >
              Delete I/O in lane (silence)
            </button>
            <button
              className="border rounded px-2 py-1"
              disabled={!selection}
              onClick={() => {
                if (!selection) return
                const clip = copyClips(historyRef.current!.present, selection.trackId, [
                  selection.clipId,
                ])
                setClipboard(clip)
                setStatus('Copied clip to clipboard.')
              }}
            >
              Copy clip
            </button>
            <button
              className="border rounded px-2 py-1"
              disabled={clipboard.length === 0 || !selection}
              onClick={() =>
                selection &&
                runOp('paste clip', (current) =>
                  pasteClips(current, selection.trackId, clipboard, playhead),
                )
              }
            >
              Paste at playhead
            </button>
            <button
              className="border rounded px-2 py-1"
              onClick={() =>
                runOp('markers to chapters', (current) => ({
                  edl: chaptersFromMarkers(current),
                  report: {
                    op: 'chapters-from-markers',
                    durationBefore: editDurationSec(current),
                    durationAfter: editDurationSec(current),
                    droppedChapters: [],
                    shiftedChapters: [],
                    droppedCues: [],
                    splitCues: [],
                    clampedCues: [],
                    droppedMarkers: [],
                    shiftedMarkers: [],
                    clamped: [],
                  },
                }))
              }
            >
              Markers → chapters
            </button>
          </div>

          {selectedClip && selectedTrack && (
            <div className="border rounded p-3 space-y-2 text-sm">
              <div className="font-semibold">
                Selected clip — {selectedTrack.label ?? selectedTrack.id} ·{' '}
                {fmt(selectedClip.timelineStart)}–
                {fmt(
                  selectedClip.timelineStart +
                    (selectedClip.sourceOut - selectedClip.sourceIn) / (selectedClip.rate ?? 1),
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <label>
                  Clip gain{' '}
                  <input
                    type="number"
                    className="border rounded px-1 w-20"
                    defaultValue={selectedClip.gain ?? 1}
                    step={0.1}
                    min={0}
                    onBlur={(event) =>
                      runOp('clip gain', (current) =>
                        setClipGain(
                          current,
                          selectedTrack.id,
                          selectedClip.id ?? '',
                          Number(event.target.value),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Fade in (s){' '}
                  <input
                    type="number"
                    className="border rounded px-1 w-20"
                    defaultValue={selectedClip.fadeInSec ?? 0}
                    step={0.1}
                    min={0}
                    onBlur={(event) =>
                      runOp('clip fades', (current) =>
                        setClipFades(current, selectedTrack.id, selectedClip.id ?? '', {
                          fadeInSec: Number(event.target.value),
                        }),
                      )
                    }
                  />
                </label>
                <label>
                  Fade out (s){' '}
                  <input
                    type="number"
                    className="border rounded px-1 w-20"
                    defaultValue={selectedClip.fadeOutSec ?? 0}
                    step={0.1}
                    min={0}
                    onBlur={(event) =>
                      runOp('clip fades', (current) =>
                        setClipFades(current, selectedTrack.id, selectedClip.id ?? '', {
                          fadeOutSec: Number(event.target.value),
                        }),
                      )
                    }
                  />
                </label>
                <button
                  className="border rounded px-2 py-1"
                  onClick={() =>
                    runOp('clip mute', (current) =>
                      setClipMuted(
                        current,
                        selectedTrack.id,
                        selectedClip.id ?? '',
                        !(selectedClip.muted ?? false),
                      ),
                    )
                  }
                >
                  {selectedClip.muted ? 'Unmute clip' : 'Mute clip'}
                </button>
                <button
                  className="border rounded px-2 py-1"
                  onClick={() =>
                    runOp('rate stretch 2×', (current) =>
                      rateStretchClip(current, selectedTrack.id, selectedClip.id ?? '', 2),
                    )
                  }
                >
                  Stretch 2×
                </button>
                <select
                  className="border rounded px-1 py-1"
                  value={moveTarget}
                  onChange={(event) => setMoveTarget(event.target.value)}
                  aria-label="Move clip to lane"
                >
                  <option value="">Move to lane…</option>
                  {edl.tracks
                    .filter((track) => track.id !== selectedTrack.id)
                    .map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.label ?? track.id}
                      </option>
                    ))}
                </select>
                <button
                  className="border rounded px-2 py-1"
                  disabled={!moveTarget}
                  onClick={() =>
                    runOp('move clip', (current) =>
                      moveClip(current, selectedTrack.id, selectedClip.id ?? '', {
                        trackId: moveTarget,
                        timelineStart: playhead,
                      }),
                    )
                  }
                >
                  Move to playhead
                </button>
                <button
                  className="border rounded px-2 py-1"
                  onClick={() =>
                    runOp('trim clip head to playhead', (current) => {
                      const rate = selectedClip.rate ?? 1
                      return trimClip(current, selectedTrack.id, selectedClip.id ?? '', {
                        sourceIn:
                          selectedClip.sourceIn + (playhead - selectedClip.timelineStart) * rate,
                      })
                    })
                  }
                >
                  Trim head to playhead
                </button>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <label>
                  Lane processing preset{' '}
                  <input
                    type="text"
                    className="border rounded px-1 w-40"
                    placeholder="guest-chain preset id"
                    defaultValue={selectedTrack.processing?.presetId ?? ''}
                    onBlur={(event) => {
                      const presetId = event.target.value.trim()
                      runOp('lane processing', (current) =>
                        setTrackProcessing(
                          current,
                          selectedTrack.id,
                          presetId ? { presetId } : null,
                        ),
                      )
                    }}
                  />
                </label>
                <span className="text-xs text-muted">
                  Stored now; auditioned by POD-13 preview render later.
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-center text-sm">
            <input
              type="text"
              className="border rounded px-2 py-1"
              placeholder="Media asset id (intro/outro)"
              value={assetIdInput}
              onChange={(event) => setAssetIdInput(event.target.value)}
            />
            <button
              className="border rounded px-2 py-1"
              disabled={!assetIdInput || !selection}
              onClick={() =>
                selection &&
                runOp('add clip from asset', (current) =>
                  addClipFromSource(current, {
                    trackId: selection.trackId,
                    source: { id: assetIdInput, mediaAssetId: assetIdInput },
                    sourceIn: 0,
                    sourceOut: 30,
                    timelineStart: playhead,
                  }),
                )
              }
            >
              Add clip at playhead (30 s)
            </button>
            <input
              type="text"
              className="border rounded px-2 py-1"
              placeholder="New lane id"
              value={laneIdInput}
              onChange={(event) => setLaneIdInput(event.target.value)}
            />
            <input
              type="number"
              className="border rounded px-2 py-1 w-24"
              value={laneDurationInput}
              min={1}
              onChange={(event) => setLaneDurationInput(Number(event.target.value))}
              aria-label="New lane source duration (s)"
            />
            <button
              className="border rounded px-2 py-1"
              disabled={!assetIdInput || !laneIdInput}
              onClick={() =>
                runOp('import audio to new lane', (current) =>
                  importToNewLane(current, {
                    source: { id: assetIdInput, mediaAssetId: assetIdInput },
                    laneId: laneIdInput,
                    sourceDurationSec: laneDurationInput,
                  }),
                )
              }
            >
              Import to new lane
            </button>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="border rounded p-3 text-sm">
              <h3 className="font-semibold mb-1">Chapters ({edl.chapters.length})</h3>
              <ul className="max-h-40 overflow-auto space-y-0.5">
                {edl.chapters.map((chapter) => (
                  <li key={`${chapter.start}-${chapter.title}`}>
                    {fmt(chapter.start)} — {chapter.title}
                  </li>
                ))}
              </ul>
              <h3 className="font-semibold mt-3 mb-1">History ({history?.log.length ?? 0} ops)</h3>
              <ul className="max-h-40 overflow-auto space-y-0.5">
                {(history?.log ?? [])
                  .slice(-12)
                  .reverse()
                  .map((entry, i) => (
                    <li key={`${entry.at}-${i}`}>
                      {entry.label} · {entry.afterHash.slice(0, 8)}
                    </li>
                  ))}
              </ul>
            </div>
            <div className="border rounded p-3 text-sm">
              <h3 className="font-semibold mb-1">Versions ({versions.length})</h3>
              <ul className="max-h-40 overflow-auto space-y-0.5">
                {versions.map((version) => (
                  <li key={version.version} className="flex gap-2 items-center">
                    <span>
                      v{version.version} · {version.label} ·{' '}
                      {new Date(version.savedAt).toLocaleTimeString()}
                    </span>
                    <button
                      className="border rounded px-1"
                      onClick={async () => {
                        const res = await fetch(`/api/podcast-studio/edit-projects/${projectId}`, {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ restoreVersion: version.version }),
                        })
                        if (res.ok) {
                          setStatus(`Restored version ${version.version}.`)
                          await loadProject(projectId)
                        }
                      }}
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
              <h3 className="font-semibold mt-3 mb-1">Last remap report</h3>
              {lastReport ? (
                <ul className="space-y-0.5">
                  <li>Op: {lastReport.op}</li>
                  <li>
                    Dropped chapters:{' '}
                    {lastReport.droppedChapters.map((c) => c.title).join(', ') || 'none'}
                  </li>
                  <li>
                    Shifted chapters:{' '}
                    {lastReport.shiftedChapters
                      .map((s) => `${s.chapter.title} ${s.from}→${s.to}`)
                      .join(', ') || 'none'}
                  </li>
                  <li>
                    Dropped cues: {lastReport.droppedCues.map((c) => c.text).join(', ') || 'none'}
                  </li>
                  <li>
                    Split cues:{' '}
                    {lastReport.splitCues.map((s) => s.original.text).join(', ') || 'none'}
                  </li>
                  <li>
                    Clamped cues:{' '}
                    {lastReport.clampedCues.map((s) => s.original.text).join(', ') || 'none'}
                  </li>
                  {lastReport.clamped.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No op run yet this session.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
