import { useState } from 'react'
import { captureRequest } from './capture-sync'
import type { captionSource } from './media-edit-captions'
import { recipeSchema, type EditClip, type EditRecipe } from './media-edit-recipe'

const endpoint = '/api/creator-studio/media-edits'
type Results = Awaited<ReturnType<typeof captionSource>>

export function SourceTranscript({
  clip,
  project,
  onPreview,
  recipe,
  apply,
  seek,
}: {
  project?: string
  onPreview: (title: string, captions: EditRecipe['captions']) => void
  clip: EditClip
  recipe: EditRecipe
  apply: (captions: EditRecipe['captions']) => void
  seek: (seconds: number) => void
}) {
  const [data, setData] = useState<Results>()
  const [revisionId, setRevisionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [assistOptIn, setAssistOptIn] = useState(false)
  const [language, setLanguage] = useState('')
  const [speakerPermission, setSpeakerPermission] = useState(false)
  const [voiceConsent, setVoiceConsent] = useState(false)
  const run = async (action?: string, extra?: object) => {
    setBusy(true)
    setStatus('')
    try {
      if (action) {
        await captureRequest(endpoint + '?transcript=' + clip.asset, 'POST', {
          action,
          ...(['translate-subtitles', 'suggest-clips'].includes(action)
            ? {
                optIn: assistOptIn,
                revision: revisionId,
                ...(action === 'translate-subtitles' ? { language } : {}),
              }
            : { optIn }),
          ...(action === 'save-transcript' ? { recipe } : {}),
          ...extra,
        })
        const messages: Record<string, string> = {
          'save-transcript': 'Reviewed revision saved.',
          'grant-dub-consent': 'Voice permission saved for this project and revision.',
          'review-dub': 'Synthetic dub reviewed.',
          'revoke-dub': 'Voice permission revoked.',
        }
        setStatus(messages[action] ?? 'Queued. Refresh to check for results.')
      }
      setData(await captureRequest<Results>(endpoint + '?asset=' + clip.asset + '&transcript=1'))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Request failed.')
    } finally {
      setBusy(false)
    }
  }
  const revision = data?.revisions.find(({ id }) => id === revisionId)
  const revisionCaptions =
    revision?.segments
      .filter((item) => item.endSeconds > clip.in && item.startSeconds < clip.out)
      .map((item) => ({
        start: Math.max(item.startSeconds, clip.in) - clip.in,
        end: Math.min(item.endSeconds, clip.out) - clip.in,
        text: item.text,
      })) ?? []
  const waveform = data?.peaks
  const singleClip = recipe.clips.length === 1
  const bars = waveform
    ? Array.from({ length: 120 }, (_, index) => {
        const length = clip.out - clip.in
        const from = Math.floor((clip.in + (length * index) / 120) * waveform.peaksPerSecond)
        const to = Math.ceil((clip.in + (length * (index + 1)) / 120) * waveform.peaksPerSecond)
        let peak = 0
        for (let sample = from; sample < Math.min(to, waveform.max.length); sample++)
          peak = Math.max(peak, waveform.max[sample], -waveform.min[sample])
        return peak
      })
    : []
  const button = 'rounded border border-current/30 px-3 py-1 disabled:opacity-40'
  return (
    <fieldset className="space-y-3" disabled={busy}>
      <legend>Source transcript and waveform</legend>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => void run()}>
          Refresh source results
        </button>
        <button type="button" className={button} onClick={() => void run('waveform')}>
          Queue waveform
        </button>
        <button
          type="button"
          className={button}
          disabled={!singleClip || !recipe.captions.length}
          onClick={() => void run('save-transcript')}
        >
          Save captions as reviewed revision
        </button>
      </div>
      <label className="block">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(event) => setOptIn(event.target.checked)}
        />{' '}
        Allow the configured transcription provider to process this source
      </label>
      <button
        type="button"
        className={button}
        disabled={!optIn}
        onClick={() => void run('transcribe')}
      >
        Queue transcription draft
      </button>
      {status && <p role="status">{status}</p>}
      {!!data?.jobs.length && (
        <ul aria-label="Source worker requests">
          {data.jobs.map(({ id, task, status }) => (
            <li key={id}>
              {task} ? {status}
            </li>
          ))}
        </ul>
      )}
      {bars.length > 0 && (
        <div
          className="flex h-20 items-center gap-px"
          role="img"
          aria-label="Selected clip audio waveform"
        >
          {bars.map((peak, index) => (
            <span
              key={index}
              className="flex-1 bg-current"
              style={{ height: Math.max(1, peak * 100) + '%' }}
            />
          ))}
        </div>
      )}
      {!!data?.revisions.length && (
        <label className="block">
          Source transcript revision
          <select
            className="ml-2 border bg-transparent"
            value={revisionId}
            onChange={(event) => {
              setRevisionId(event.target.value)
              setAssistOptIn(false)
              setSpeakerPermission(false)
              setVoiceConsent(false)
            }}
          >
            <option value="">Select a revision</option>
            {data.revisions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.review} · {item.source} · {item.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {revision?.review === 'reviewed' && (
        <div className="space-y-2 border-t border-current/20 pt-3">
          <label className="block">
            <input
              type="checkbox"
              checked={assistOptIn}
              onChange={(event) => setAssistOptIn(event.target.checked)}
            />{' '}
            Allow the configured transcript adapter to process this revision?s text and timing
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={!assistOptIn}
              onClick={() => void run('suggest-clips')}
            >
              Suggest clip ranges
            </button>
            <label>
              Subtitle language
              <input
                className="ml-2 rounded border bg-transparent px-2"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                maxLength={35}
                placeholder="fr"
              />
            </label>
            <button
              type="button"
              className={button}
              disabled={!assistOptIn || !language.trim()}
              onClick={() => void run('translate-subtitles')}
            >
              Queue subtitle translation draft
            </button>
          </div>
        </div>
      )}
      {!!data?.assists.length && (
        <ul aria-label="Transcript assist requests">
          {data.assists.map(({ id, title, status, output }) => {
            const result = output as {
              adapter?: string
              clips?: { start: number; end: number; reason: string }[]
            } | null
            return (
              <li key={id}>
                {title === 'suggest-clips' ? 'Clip suggestions' : 'Subtitle translation'} ? {status}
                {result?.adapter && ' ? ' + result.adapter}
                {result?.clips && (
                  <ul>
                    {result.clips.map(({ start, end, reason }, index) => (
                      <li key={index}>
                        <button
                          type="button"
                          className={button}
                          disabled={start < clip.in || start >= clip.out}
                          onClick={() => seek(start - clip.in)}
                        >
                          {start.toFixed(3)}?{end.toFixed(3)}s
                        </button>{' '}
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {project && data?.synthetic.voice && revision?.review === 'reviewed' && singleClip && (
        <details className="space-y-2 border-t border-current/20 pt-3" key={revision.id}>
          <summary>Synthetic dubbing with your verified voice</summary>
          <p>
            Voice {data.synthetic.voice}. This sends the selected transcript text and timings to the
            configured dubbing adapter and creates a separate synthetic WAV for review.
          </p>
          <label className="block">
            <input
              type="checkbox"
              checked={speakerPermission}
              onChange={(event) => setSpeakerPermission(event.target.checked)}
            />{' '}
            I am the enrolled speaker and give permission to synthesize my voice.
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={voiceConsent}
              onChange={(event) => setVoiceConsent(event.target.checked)}
            />{' '}
            I authorize this voice for this edit session and transcript revision.
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={!speakerPermission || !voiceConsent}
              onClick={() =>
                void run('grant-dub-consent', {
                  project,
                  revision: revision.id,
                  voice: data.synthetic.voice,
                  speakerPermission,
                  sessionVoiceConsent: voiceConsent,
                })
              }
            >
              Save voice permission
            </button>
            <button
              type="button"
              className={button}
              onClick={() =>
                void run('synthetic-dub', {
                  project,
                  revision: revision.id,
                  voice: data.synthetic.voice,
                })
              }
            >
              Queue synthetic dub
            </button>
          </div>
        </details>
      )}
      {data?.synthetic.dubs
        .filter((dub) => dub.project === project)
        .map((dub) => (
          <div key={dub.id} className="space-y-2 border-t border-current/20 pt-3">
            <p>Synthetic dub ? {dub.reviewed ? 'reviewed' : dub.status}</p>
            {dub.status === 'completed' && (
              <>
                <audio
                  controls
                  preload="none"
                  aria-label="Synthetic dub review"
                  src={endpoint + '?dub=' + dub.id}
                />
                {dub.reviewed ? (
                  <a className={button} href={endpoint + '?dub=' + dub.id + '&download=1'}>
                    Download reviewed synthetic WAV
                  </a>
                ) : (
                  <button
                    type="button"
                    className={button}
                    onClick={() => void run('review-dub', { dub: dub.id, reviewed: true })}
                  >
                    Mark synthetic dub reviewed
                  </button>
                )}
              </>
            )}
            {dub.status !== 'cancelled' && (
              <button
                type="button"
                className={button}
                onClick={() => void run('revoke-dub', { dub: dub.id })}
              >
                Revoke voice permission
              </button>
            )}
          </div>
        ))}
      {revision && (
        <>
          <button
            type="button"
            className={button}
            disabled={!revisionCaptions.length}
            onClick={() => onPreview(revision.title, revisionCaptions)}
          >
            Preview this subtitle revision
          </button>
          <ol className="max-h-64 overflow-auto">
            {revision.segments.map((segment) => (
              <li key={segment.id}>
                <button
                  type="button"
                  className={button}
                  disabled={segment.endSeconds <= clip.in || segment.startSeconds >= clip.out}
                  onClick={() => seek(Math.max(0, segment.startSeconds - clip.in))}
                >
                  {segment.startSeconds.toFixed(3)}s
                </button>{' '}
                {segment.text}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className={button}
            disabled={!singleClip}
            onClick={() => {
              const captions = revisionCaptions
              const checked = recipeSchema.safeParse({ ...recipe, captions })
              if (!captions.length || !checked.success) {
                setStatus(
                  checked.success
                    ? 'No cues within the selected clip.'
                    : (checked.error.issues[0]?.message ?? 'Invalid captions.'),
                )
                return
              }
              setStatus('Revision copied to timeline captions.')
              apply(captions)
            }}
          >
            Replace timeline captions with this revision
          </button>
        </>
      )}
    </fieldset>
  )
}
