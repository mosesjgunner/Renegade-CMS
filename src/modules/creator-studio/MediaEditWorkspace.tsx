'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ImageEditorModal } from '../media/image-editor/ImageEditorModal'
import { captureRequest } from './capture-sync'
import { SourceTranscript } from './SourceTranscript'
import { RecorderWorkspace } from './RecorderWorkspace'
import {
  maxTimelineSeconds,
  newClip,
  newVoiceover,
  recipeSchema,
  splitClip,
  timelineDuration,
  type EditClip,
  type EditRecipe,
  type ExportProfile,
} from './media-edit-recipe'
import type { EditProjectView, EditSource } from './media-edit-projects'
import {
  parseSrt,
  parseVtt,
  segmentsToSrt,
  segmentsToVtt,
} from '../podcast-studio/intelligence/caption-codec'
import type { EditExportView } from './media-edit-exports'

const endpoint = '/api/creator-studio/media-edits'
const projectURL = (id: string) => `${endpoint}?id=${id}`
const sourceURL = (id: string) => `${endpoint}?asset=${id}`
type Library = { projects: { id: string; title: string }[]; sources: EditSource[] }
type Layer = EditRecipe['layers'][number]
type Voice = NonNullable<EditRecipe['voiceover']>
const looks: Record<EditClip['look'], string> = {
  original: '',
  mono: 'grayscale(1)',
  vivid: 'contrast(1.1) saturate(1.35)',
  bright: 'brightness(1.17)',
  'low-light': 'brightness(1.26) saturate(1.12)',
}
const label = 'flex flex-col gap-1 text-sm'
const field = 'min-w-0 rounded border border-current/30 bg-transparent px-2 py-1'
const button = 'rounded border border-current/30 px-3 py-1 disabled:opacity-40'
const hotButton = `${button} bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900`
const panel = 'space-y-3 rounded-lg border border-current/20 p-4'
const grid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4'

function NumberField({
  name,
  value,
  set,
  min = 0,
  max,
  step = 'any',
}: {
  name: string
  value: number
  set: (value: number) => void
  min?: number
  max?: number
  step?: number | 'any'
}) {
  return (
    <label className={label}>
      {name}
      <input
        className={field}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          if (Number.isFinite(event.target.valueAsNumber)) set(event.target.valueAsNumber)
        }}
      />
    </label>
  )
}

function TextField({
  name,
  value,
  set,
}: {
  name: string
  value: string
  set: (value: string) => void
}) {
  return (
    <label className={label}>
      {name}
      <input
        className={field}
        value={value}
        maxLength={120}
        onChange={(event) => set(event.target.value)}
      />
    </label>
  )
}

function AssetSelect({
  title,
  assets,
  value,
  set,
  empty,
}: {
  title: string
  assets: EditSource[]
  value: string
  set: (value: string) => void
  empty: string
}) {
  return (
    <label className={label}>
      {title}
      <select className={field} value={value} onChange={(event) => set(event.target.value)}>
        <option value="">{empty}</option>
        {value && !assets.some((item) => item.id === value) && (
          <option value={value}>Existing source</option>
        )}
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.title}
          </option>
        ))}
      </select>
    </label>
  )
}

function AudioControls<T extends EditClip | Voice>({
  item,
  set,
}: {
  item: T
  set: (value: T) => void
}) {
  return (
    <div className={grid}>
      <NumberField
        name="Gain (dB)"
        min={-60}
        max={12}
        value={item.gain}
        set={(gain) => set({ ...item, gain })}
      />
      <NumberField
        name="Audio fade in (s)"
        value={item.audioFadeIn}
        set={(audioFadeIn) => set({ ...item, audioFadeIn })}
      />
      <NumberField
        name="Audio fade out (s)"
        value={item.audioFadeOut}
        set={(audioFadeOut) => set({ ...item, audioFadeOut })}
      />
      <label>
        <input
          type="checkbox"
          checked={item.muted}
          onChange={(event) => set({ ...item, muted: event.target.checked })}
        />{' '}
        Mute
      </label>
    </div>
  )
}

function ClipInspector({
  clip,
  set,
  split,
}: {
  clip: EditClip
  set: (clip: EditClip) => void
  split: (at: number) => void
}) {
  const [splitAt, setSplitAt] = useState(Math.round((clip.in + clip.out) * 500) / 1000)
  return (
    <div className="space-y-4">
      <div className={grid}>
        <NumberField
          name="Source in (s)"
          value={clip.in}
          set={(value) => set({ ...clip, in: value })}
        />
        <NumberField name="Source out (s)" value={clip.out} set={(out) => set({ ...clip, out })} />
        <NumberField name="Split at source time (s)" value={splitAt} set={setSplitAt} />
        <button className={button} type="button" onClick={() => split(splitAt)}>
          Split clip
        </button>
      </div>
      <details>
        <summary>Crop, rotate, resize and look</summary>
        <div className={`${grid} mt-3`}>
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <NumberField
              key={key}
              name={`Crop ${key} (%)`}
              value={Math.round(clip.crop[key] * 1000) / 10}
              max={100}
              set={(value) => set({ ...clip, crop: { ...clip.crop, [key]: value / 100 } })}
            />
          ))}
          <label className={label}>
            Rotation
            <select
              className={field}
              value={clip.rotation}
              onChange={(event) =>
                set({ ...clip, rotation: Number(event.target.value) as EditClip['rotation'] })
              }
            >
              {[0, 90, 180, 270].map((angle) => (
                <option key={angle} value={angle}>
                  {angle}°
                </option>
              ))}
            </select>
          </label>
          <NumberField
            name="Scale (%)"
            min={25}
            max={200}
            value={clip.scale * 100}
            set={(value) => set({ ...clip, scale: value / 100 })}
          />
          <label className={label}>
            Frame fit
            <select
              className={field}
              value={clip.fit}
              onChange={(event) => set({ ...clip, fit: event.target.value as EditClip['fit'] })}
            >
              <option value="contain">Fit entire frame</option>
              <option value="cover">Fill frame</option>
            </select>
          </label>
          <label className={label}>
            Look
            <select
              className={field}
              value={clip.look}
              onChange={(event) => set({ ...clip, look: event.target.value as EditClip['look'] })}
            >
              <option value="original">Original</option>
              <option value="mono">Monochrome</option>
              <option value="vivid">Vivid</option>
              <option value="bright">Bright exposure</option>
              <option value="low-light">Lift shadows</option>
            </select>
          </label>
          <NumberField
            name="Picture fade in (s)"
            value={clip.fadeIn}
            set={(fadeIn) => set({ ...clip, fadeIn })}
          />
          <NumberField
            name="Picture fade out (s)"
            value={clip.fadeOut}
            set={(fadeOut) => set({ ...clip, fadeOut })}
          />
        </div>
      </details>
      <details>
        <summary>Clip audio</summary>
        <AudioControls item={clip} set={set} />
      </details>
    </div>
  )
}

function ClipPreview({
  clip,
  source,
  start,
  layers,
  onTime,
  seek,
  captions,
}: {
  clip: EditClip
  source?: EditSource
  start: number
  layers: Layer[]
  onTime: (time: number) => void
  seek?: { time: number }
  captions: EditRecipe['captions']
}) {
  const [elapsed, setElapsed] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (video.current && video.current.readyState > 0) video.current.currentTime = clip.in
  }, [clip.in])
  useEffect(() => {
    if (seek && video.current) video.current.currentTime = clip.in + seek.time - start
  }, [seek, clip.in, start])
  const style = {
    objectFit: clip.fit,
    filter: looks[clip.look],
    transform: `rotate(${clip.rotation}deg) scale(${clip.scale})`,
    clipPath: `inset(${clip.crop.y * 100}% ${(1 - clip.crop.x - clip.crop.width) * 100}% ${(1 - clip.crop.y - clip.crop.height) * 100}% ${clip.crop.x * 100}%)`,
  } as const
  return (
    <div className="relative aspect-video overflow-hidden rounded bg-black">
      {source?.kind === 'image' ? (
        /* eslint-disable-next-line @next/next/no-img-element -- The private byte route uses member cookies. */
        <img
          src={sourceURL(clip.asset)}
          alt={source.title}
          style={style}
          className="h-full w-full"
        />
      ) : (
        <video
          ref={video}
          controls
          playsInline
          preload="metadata"
          muted={clip.muted}
          aria-label="Selected clip preview"
          src={sourceURL(clip.asset)}
          style={style}
          className="h-full w-full"
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = seek ? clip.in + seek.time - start : clip.in
          }}
          onPlay={(event) => {
            const element = event.currentTarget
            if (element.currentTime < clip.in || element.currentTime >= clip.out)
              element.currentTime = clip.in
          }}
          onTimeUpdate={(event) => {
            const element = event.currentTarget
            if (element.currentTime >= clip.out) element.pause()
            const time = Math.max(0, Math.min(clip.out, element.currentTime) - clip.in)
            setElapsed(time)
            onTime(start + time)
          }}
        />
      )}
      {captions
        .filter((cue) => cue.start <= start + elapsed && cue.end > start + elapsed)
        .map((cue) => (
          <p
            key={cue.start}
            className="pointer-events-none absolute bottom-12 left-4 right-4 mx-auto w-fit bg-black/80 px-2 text-center text-white"
          >
            {cue.text}
          </p>
        ))}
      {layers
        .filter(({ start: from, end }) => from <= start + elapsed && end > start + elapsed)
        .map((layer, index) => (
          <div
            key={index}
            className="pointer-events-none absolute text-center text-xl font-bold"
            style={{
              left: `${layer.x * 100}%`,
              top: `${layer.y * 100}%`,
              transform: `translate(${layer.x * -100}%, ${layer.y * -100}%)`,
              ...(layer.kind === 'graphic'
                ? { width: `${layer.width * 100}%` }
                : { color: layer.color }),
              ...(layer.kind === 'brand' ? { background: 'rgba(0,0,0,.75)', padding: 6 } : {}),
            }}
          >
            {layer.kind === 'graphic' ? (
              /* eslint-disable-next-line @next/next/no-img-element -- The private byte route uses member cookies. */
              <img src={sourceURL(layer.asset)} alt="" />
            ) : (
              layer.text
            )}
          </div>
        ))}
    </div>
  )
}

function Rows<T>({
  items,
  set,
  children,
  name,
}: {
  items: T[]
  set: (items: T[]) => void
  children: (item: T, update: (item: T) => void) => ReactNode
  name: string
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <fieldset className="rounded border border-current/20 p-3" key={index}>
          <legend>
            {name} {index + 1}
          </legend>
          {children(item, (next) => set(items.map((value, i) => (i === index ? next : value))))}
          <button
            type="button"
            className={`${button} mt-2`}
            aria-label={`Remove ${name.toLowerCase()} ${index + 1}`}
            onClick={() => set(items.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </fieldset>
      ))}
    </div>
  )
}

export function MediaEditWorkspace({
  canRecord,
  scope,
  siteId,
}: {
  canRecord: boolean
  scope: string
  siteId: string
}) {
  const [library, setLibrary] = useState<Library>({ projects: [], sources: [] })
  const [project, setProject] = useState<EditProjectView | null>(null)
  const [recipe, setRecipe] = useState<EditRecipe | null>(null)
  const [results, setResults] = useState<EditExportView[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('Loading projects…')
  const [onlineRetry, setOnlineRetry] = useState(0)
  const [selected, setSelected] = useState(0)
  const [seek, setSeek] = useState<{ time: number }>()
  const [subtitleTrack, setSubtitleTrack] = useState('captions')
  const [revisionPreview, setRevisionPreview] = useState<{
    clip: EditClip
    project: string
    title: string
    captions: EditRecipe['captions']
  }>()
  const [assetId, setAssetId] = useState('')
  const [still, setStill] = useState<EditSource | null>(null)
  const [record, setRecord] = useState(false)
  const [recreate, setRecreate] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [output, setOutput] = useState<EditExportView | null>(null)
  const requestBusy = useRef(false)
  const requestKey = useRef<Partial<Record<ExportProfile, string>>>({})
  const openedId = project?.id
  const dirty = recipe !== project?.recipe && Boolean(recipe && project)

  const refresh = useCallback(async () => {
    setLibrary(await captureRequest<Library>(endpoint))
  }, [])
  const open = useCallback(async (id: string, created?: EditProjectView) => {
    const next = created ?? (await captureRequest<EditProjectView>(projectURL(id)))
    window.history.replaceState(null, '', `?project=${id}`)
    setProject(next)
    setRecipe(next.recipe)
    setSelected(0)
    setPlayhead(0)
    setResults([])
    setOutput(null)
    setError('')
    setMessage('All changes saved')
  }, [])
  useEffect(() => {
    void refresh()
      .then(async () => {
        const id = new URLSearchParams(window.location.search).get('project')
        if (id) await open(id)
        else setMessage('')
      })
      .catch((error: Error) => {
        setMessage('')
        setError(error.message)
      })
      .finally(() => setLoading(false))
  }, [open, refresh])
  useEffect(() => {
    if (!openedId) return
    let active = true
    const load = () =>
      captureRequest<EditExportView[]>(`${projectURL(openedId)}&exports=1`)
        .then((items) => {
          if (active) setResults(items)
        })
        .catch(() => undefined)
    void load()
    const interval = window.setInterval(() => void load(), 3000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [openedId])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    const retry = () => setOnlineRetry((value) => value + 1)
    window.addEventListener('beforeunload', warn)
    window.addEventListener('online', retry)
    return () => {
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('online', retry)
    }
  }, [dirty])

  const perform = useCallback(async (operation: () => Promise<void>) => {
    if (requestBusy.current) return
    requestBusy.current = true
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (error) {
      setError((error as Error).message)
      setMessage('')
    } finally {
      requestBusy.current = false
      setBusy(false)
    }
  }, [])

  const save = useCallback(
    (action: 'save' | 'undo' | 'redo') => {
      if (!project || !recipe) return
      void perform(async () => {
        const next = await captureRequest<EditProjectView>(projectURL(project.id), 'POST', {
          action,
          revision: project.revision,
          recipe: action === 'save' ? recipe : undefined,
        })
        setProject(next)
        setRecipe((current) => (current === recipe ? next.recipe : current))
        setSelected((index) => Math.max(0, Math.min(index, next.recipe.clips.length - 1)))
        setLibrary((old) => ({
          ...old,
          projects: old.projects.map((item) =>
            item.id === project.id ? { ...item, title: next.recipe.title } : item,
          ),
        }))
        setMessage('All changes saved')
      })
    },
    [perform, project, recipe],
  )

  const lastAutosave = useRef<{ recipe: EditRecipe; retry: number } | null>(null)
  useEffect(() => {
    if (
      !dirty ||
      !recipe ||
      busy ||
      !recipeSchema.safeParse(recipe).success ||
      (lastAutosave.current?.recipe === recipe && lastAutosave.current.retry === onlineRetry)
    )
      return
    const timer = window.setTimeout(() => {
      lastAutosave.current = { recipe, retry: onlineRetry }
      save('save')
    }, 750)
    return () => clearTimeout(timer)
  }, [busy, dirty, onlineRetry, recipe, save])

  const sources = library.sources
  const selectedAsset = sources.find((item) => item.id === assetId)
  const images = sources.filter(({ kind }) => kind === 'image')
  const update = (changes: Partial<EditRecipe>) => setRecipe((old) => old && { ...old, ...changes })
  const clip = recipe?.clips[selected]
  const clipStart = recipe ? timelineDuration({ clips: recipe.clips.slice(0, selected) }) : 0
  const preview =
    revisionPreview?.clip === clip && revisionPreview?.project === project?.id
      ? revisionPreview
      : undefined
  const duration = recipe ? timelineDuration(recipe) : 0
  const validation = dirty && recipe ? recipeSchema.safeParse(recipe) : null
  const validationError =
    validation && !validation.success ? validation.error.issues[0]?.message : ''
  const canExport = !busy && !dirty && Boolean(recipe?.clips.length)
  const at = Math.min(Math.max(0, playhead), Math.max(0, duration - 0.1))

  function jumpTo(time: number) {
    if (!recipe) return
    let end = 0
    const index = recipe.clips.findIndex((item) => {
      end += item.out - item.in
      return time < end
    })
    if (index < 0) return
    setSelected(index)
    setSeek({ time })
  }

  function downloadCaptions(format: 'srt' | 'vtt') {
    if (!recipe) return
    const segments = recipe.captions.map(({ start, end, text }, index) => ({
      id: String(index),
      startSeconds: start,
      endSeconds: end,
      text,
    }))
    const text = format === 'srt' ? segmentsToSrt(segments) : segmentsToVtt(segments)
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `creator-captions.${format}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function addClip(asset: EditSource) {
    if (!recipe) return
    const length = Math.min(asset.duration ?? 3, maxTimelineSeconds - duration)
    if (length < 0.1 || recipe.clips.length >= 16)
      return setError('The timeline has reached its clip limit.')
    update({ clips: [...recipe.clips, newClip(asset.id, Math.floor(length * 1000) / 1000)] })
    setSelected(recipe.clips.length)
    setPlayhead(duration)
  }

  function replaceClip(replacement: EditClip) {
    if (recipe)
      update({
        clips: recipe.clips.map((value, index) => (index === selected ? replacement : value)),
      })
  }

  function move(direction: -1 | 1) {
    if (!recipe || !clip) return
    const clips = [...recipe.clips]
    const destination = selected + direction
    if (destination < 0 || destination >= clips.length) return
    ;[clips[selected], clips[destination]] = [clips[destination], clip]
    update({ clips })
    setSeek(undefined)
    setSelected(destination)
    setPlayhead(timelineDuration({ clips: clips.slice(0, destination) }))
  }

  function render(profile: ExportProfile) {
    if (!project || !canExport) return
    void perform(async () => {
      if (recreate) requestKey.current[profile] ??= crypto.randomUUID()
      const item = await captureRequest<EditExportView>(projectURL(project.id), 'POST', {
        action: 'export',
        revision: project.revision,
        profile,
        requestKey: recreate ? requestKey.current[profile] : undefined,
      })
      delete requestKey.current[profile]
      setRecreate(false)
      setResults((old) => [item, ...old.filter(({ id }) => id !== item.id)])
      setMessage(
        item.state === 'ready' ? 'Verified export available.' : 'Export queued for verification.',
      )
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className={label}>
          Project
          <select
            className={field}
            value={openedId ?? ''}
            disabled={loading || busy || dirty}
            onChange={(event) => {
              const id = event.target.value
              if (id) void perform(() => open(id))
            }}
          >
            <option value="" disabled>
              Choose a project
            </option>
            {library.projects.map(({ id, title }) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={hotButton}
          disabled={loading || busy || dirty}
          onClick={() =>
            void perform(async () => {
              const created = await captureRequest<EditProjectView>(endpoint, 'POST', {
                action: 'create',
              })
              await open(created.id, created)
              await refresh()
            })
          }
        >
          New project
        </button>
        {project && (
          <button
            type="button"
            className={button}
            disabled={busy || !dirty || Boolean(validationError)}
            onClick={() => save('save')}
          >
            Save now
          </button>
        )}
        {project && (
          <button
            type="button"
            className={button}
            disabled={busy || dirty || !project.canUndo}
            onClick={() => save('undo')}
          >
            Undo
          </button>
        )}
        {project && (
          <button
            type="button"
            className={button}
            disabled={busy || dirty || !project.canRedo}
            onClick={() => save('redo')}
          >
            Redo
          </button>
        )}
        {project && dirty && (error || validationError) && (
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => void perform(() => open(project.id))}
          >
            Discard local changes and reload
          </button>
        )}
      </div>
      <p role="status">
        {error || validationError || (busy ? 'Working…' : dirty ? 'Unsaved changes' : message)}
      </p>
      {recipe && project && (
        <>
          <TextField name="Project title" value={recipe.title} set={(title) => update({ title })} />
          <section className={panel} aria-label="Timeline">
            <div className="flex flex-wrap items-end gap-2">
              <AssetSelect
                title="Source media"
                assets={sources.filter(({ kind }) => kind !== 'audio')}
                value={assetId}
                set={setAssetId}
                empty="Choose an owned video or still"
              />
              <button
                type="button"
                className={button}
                disabled={!selectedAsset}
                onClick={() => selectedAsset && addClip(selectedAsset)}
              >
                Add clip
              </button>
              {selectedAsset?.kind === 'image' && (
                <button type="button" className={button} onClick={() => setStill(selectedAsset)}>
                  Edit still in miniPaint
                </button>
              )}
              <button type="button" className={button} onClick={() => void perform(refresh)}>
                Refresh sources
              </button>
              <Link href="/studio/record">Record source media</Link>
            </div>
            {recipe.clips.length > 0 && <p>Timeline · {duration.toFixed(2)} s</p>}
            <ol className="flex min-w-0 gap-1 overflow-x-auto">
              {recipe.clips.map((item, index) => (
                <li
                  key={index}
                  style={{ flexGrow: Math.max(0.1, item.out - item.in) }}
                  className="min-w-28"
                >
                  <button
                    type="button"
                    aria-pressed={selected === index}
                    className={`w-full truncate rounded px-2 py-3 text-left text-sm ${selected === index ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-current/10'}`}
                    title={sources.find(({ id }) => id === item.asset)?.title}
                    onClick={() => {
                      setSelected(index)
                      setPlayhead(timelineDuration({ clips: recipe.clips.slice(0, index) }))
                    }}
                  >
                    {index + 1}. {sources.find(({ id }) => id === item.asset)?.title ?? 'Source'} ·{' '}
                    {(item.out - item.in).toFixed(2)} s
                  </button>
                </li>
              ))}
            </ol>
            {clip && (
              <div className="grid gap-4 md:grid-cols-2">
                <ClipPreview
                  key={`${selected}:${clip.asset}`}
                  clip={clip}
                  start={clipStart}
                  source={sources.find(({ id }) => id === clip.asset)}
                  layers={recipe.layers}
                  onTime={setPlayhead}
                  captions={
                    subtitleTrack === 'off'
                      ? []
                      : subtitleTrack === 'revision' && preview
                        ? preview.captions.map((cue) => ({
                            ...cue,
                            start: cue.start + clipStart,
                            end: cue.end + clipStart,
                          }))
                        : recipe.captions
                  }
                  seek={
                    seek && seek.time >= clipStart && seek.time < clipStart + clip.out - clip.in
                      ? seek
                      : undefined
                  }
                />
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={button}
                      type="button"
                      disabled={selected === 0}
                      onClick={() => move(-1)}
                    >
                      Move earlier
                    </button>
                    <button
                      className={button}
                      type="button"
                      disabled={selected === recipe.clips.length - 1}
                      onClick={() => move(1)}
                    >
                      Move later
                    </button>
                    <button
                      className={button}
                      type="button"
                      onClick={() => {
                        update({ clips: recipe.clips.filter((_, index) => index !== selected) })
                        setSelected(Math.max(0, selected - 1))
                      }}
                    >
                      Remove clip
                    </button>
                  </div>
                  <ClipInspector
                    key={`${selected}:${clip.asset}`}
                    clip={clip}
                    set={replaceClip}
                    split={(time) => {
                      const parts = splitClip(clip, time)
                      if (!parts || recipe.clips.length >= 16) {
                        setError(
                          'Split inside the clip with at least 0.1 seconds and room for fades on each side.',
                        )
                        return
                      }
                      setError('')
                      update({
                        clips: [
                          ...recipe.clips.slice(0, selected),
                          ...parts,
                          ...recipe.clips.slice(selected + 1),
                        ],
                      })
                    }}
                  />
                </div>
              </div>
            )}
          </section>

          <details className={panel}>
            <summary>Voiceover</summary>
            {canRecord && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  setRecord(!record)
                  if (record) void perform(refresh)
                }}
              >
                {record ? 'Back to voiceover selection' : 'Open voiceover recorder'}
              </button>
            )}
            {record && <RecorderWorkspace scope={scope} />}
            <AssetSelect
              title="Voiceover source"
              assets={sources.filter(({ kind }) => kind === 'audio')}
              value={recipe.voiceover?.asset ?? ''}
              empty="No voiceover"
              set={(id) => {
                const audio = sources.find((source) => source.id === id)
                update({
                  voiceover: audio
                    ? newVoiceover(id, Math.min(duration, audio.duration ?? 3))
                    : null,
                })
              }}
            />
            {recipe.voiceover &&
              (() => {
                const voice = recipe.voiceover
                const set = (value: Voice) => update({ voiceover: value })
                return (
                  <>
                    <audio
                      controls
                      aria-label="Voiceover source preview"
                      src={sourceURL(voice.asset)}
                    />
                    <div className={grid}>
                      <NumberField
                        name="Voiceover starts at (s)"
                        value={voice.offset}
                        set={(offset) => set({ ...voice, offset })}
                      />
                      <NumberField
                        name="Voiceover source in (s)"
                        value={voice.in}
                        set={(value) => set({ ...voice, in: value })}
                      />
                      <NumberField
                        name="Voiceover source out (s)"
                        value={voice.out}
                        set={(out) => set({ ...voice, out })}
                      />
                      <label>
                        <input
                          type="checkbox"
                          checked={voice.cleanup}
                          onChange={(event) => set({ ...voice, cleanup: event.target.checked })}
                        />{' '}
                        Voice correction
                      </label>
                    </div>
                    <label className={label}>
                      Voiceover playback
                      <select
                        className={field}
                        value={voice.mode ?? 'mix'}
                        onChange={(event) =>
                          set({
                            ...voice,
                            mode: event.target.value === 'replace' ? 'replace' : 'mix',
                          })
                        }
                      >
                        <option value="mix">Mix with source audio</option>
                        <option value="replace">Replace audio (manual dub)</option>
                      </select>
                    </label>
                    <AudioControls item={voice} set={set} />
                  </>
                )
              })()}
          </details>

          <details className={panel}>
            <summary>Text, graphics and brand</summary>
            <Rows name="Layer" items={recipe.layers} set={(layers) => update({ layers })}>
              {(layer, set) => (
                <div className={grid}>
                  {layer.kind === 'graphic' ? (
                    <AssetSelect
                      title="Graphic"
                      assets={images}
                      value={layer.asset}
                      empty="Choose a still"
                      set={(asset) => set({ ...layer, asset })}
                    />
                  ) : (
                    <TextField
                      name={layer.kind === 'brand' ? 'Brand text' : 'Title text'}
                      value={layer.text}
                      set={(text) => set({ ...layer, text })}
                    />
                  )}
                  <NumberField
                    name="Layer start (s)"
                    value={layer.start}
                    set={(start) => set({ ...layer, start })}
                  />
                  <NumberField
                    name="Layer end (s)"
                    value={layer.end}
                    set={(end) => set({ ...layer, end })}
                  />
                  <NumberField
                    name="Layer horizontal position (%)"
                    value={layer.x * 100}
                    max={100}
                    set={(x) => set({ ...layer, x: x / 100 })}
                  />
                  <NumberField
                    name="Layer vertical position (%)"
                    value={layer.y * 100}
                    max={100}
                    set={(y) => set({ ...layer, y: y / 100 })}
                  />
                  {layer.kind === 'graphic' ? (
                    <NumberField
                      name="Graphic width (%)"
                      value={layer.width * 100}
                      min={5}
                      max={90}
                      set={(width) => set({ ...layer, width: width / 100 })}
                    />
                  ) : (
                    <label className={label}>
                      Text color
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(event) => set({ ...layer, color: event.target.value })}
                      />
                    </label>
                  )}
                </div>
              )}
            </Rows>
            <div className="flex flex-wrap gap-2">
              {(['text', 'brand', 'graphic'] as const).map((kind) => (
                <button
                  className={button}
                  type="button"
                  key={kind}
                  disabled={
                    duration < 0.1 ||
                    recipe.layers.length >= 12 ||
                    (kind === 'graphic' && !images.length)
                  }
                  onClick={() => {
                    const timing = { start: at, end: Math.min(duration, at + 3), x: 0.5, y: 0.12 }
                    const layer: Layer =
                      kind === 'graphic'
                        ? { ...timing, kind, asset: images[0].id, width: 0.2 }
                        : {
                            ...timing,
                            kind,
                            text: kind === 'brand' ? 'Brand' : 'Title',
                            color: '#ffffff',
                          }
                    update({ layers: [...recipe.layers, layer] })
                  }}
                >
                  {kind === 'text'
                    ? 'Add title'
                    : kind === 'brand'
                      ? 'Add brand layer'
                      : 'Add graphic'}
                </button>
              ))}
            </div>
          </details>

          <details className={panel}>
            <summary>Captions and chapters</summary>
            {clip && sources.find((item) => item.id === clip.asset)?.kind === 'video' && (
              <SourceTranscript
                key={project?.id + clip.asset}
                project={project.id}
                onPreview={(title, captions) => {
                  setRevisionPreview({ project: project.id, clip, title, captions })
                  setSubtitleTrack('revision')
                }}
                clip={clip}
                recipe={recipe}
                apply={(captions) => update({ captions })}
                seek={(seconds) => jumpTo(clipStart + seconds)}
              />
            )}
            <label className={label}>
              Preview subtitle track
              <select
                className={field}
                value={subtitleTrack === 'revision' && !preview ? 'captions' : subtitleTrack}
                onChange={(event) => setSubtitleTrack(event.target.value)}
              >
                <option value="captions">Creator captions</option>
                {preview && <option value="revision">{preview.title}</option>}
                <option value="off">Off</option>
              </select>
            </label>
            <label className={label}>
              Import WebVTT or SRT (replaces timeline captions)
              <input
                type="file"
                accept=".vtt,.srt"
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (!file) return
                  try {
                    if (file.size > 256 * 1024)
                      throw new Error('Caption files must be under 256 KiB.')
                    const raw = await file.text()
                    const segments = file.name.toLowerCase().endsWith('.vtt')
                      ? parseVtt(raw)
                      : parseSrt(raw)
                    if (!segments.length) throw new Error('No caption cues found.')
                    const captions = segments.map(({ startSeconds, endSeconds, text }) => ({
                      start: startSeconds,
                      end: endSeconds,
                      text,
                    }))
                    const checked = recipeSchema.safeParse({ ...recipe, captions })
                    if (!checked.success) throw new Error(checked.error.issues[0]?.message)
                    setError('')
                    update({ captions })
                  } catch (error) {
                    setError(error instanceof Error ? error.message : 'Caption import failed.')
                  }
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {(['vtt', 'srt'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  className={button}
                  disabled={!recipe.captions.length}
                  onClick={() => downloadCaptions(format)}
                >
                  Download {format.toUpperCase()}
                </button>
              ))}
            </div>
            <Rows name="Caption" items={recipe.captions} set={(captions) => update({ captions })}>
              {(caption, set) => (
                <div className={grid}>
                  <TextField
                    name="Caption text"
                    value={caption.text}
                    set={(text) => set({ ...caption, text })}
                  />
                  <NumberField
                    name="Caption start (s)"
                    value={caption.start}
                    set={(start) => set({ ...caption, start })}
                  />
                  <NumberField
                    name="Caption end (s)"
                    value={caption.end}
                    set={(end) => set({ ...caption, end })}
                  />
                  <button type="button" className={button} onClick={() => jumpTo(caption.start)}>
                    Seek to {caption.start.toFixed(3)}s
                  </button>
                </div>
              )}
            </Rows>
            <button
              type="button"
              className={button}
              disabled={duration < 0.1 || recipe.captions.length >= 150}
              onClick={() => {
                const start = Math.max(at, recipe.captions.at(-1)?.end ?? 0)
                if (duration - start < 0.0999)
                  return setError('Move the previous caption end earlier to add another caption.')
                update({
                  captions: [
                    ...recipe.captions,
                    { start, end: Math.min(duration, start + 2), text: 'Caption' },
                  ],
                })
              }}
            >
              Add caption
            </button>
            <Rows name="Chapter" items={recipe.chapters} set={(chapters) => update({ chapters })}>
              {(chapter, set) => (
                <div className={grid}>
                  <TextField
                    name="Chapter title"
                    value={chapter.title}
                    set={(title) => set({ ...chapter, title })}
                  />
                  <NumberField
                    name="Chapter time (s)"
                    value={chapter.at}
                    set={(at) => set({ ...chapter, at })}
                  />
                </div>
              )}
            </Rows>
            <button
              type="button"
              className={button}
              disabled={duration < 0.1 || recipe.chapters.length >= 24}
              onClick={() => {
                const time = Math.max(at, (recipe.chapters.at(-1)?.at ?? -0.1) + 0.1)
                if (time >= duration)
                  return setError('Move the previous chapter earlier to add another chapter.')
                update({ chapters: [...recipe.chapters, { at: time, title: 'Chapter' }] })
              }}
            >
              Add chapter
            </button>
          </details>

          <section className={panel} aria-label="Thumbnail and exports">
            <div className={grid}>
              <AssetSelect
                title="Thumbnail source"
                assets={images}
                value={recipe.thumbnailAsset ?? ''}
                empty="Choose a frame from the timeline"
                set={(thumbnailAsset) => update({ thumbnailAsset: thumbnailAsset || null })}
              />
              {!recipe.thumbnailAsset && (
                <NumberField
                  name="Thumbnail time (s)"
                  value={recipe.thumbnailAt}
                  set={(thumbnailAt) => update({ thumbnailAt })}
                />
              )}
              {recipe.thumbnailAsset && (
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    setStill(images.find(({ id }) => id === recipe.thumbnailAsset) ?? null)
                  }
                >
                  Edit thumbnail in miniPaint
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={hotButton}
                disabled={!canExport}
                onClick={() => render('landscape')}
              >
                Export landscape MP4
              </button>
              <button
                type="button"
                className={hotButton}
                disabled={!canExport}
                onClick={() => render('vertical')}
              >
                Export vertical MP4
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={recreate}
                  onChange={(event) => setRecreate(event.target.checked)}
                />{' '}
                Render a fresh copy
              </label>
            </div>
            <ul className="space-y-2" aria-label="Export history">
              {results.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {item.profile} · version {item.revision} ·{' '}
                    {item.state === 'ready' ? 'verified' : item.state}
                  </span>
                  {item.error && <span>{item.error}</span>}
                  {item.state === 'ready' && (
                    <>
                      <button className={button} type="button" onClick={() => setOutput(item)}>
                        Play export
                      </button>
                      <a href={`${sourceURL(item.video)}&download=1`}>Download MP4</a>
                      <a href={`${sourceURL(item.thumbnail)}&download=1`}>Download thumbnail</a>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {output && (
              <video
                className="max-h-[65vh] max-w-full"
                aria-label="Verified MP4 preview"
                controls
                playsInline
                src={sourceURL(output.video)}
                poster={sourceURL(output.thumbnail)}
              />
            )}
          </section>
          <ImageEditorModal
            isOpen={Boolean(still)}
            extensions={[]}
            onClose={() => setStill(null)}
            asset={still ? { ...still, url: sourceURL(still.id), siteId } : null}
            saveCopy={async ({ blob, format }) => {
              if (!still) throw new Error('Choose a still to edit.')
              const saved = await captureRequest<{ id: string }>(
                `${projectURL(project.id)}&still=${still.id}`,
                'POST',
                blob,
                { 'content-type': format },
              )
              await refresh()
              if (recipe.thumbnailAsset === still.id) update({ thumbnailAsset: saved.id })
              else setAssetId(saved.id)
              return { assetId: saved.id, url: sourceURL(saved.id) }
            }}
          />
        </>
      )}
    </div>
  )
}
