import {
  captureChunkLimit,
  captureLimit,
  captureMaxChunks,
  captureMime,
  type CaptureChunk,
  type CaptureManifest,
  type CaptureSessionView,
} from './capture-contract'
import { deleteLocalTake, readLocalChunk, writeLocalTake } from './capture-local'

export const captureEndpoint = '/api/creator/capture-sessions'
export const captureURL = (id: string) => captureEndpoint + '?id=' + encodeURIComponent(id)

export async function captureRequest<T>(
  url: string,
  method = 'GET',
  body?: object | Blob,
  extra?: HeadersInit,
) {
  const headers = new Headers(extra)
  if (method !== 'GET') {
    const csrf = document.cookie
      .split('; ')
      .find((item) => item.startsWith('renegade-member-csrf='))
      ?.split('=')[1]
    if (csrf) headers.set('x-member-csrf', decodeURIComponent(csrf))
    if (!(body instanceof Blob)) headers.set('content-type', 'application/json')
  }
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    method === 'POST' && body && 'reviewed' in body ? 90_000 : 15_000,
  )
  try {
    const response = await fetch(url, {
      method,
      headers,
      cache: 'no-store',
      signal: controller.signal,
      body: body instanceof Blob ? body : body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 204) return undefined as T
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Server recording storage is unavailable.')
    return data as T
  } finally {
    clearTimeout(timeout)
  }
}

async function sendChunk(id: string, chunk: CaptureChunk) {
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await chunk.bytes.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
  return captureRequest<CaptureSessionView>(captureURL(id), 'PATCH', chunk.bytes, {
    'content-type': 'application/octet-stream',
    'x-capture-index': String(chunk.index),
    'x-capture-track': chunk.track,
    'x-capture-mime': chunk.mimeType,
    'x-capture-size': String(chunk.bytes.size),
    'x-capture-event-ms': String(chunk.eventMs),
    ...(chunk.timecodeMs === undefined ? {} : { 'x-capture-timecode': String(chunk.timecodeMs) }),
    'x-capture-checksum': 'sha256:' + hash,
  })
}

export class RecordingJournal {
  count = 0
  localCount = 0
  remote?: CaptureSessionView
  remoteError = ''
  localError = ''
  private memory = new Map<number, CaptureChunk>()
  private acceptedBytes = 0
  private pendingBytes = 0
  private queuedCount = 0
  private rejected = false
  private saving = Promise.resolve()
  private syncing?: Promise<CaptureSessionView>
  private discarded = false
  private finished = false
  private db: IDBDatabase | null
  private ceiling = captureLimit

  constructor(
    db: IDBDatabase | null,
    readonly scope: string,
    readonly manifest: CaptureManifest,
    private update: () => void,
  ) {
    this.db = db
  }

  restore(count: number) {
    this.count = this.localCount = this.queuedCount = count
    this.finished = this.manifest.endedMs !== undefined
    return this
  }

  async prepare() {
    if (this.db) {
      try {
        const storage = navigator.storage
        void storage?.persist?.().catch(() => undefined)
        const estimate = await storage?.estimate?.().catch(() => undefined)
        if (estimate?.quota !== undefined && estimate.usage !== undefined) {
          const free = estimate.quota - estimate.usage
          if (free < 8 * 1024 * 1024) throw new Error('Browser storage is nearly full.')
          this.ceiling = Math.min(captureLimit, Math.floor(free * 0.75))
        }
        await writeLocalTake(this.db, { scope: this.scope, manifest: this.manifest, count: 0 })
        return
      } catch {
        this.db = null
      }
    }
    this.ceiling = 24 * 1024 * 1024
    this.localError =
      'Browser storage is unavailable or full. Only server-confirmed chunks can survive closing this tab. Export before leaving.'
    this.update()
  }

  append(data: Omit<CaptureChunk, 'index'>, stop: (reason: string) => void) {
    if (this.rejected) return
    if (!captureMime.test(data.mimeType)) {
      this.rejected = true
      stop('The browser returned an unsupported recording format. Export any earlier data.')
      return
    }
    const count = Math.ceil(data.bytes.size / captureChunkLimit)
    if (
      this.pendingBytes + data.bytes.size > 24 * 1024 * 1024 ||
      this.acceptedBytes + data.bytes.size > this.ceiling ||
      this.queuedCount + count > captureMaxChunks
    ) {
      this.rejected = true
      stop(
        'Recording storage reached its safety limit. The last encoder data could not be kept. Review or export the saved portion.',
      )
      return
    }
    this.pendingBytes += data.bytes.size
    this.acceptedBytes += data.bytes.size
    for (let start = 0; start < data.bytes.size; start += captureChunkLimit) {
      const chunk = {
        ...data,
        index: this.queuedCount++,
        bytes: data.bytes.slice(start, start + captureChunkLimit, data.mimeType),
      }
      this.saving = this.saving.then(async () => {
        if (this.db && !this.localError) {
          try {
            await writeLocalTake(
              this.db,
              { scope: this.scope, manifest: this.manifest, count: chunk.index + 1 },
              chunk,
            )
            this.localCount = chunk.index + 1
          } catch {
            this.localError =
              'Browser storage stopped accepting data. The unsaved tail is only in this tab until it reaches the server or is exported.'
            stop(this.localError)
          }
        }
        if (!this.db || this.localError) this.memory.set(chunk.index, chunk)
        this.pendingBytes -= chunk.bytes.size
        this.count = chunk.index + 1
        this.update()
        if (!this.remoteError) void this.sync().catch(() => undefined)
      })
    }
  }

  checkpoint(final = false) {
    this.saving = this.saving.then(async () => {
      if (this.db && !this.localError) {
        try {
          if (final && !this.localCount) await deleteLocalTake(this.db, this.manifest.key)
          else
            await writeLocalTake(this.db, {
              scope: this.scope,
              manifest: this.manifest,
              count: this.localCount,
            })
        } catch {
          if (final) {
            this.localError =
              'The browser kept the committed chunks but could not save the stop marker. The take may appear interrupted after reopening.'
          }
        }
      }
      this.update()
      if (final) {
        this.finished = true
        if (this.count && !this.remoteError)
          void this.sync()
            .then(() => this.sync())
            .catch(() => undefined)
      }
    })
    return this.saving
  }

  async stopSync() {
    this.discarded = true
    await this.syncing?.catch(() => undefined)
    return this.remote
  }

  async chunk(index: number): Promise<CaptureChunk | undefined> {
    return (
      this.memory.get(index) ??
      (this.db ? readLocalChunk(this.db, this.manifest.key, index) : undefined)
    )
  }

  sync(): Promise<CaptureSessionView> {
    if (this.syncing) return this.syncing
    this.syncing = this.upload()
      .catch((error: Error) => {
        this.remoteError = error.message || 'Server sync interrupted. Retry when connected.'
        throw error
      })
      .finally(() => {
        this.syncing = undefined
        this.update()
      })
    return this.syncing
  }

  private async upload() {
    if (this.discarded) throw new Error('This recording backup was discarded.')
    if (!this.remote || this.remoteError) {
      this.remote = await captureRequest<CaptureSessionView>(captureEndpoint, 'POST', {
        manifest: this.manifest,
      })
    }
    this.remoteError = ''
    if (this.remote.state === 'completed') return this.remote
    if (this.remote.state !== 'open')
      throw new Error('Server staging is closed. Export the local backup.')
    while (!this.discarded && this.remote.received < this.count) {
      const chunk = await this.chunk(this.remote.received)
      if (!chunk)
        throw new Error('A local recording chunk is missing. Review the server copy if available.')
      this.remote = await sendChunk(this.remote.id, chunk)
      this.update()
    }
    if (!this.discarded && this.finished && this.count && this.remote.endedMs === undefined) {
      this.remote = await captureRequest<CaptureSessionView>(
        captureURL(this.remote.id) + '&seal=1',
        'POST',
        {
          count: this.count,
          manifest: this.manifest,
        },
      )
    }
    return this.remote
  }
}
