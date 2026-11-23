'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'

export default function StudioUploadPage() {
  const [file, setFile] = useState<File>()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number>()
  const [message, setMessage] = useState('')
  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || busy) return
    const fields = new FormData(event.currentTarget)
    const title = String(fields.get('title') ?? '').trim() || file.name.replace(/\.[^.]+$/, '')
    const url = new URL('/api/creator-studio/library-upload', location.origin)
    url.searchParams.set('title', title)
    url.searchParams.set('alt', String(fields.get('alt') ?? ''))
    const checksum = String(fields.get('checksum') ?? '').trim()
    if (checksum) {
      url.searchParams.set('checksum', checksum)
      if (fields.get('rights')) url.searchParams.set('rights', 'confirmed')
    }
    const request = new XMLHttpRequest()
    request.open('POST', url)
    const token = document.cookie.match(/(?:^|;\s*)renegade-member-csrf=([^;]+)/)?.[1]
    request.setRequestHeader('x-member-csrf', token ? decodeURIComponent(token) : '')
    request.setRequestHeader('content-type', file.type || 'application/octet-stream')
    request.responseType = 'json'
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(event.loaded / event.total)
    }
    request.onload = () => {
      setBusy(false)
      setMessage(
        request.status === 201
          ? 'Saved to your private library.'
          : (request.response?.error ?? 'Upload failed. Try again.'),
      )
    }
    request.onerror = () => {
      setBusy(false)
      setMessage('The upload was interrupted. Try again.')
    }
    setBusy(true)
    setProgress(0)
    setMessage('')
    request.send(file)
  }
  const field = 'block w-full rounded border p-2'
  return (
    <main className="mx-auto max-w-xl space-y-5 p-4 sm:p-6">
      <h1 className="text-3xl font-bold">Upload</h1>
      <form onSubmit={upload}>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">
            File
            <input
              className={field}
              required
              type="file"
              accept="image/png,image/jpeg,image/webp,audio/wav,audio/mp4,audio/ogg,audio/mpeg,audio/webm,video/mp4,video/webm,video/quicktime"
              onChange={(event) => setFile(event.target.files?.[0])}
            />
          </label>
          <label className="block">
            Title (optional)
            <input className={field} name="title" maxLength={160} placeholder={file?.name} />
          </label>
          {file && (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)) && (
            <label className="block">
              Describe what is in the image
              <input className={field} name="alt" maxLength={500} required />
            </label>
          )}
          <details className="space-y-2">
            <summary>Restore a file from a project export</summary>
            <label className="block">
              File checksum
              <input className={field} name="checksum" maxLength={71} placeholder="sha256:?" />
            </label>
            <label className="flex gap-2">
              <input type="checkbox" name="rights" />I have permission to restore this file.
            </label>
          </details>
          <button className="btn btn-primary" type="submit">
            Upload to my library
          </button>
        </fieldset>
      </form>
      {busy && (
        <div className="space-y-1">
          <progress aria-label="Upload progress" value={progress} max={1} />
          <p role="status">{progress === 1 ? 'Preparing your file…' : 'Uploading…'}</p>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <div className="flex flex-wrap gap-4">
        <Link className="underline" href="/studio">
          My Studio
        </Link>
        <Link className="underline" href="/studio/submissions">
          Send files to a publishing destination
        </Link>
      </div>
    </main>
  )
}
