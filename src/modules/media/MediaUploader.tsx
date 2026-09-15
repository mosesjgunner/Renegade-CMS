'use client'

import { useRef, useState } from 'react'

type Props = {
  siteId: string
  onComplete?: (asset: { id: string; url: string }) => void
  accept?: string
}
type Upload = {
  name: string
  progress: number
  state: 'uploading' | 'complete' | 'failed' | 'cancelled'
  error?: string
  cancel?: () => void
  retry?: () => void
}

const digest = async (file: File) => {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return `sha256:${[...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/** Reusable, keyboard-accessible uploader. It exposes asset URLs, never storage keys or raw object IDs. */
export function MediaUploader({ siteId, onComplete, accept }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const start = async (file: File) => {
    let aborted = false
    let sessionId = ''
    const update = (patch: Partial<Upload>) =>
      setUploads((all) =>
        all.map((item) => (item.name === file.name ? { ...item, ...patch } : item)),
      )
    const retry = () => {
      void start(file)
    }
    const cancel = () => {
      aborted = true
      if (sessionId) void fetch(`/api/media/sessions/${sessionId}`, { method: 'DELETE' })
      update({ state: 'cancelled' })
    }
    setUploads((all) => [
      ...all.filter((item) => item.name !== file.name),
      { name: file.name, progress: 0, state: 'uploading', cancel, retry },
    ])
    try {
      const checksum = await digest(file)
      const resumeKey = `renegade.media-upload:${siteId}:${checksum}`
      const remembered = sessionStorage.getItem(resumeKey)
      let received = new Set<number>()
      let chunkSize = 0
      if (remembered) {
        const resumed = await fetch(`/api/media/sessions/${remembered}`)
        const resumedBody = await resumed.json()
        if (
          resumed.ok &&
          resumedBody.session.state === 'open' &&
          Number(resumedBody.session.expectedSize) === file.size
        ) {
          sessionId = remembered
          chunkSize = Number(resumedBody.session.chunkSize)
          received = new Set((resumedBody.session.receivedChunks ?? []).map(Number))
        } else sessionStorage.removeItem(resumeKey)
      }
      if (!sessionId) {
        const created = await fetch('/api/media/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            siteId,
            filename: file.name,
            title: file.name,
            size: file.size,
            checksum,
          }),
        })
        const createdBody = await created.json()
        if (!created.ok) throw new Error(createdBody.error)
        sessionId = createdBody.session.id
        chunkSize = Number(createdBody.session.chunkSize)
        sessionStorage.setItem(resumeKey, sessionId)
      }
      for (let index = 0, offset = 0; offset < file.size; index++, offset += chunkSize) {
        if (aborted) return
        if (received.has(index)) {
          update({
            progress: Math.round((Math.min(offset + chunkSize, file.size) / file.size) * 100),
          })
          continue
        }
        const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize))
        const response = await fetch(`/api/media/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: {
            'content-range': `bytes ${offset}-${offset + chunk.size - 1}/${file.size}`,
            'x-upload-chunk-index': String(index),
          },
          body: chunk,
        })
        if (!response.ok) throw new Error((await response.json()).error || 'Chunk upload failed.')
        update({ progress: Math.round(((offset + chunk.size) / file.size) * 100) })
      }
      const finalized = await fetch(`/api/media/sessions/${sessionId}`, { method: 'POST' })
      const body = await finalized.json()
      if (!finalized.ok) throw new Error(body.error || 'Finalization failed.')
      sessionStorage.removeItem(resumeKey)
      update({ progress: 100, state: 'complete' })
      onComplete?.({ id: body.asset.id, url: body.url })
    } catch (error) {
      if (!aborted)
        update({
          state: 'failed',
          error: error instanceof Error ? error.message : 'Upload failed.',
          retry,
        })
    }
  }
  const select = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) void start(file)
  }
  return (
    <section
      aria-label="Media uploader"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        select(event.dataTransfer.files)
      }}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(event) => select(event.target.files)}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') input.current?.click()
        }}
      >
        Choose files or drop files here
      </button>
      <p id="media-upload-help">
        Files are validated by their actual contents. You can cancel and retry safely.
      </p>
      <ul aria-live="polite">
        {uploads.map((upload) => (
          <li key={upload.name}>
            <span>
              {upload.name}: {upload.state === 'uploading' ? `${upload.progress}%` : upload.state}
            </span>
            {upload.state === 'uploading' && (
              <button type="button" onClick={upload.cancel}>
                Cancel
              </button>
            )}
            {upload.state === 'failed' && (
              <>
                <span role="alert">{upload.error}</span>
                <button type="button" onClick={upload.retry}>
                  Retry
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
