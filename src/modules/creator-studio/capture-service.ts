import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import type { Payload, Where } from 'payload'

import type { MediaUploadSession } from '@/payload-types'
import type { AppConfig } from '../core/config'
import { resolveFfmpegBinary, resolveFfprobeBinary } from '../media/ffmpeg'
import { mediaStorage } from '../media/storage'
import {
  sha256,
  stageUploadChunk,
  uploadDirectory,
  uploadLifetimeMs,
  uploadSessionLock,
  withUploadLock,
} from '../media/upload-staging'
import { MediaWorkflowError, persistReviewedCreatorMedia } from '../media/workflow'
import {
  captureChunkLimit,
  captureExtension,
  captureLimit,
  captureMaxChunks,
  captureMime,
  captureModes,
  captureTrackIds,
  type CaptureManifest,
  type CaptureSessionView,
  type CaptureTrackId,
} from './capture-contract'
import { authorizeCreator } from './policy'
import { scanSubmissionSource } from './submission-source'
import { privateHeaders } from './submission-http'
import { relationId, uuid, type SubmissionActor } from './submission-targets'

const collection = 'media-upload-sessions' as const
const access = { depth: 0, overrideAccess: true } as const
const run = promisify(execFile)
const unavailable = () => new MediaWorkflowError('Recording unavailable.', 404)
const invalid = () => new MediaWorkflowError('Invalid recording manifest or chunk.', 400)
const conflict = (message: string) => new MediaWorkflowError(message, 409)

type Entry = {
  track: CaptureTrackId
  mimeType: string
  size: number
  checksum: string
  eventMs: number
  timecodeMs?: number
}
type Stored = {
  manifest: CaptureManifest
  sources?: Record<string, string>
  masterHasVideo?: boolean
}

const details = (row: MediaUploadSession) => row.creatorDetails as Stored
const entries = (row: MediaUploadSession) => (row.chunkManifest ?? {}) as Record<string, Entry>
const actorFilter = (actor: SubmissionActor): Where[] => [
  { site: { equals: actor.siteId } },
  { owner: { equals: actor.memberId } },
]
const recordingFilter = { creatorKey: { like: 'capture:' } }

export async function captureAccess(payload: Payload, actor: SubmissionActor) {
  try {
    return await authorizeCreator(payload, { ...actor, capability: 'media.upload' })
  } catch {
    throw new MediaWorkflowError('Recording storage access denied.', 403)
  }
}

function view(row: MediaUploadSession): CaptureSessionView {
  const { manifest, masterHasVideo } = details(row)
  return {
    id: row.id,
    key: manifest.key,
    mode: manifest.mode,
    createdAt: manifest.createdAt,
    state: row.state,
    received: Object.keys(entries(row)).length,
    bytes: row.receivedBytes,
    limit: row.expectedSize,
    expiresAt: row.expiresAt,
    endedMs: manifest.endedMs,
    endReason: manifest.endReason,
    hasVideo: masterHasVideo,
    asset: relationId(row.asset) || undefined,
  }
}

async function owned(payload: Payload, actor: SubmissionActor, id: string) {
  if (!uuid.test(id)) throw unavailable()
  const row = await payload.findByID({ collection, id, ...access }).catch(() => null)
  if (
    !row?.creatorKey?.startsWith('capture:') ||
    relationId(row.site) !== actor.siteId ||
    relationId(row.owner) !== actor.memberId
  ) {
    throw unavailable()
  }
  await captureAccess(payload, actor)
  return row
}

const maxClock = 24 * 60 * 60 * 1000
const clock = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maxClock
const iso = (value: unknown) =>
  typeof value === 'string' && value.length === 24 && Number.isFinite(Date.parse(value))

function readManifest(value: unknown): CaptureManifest {
  const data = value as CaptureManifest | undefined
  if (
    !data ||
    data.version !== 1 ||
    typeof data.key !== 'string' ||
    !uuid.test(data.key) ||
    !captureModes.includes(data.mode) ||
    !iso(data.createdAt) ||
    !iso(data.localConsentAt) ||
    !Array.isArray(data.tracks) ||
    !data.tracks.length ||
    data.tracks.length > captureTrackIds.length ||
    new Set(data.tracks.map((track) => track?.id)).size !== data.tracks.length ||
    !data.tracks.some((track) => track?.id === 'master') ||
    !Array.isArray(data.orientation) ||
    data.orientation.length > 64 ||
    !Array.isArray(data.pauses) ||
    data.pauses.length > 128 ||
    (data.endedMs !== undefined && !clock(data.endedMs)) ||
    (data.endReason !== undefined &&
      (typeof data.endReason !== 'string' || data.endReason.length > 320))
  ) {
    throw invalid()
  }
  if (
    (['audio', 'video'].includes(data.mode) && data.tracks.length !== 1) ||
    (data.mode === 'screen' && data.tracks.some((track) => track?.id === 'camera')) ||
    (data.mode === 'screen-camera' &&
      !['screen', 'camera'].every((id) => data.tracks.some((track) => track?.id === id)))
  )
    throw invalid()
  for (const track of data.tracks) {
    const roles = {
      master: 'program',
      camera: 'camera',
      screen: 'screen',
      mic: 'host',
      system: 'screen',
    }
    if (
      !track ||
      !captureTrackIds.includes(track.id) ||
      track.role !== roles[track.id] ||
      typeof track.mimeType !== 'string' ||
      (track.mimeType !== '' && !captureMime.test(track.mimeType)) ||
      !clock(track.startedMs) ||
      !Array.isArray(track.settings) ||
      track.settings.length > 2
    )
      throw invalid()
    for (const setting of track.settings) {
      if (!setting || !['audio', 'video'].includes(setting.kind)) throw invalid()
      for (const key of ['width', 'height', 'frameRate', 'sampleRate', 'channelCount'] as const) {
        if (setting[key] !== undefined && !clock(setting[key])) throw invalid()
      }
      for (const key of ['facingMode', 'displaySurface'] as const) {
        if (
          setting[key] !== undefined &&
          (typeof setting[key] !== 'string' || setting[key].length > 32)
        )
          throw invalid()
      }
      if (
        Object.keys(setting).some(
          (key) =>
            ![
              'kind',
              'width',
              'height',
              'frameRate',
              'sampleRate',
              'channelCount',
              'facingMode',
              'displaySurface',
            ].includes(key),
        )
      )
        throw invalid()
    }
  }
  if (
    data.orientation.some(
      (item) =>
        !item ||
        !clock(item.atMs) ||
        !Number.isFinite(item.angle) ||
        Math.abs(item.angle) > 360 ||
        typeof item.portrait !== 'boolean',
    ) ||
    data.pauses.some(
      (item) =>
        !item ||
        !clock(item.atMs) ||
        (item.resumedMs !== undefined && (!clock(item.resumedMs) || item.resumedMs < item.atMs)),
    )
  )
    throw invalid()
  return data
}

export async function listRecordings(payload: Payload, actor: SubmissionActor) {
  await captureAccess(payload, actor)
  const { docs } = await payload.find({
    collection,
    ...access,
    limit: 50,
    sort: '-createdAt',
    where: { and: [...actorFilter(actor), recordingFilter] },
  })
  return docs.map(view)
}

export async function createRecording(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  body: Record<string, unknown>,
) {
  const manifest = readManifest(body.manifest)
  const creatorKey =
    'capture:' + sha256(Buffer.from(JSON.stringify([actor.siteId, actor.memberId, manifest.key])))
  return withUploadLock(payload, `creator-quota:${actor.siteId}:${actor.memberId}`, async () => {
    const { quota } = await captureAccess(payload, actor)
    const previous = (
      await payload.find({
        collection,
        ...access,
        limit: 1,
        where: { creatorKey: { equals: creatorKey } },
      })
    ).docs[0]
    if (previous) {
      if (
        details(previous).manifest.mode !== manifest.mode ||
        details(previous).manifest.localConsentAt !== manifest.localConsentAt
      )
        throw conflict('Recording identifier is already in use.')
      return view(previous)
    }
    const {
      rows: [usage],
    } = await payload.db.pool.query<{ count: string; bytes: string; active: string }>(
      `SELECT count(*) AS count, coalesce(sum(expected_size), 0) AS bytes,
        count(*) FILTER (WHERE creator_key LIKE 'capture:%' AND state <> 'completed') AS active
        FROM media_upload_sessions WHERE site_id=$1 AND owner_id=$2 AND creator_key IS NOT NULL
        AND (state='completed' OR (state IN ('open','failed','finalizing') AND expires_at>now()))`,
      [actor.siteId, actor.memberId],
    )
    const limit = Math.min(
      captureLimit,
      config.storage.maxUploadBytes,
      (quota.bytes ?? 0) - Number(usage.bytes),
    )
    if (
      Number(usage.count) >= (quota.uploadCount ?? 0) ||
      Number(usage.active) >= (quota.concurrentRecordings ?? 0) ||
      limit < 1
    )
      throw new MediaWorkflowError(
        'Your site recording quota is full. You can still export locally.',
        413,
      )
    const row = await payload.create({
      collection,
      ...access,
      data: {
        site: actor.siteId,
        owner: actor.memberId,
        filename: 'browser-recording',
        title: 'Studio recording',
        expectedSize: limit,
        receivedBytes: 0,
        receivedChunks: [],
        chunkSize: captureChunkLimit,
        chunkManifest: {},
        creatorKey,
        creatorDetails: { manifest: { ...manifest, endedMs: undefined, endReason: undefined } },
        state: 'open',
        expiresAt: new Date(Date.now() + uploadLifetimeMs).toISOString(),
      },
    })
    return view(row)
  })
}

function assertOpen(row: MediaUploadSession) {
  if (Date.parse(row.expiresAt) <= Date.now())
    throw new MediaWorkflowError(
      'Server staging expired. Export the local backup if available.',
      410,
    )
  if (row.state !== 'open') throw conflict('Recording is closed.')
}

export async function writeRecordingChunk(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  id: string,
  headers: Headers,
  read: (size: number) => Promise<Buffer>,
) {
  assertOpen(await owned(payload, actor, id))
  const index = Number(headers.get('x-capture-index') ?? NaN)
  const track = headers.get('x-capture-track') as CaptureTrackId
  const mimeType = headers.get('x-capture-mime') ?? ''
  const size = Number(headers.get('x-capture-size'))
  const eventMs = Number(headers.get('x-capture-event-ms') ?? NaN)
  const timecode = headers.get('x-capture-timecode')
  const timecodeMs = timecode === null ? undefined : Number(timecode)
  const checksum = headers.get('x-capture-checksum') ?? ''
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= captureMaxChunks ||
    !captureTrackIds.includes(track) ||
    !captureMime.test(mimeType) ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > captureChunkLimit ||
    !clock(eventMs) ||
    (timecodeMs !== undefined && !clock(timecodeMs)) ||
    !/^sha256:[a-f0-9]{64}$/.test(checksum)
  )
    throw invalid()
  const bytes = await read(size)
  if (sha256(bytes) !== checksum) throw invalid()
  return withUploadLock(payload, uploadSessionLock(id), async () => {
    const row = await owned(payload, actor, id)
    assertOpen(row)
    const manifest = entries(row)
    const entry = { track, mimeType, size, checksum, eventMs, timecodeMs }
    if (manifest[index]) {
      const original = manifest[index]
      if (
        Object.keys(entry).some((key) => entry[key as keyof Entry] !== original[key as keyof Entry])
      )
        throw conflict('A chunk already exists with different bytes or timing.')
      return view(row)
    }
    if (details(row).manifest.endedMs !== undefined) throw conflict('Recording has stopped.')
    if (
      index !== Object.keys(manifest).length ||
      !details(row).manifest.tracks.some((item) => item.id === track)
    )
      throw conflict('The recording needs the next contiguous chunk.')
    if (row.receivedBytes + size > row.expectedSize)
      throw new MediaWorkflowError('Server recording quota reached. Export the local backup.', 413)
    await stageUploadChunk(uploadDirectory(config, id), index, bytes, true)
    return view(
      await payload.update({
        collection,
        id,
        ...access,
        data: {
          chunkManifest: { ...manifest, [index]: entry },
          receivedBytes: row.receivedBytes + size,
        },
      }),
    )
  })
}

async function assemble(directory: string, track: CaptureTrackId, chunks: [string, Entry][]) {
  const filename = path.join(directory, `source-${track}`)
  const hash = createHash('sha256')
  async function* parts() {
    for (const [index, entry] of chunks) {
      const bytes = await readFile(path.join(directory, `${index}.part`))
      if (bytes.length !== entry.size || sha256(bytes) !== entry.checksum)
        throw conflict('A stored recording chunk failed its integrity check.')
      hash.update(bytes)
      yield bytes
    }
  }
  await pipeline(parts(), createWriteStream(filename, { mode: 0o600 }))
  return { filename, size: (await stat(filename)).size, checksum: 'sha256:' + hash.digest('hex') }
}

const inputFlags = (mimeType: string) => {
  const format = mimeType.split(';')[0].split('/')[1]
  if (!['webm', 'mp4', 'ogg'].includes(format)) throw invalid()
  return [
    '-protocol_whitelist',
    'file',
    '-max_alloc',
    '67108864',
    '-f',
    format === 'webm' ? 'matroska' : format === 'mp4' ? 'mov' : 'ogg',
    ...(format === 'mp4' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []),
  ]
}

async function probe(filename: string, mimeType: string) {
  const { stdout } = await run(
    resolveFfprobeBinary(),
    [
      '-v',
      'error',
      ...inputFlags(mimeType),
      '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels,avg_frame_rate:stream_side_data=rotation',
      '-of',
      'json',
      filename,
    ],
    { timeout: 15_000, maxBuffer: 64 * 1024 },
  )
  const { streams, format } = JSON.parse(stdout) as {
    streams?: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }>
    format?: { duration?: string }
  }
  const video = streams?.find((stream) => stream.codec_type === 'video')
  const audio = streams?.find((stream) => stream.codec_type === 'audio')
  if (
    !streams ||
    streams.length > 2 ||
    streams.length !== Number(Boolean(video)) + Number(Boolean(audio)) ||
    (video &&
      (!(video.width && video.height) ||
        video.width * video.height > 24_000_000 ||
        !['h264', 'hevc', 'av1', 'vp8', 'vp9'].includes(video.codec_name))) ||
    (audio && !['aac', 'opus', 'vorbis', 'flac'].includes(audio.codec_name))
  )
    throw invalid()
  if (!video && !audio) throw invalid()
  const kind = video ? ('video' as const) : ('audio' as const)
  return {
    streams,
    kind,
    width: video?.width,
    height: video?.height,
    duration: Number(format?.duration),
    mimeType: kind + '/' + mimeType.split(';')[0].split('/')[1],
  }
}

async function storeTrack(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  row: MediaUploadSession,
  name: string,
  file: { filename: string; size: number; checksum: string },
  inspection: Awaited<ReturnType<typeof probe>>,
) {
  const source = `creator-capture:${row.id}:${name}`
  const existing = (
    await payload.find({
      collection: 'media-assets',
      ...access,
      limit: 1,
      where: { and: [...actorFilter(actor), { source: { equals: source } }] },
    })
  ).docs[0]
  if (existing) {
    if (existing.checksum !== file.checksum)
      throw conflict('A previously saved track has different bytes.')
    return existing.id
  }
  const extension = captureExtension(inspection.mimeType)
  const asset = await persistReviewedCreatorMedia(
    payload,
    config,
    {
      user: { member: actor.memberId },
      scope: { kind: 'site', siteId: actor.siteId },
      title: `Recording ${details(row).manifest.createdAt.slice(0, 16)} UTC · ${name}`,
      originalFilename: `${name}.${extension}`,
    },
    file,
    {
      kind: inspection.kind,
      mimeType: inspection.mimeType,
      extension,
      width: inspection.width,
      height: inspection.height,
      source,
      private: true,
      durationSeconds: Number.isFinite(inspection.duration) ? inspection.duration : undefined,
    },
  )
  return String(asset.id)
}

function manifestFor(row: MediaUploadSession, proposed: unknown) {
  const saved = details(row).manifest
  const manifest = proposed === undefined ? saved : readManifest(proposed)
  if (
    manifest.key !== saved.key ||
    manifest.mode !== saved.mode ||
    manifest.localConsentAt !== saved.localConsentAt ||
    manifest.tracks.map(({ id }) => id).join() !== saved.tracks.map(({ id }) => id).join()
  )
    throw invalid()
  return manifest
}

export async function sealRecording(
  payload: Payload,
  actor: SubmissionActor,
  id: string,
  body: Record<string, unknown>,
) {
  return withUploadLock(payload, uploadSessionLock(id), async () => {
    const row = await owned(payload, actor, id)
    if (row.state === 'completed') return view(row)
    assertOpen(row)
    const manifest = manifestFor(row, body.manifest)
    const count = Object.keys(entries(row)).length
    if (!count || count !== body.count || manifest.endedMs === undefined)
      throw conflict('The stop marker requires all of the recording’s chunks.')
    return view(
      await payload.update({
        collection,
        id,
        ...access,
        data: { creatorDetails: { manifest } },
      }),
    )
  })
}

export async function finalizeRecording(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  id: string,
  body: Record<string, unknown>,
) {
  if (body.reviewed !== true) throw invalid()
  return withUploadLock(payload, uploadSessionLock(id), async () => {
    const row = await owned(payload, actor, id)
    if (row.state === 'completed') return view(row)
    assertOpen(row)
    const manifest = manifestFor(row, body.manifest)
    const parts = Object.entries(entries(row))
    if (
      !parts.length ||
      parts.length !== body.count ||
      !parts.some(([, entry]) => entry.track === 'master')
    )
      throw conflict('A contiguous recording with a master track is required.')
    const directory = uploadDirectory(config, id)
    const assemblies = new Map<
      CaptureTrackId,
      {
        file: Awaited<ReturnType<typeof assemble>>
        inspection: Awaited<ReturnType<typeof probe>>
      }
    >()
    let verifiedMaster = false
    try {
      for (const track of manifest.tracks) {
        const chunks = parts.filter(([, entry]) => entry.track === track.id)
        if (!chunks.length) {
          if (manifest.endedMs !== undefined && !manifest.endReason)
            throw conflict('A source track is missing.')
          continue
        }
        const mime = chunks[0][1].mimeType
        if (chunks.some(([, entry]) => entry.mimeType.split(';')[0] !== mime.split(';')[0]))
          throw invalid()
        const file = await assemble(directory, track.id, chunks)
        if ((await scanSubmissionSource(file)) !== 'clean')
          throw new MediaWorkflowError('The recording did not pass the site scanner.', 422)
        const inspection = await probe(file.filename, mime)
        if (
          track.id !== 'master' &&
          (inspection.streams.length !== 1 ||
            (inspection.kind === 'video') !== (track.id === 'camera' || track.id === 'screen'))
        )
          throw invalid()
        assemblies.set(track.id, { file, inspection })
        track.mimeType = mime
      }
      const master = assemblies.get('master')!
      const raw = master.inspection
      if (
        (manifest.mode === 'audio') !== (raw.kind === 'audio') ||
        (manifest.mode === 'video' && raw.streams.length !== 1)
      )
        throw invalid()
      const filename = path.join(directory, 'verified-master')
      const format = raw.mimeType.split('/')[1]
      await run(
        resolveFfmpegBinary(),
        [
          '-nostdin',
          '-v',
          'error',
          '-xerror',
          '-y',
          ...inputFlags(raw.mimeType),
          '-i',
          master.file.filename,
          '-map',
          '0:v:0?',
          '-map',
          '0:a:0?',
          '-map_metadata',
          '-1',
          '-map_chapters',
          '-1',
          '-c',
          'copy',
          '-fflags',
          '+bitexact',
          ...(format === 'mp4' ? ['-movflags', '+faststart'] : []),
          '-f',
          format,
          filename,
        ],
        { timeout: 60_000, maxBuffer: 64 * 1024 },
      )
      const verified = await probe(filename, raw.mimeType)
      const size = (await stat(filename)).size
      if (
        !(verified.duration > 0 && verified.duration <= maxClock / 1000) ||
        size > config.storage.maxUploadBytes
      )
        throw invalid()
      await run(
        resolveFfmpegBinary(),
        [
          '-nostdin',
          '-v',
          'error',
          '-xerror',
          ...inputFlags(raw.mimeType),
          '-threads',
          '2',
          '-i',
          filename,
          '-map',
          '0:v:0?',
          '-map',
          '0:a:0?',
          '-t',
          '1',
          '-f',
          'null',
          '-',
        ],
        { timeout: 20_000, maxBuffer: 64 * 1024 },
      )
      const checksum = createHash('sha256')
      for await (const bytes of createReadStream(filename)) checksum.update(bytes)
      verifiedMaster = true
      const sources: Record<string, string> = {}
      for (const [track, { file, inspection }] of assemblies) {
        sources[track] = await storeTrack(
          payload,
          config,
          actor,
          row,
          `source-${track}`,
          file,
          inspection,
        )
      }
      const asset = await storeTrack(
        payload,
        config,
        actor,
        row,
        'master',
        {
          filename,
          size,
          checksum: 'sha256:' + checksum.digest('hex'),
        },
        verified,
      )
      return view(
        await payload.update({
          collection,
          id,
          ...access,
          data: {
            state: 'completed',
            asset,
            expectedSize: row.receivedBytes,
            creatorDetails: {
              manifest,
              sources,
              masterHasVideo: verified.kind === 'video',
              probes: Object.fromEntries(
                Array.from(assemblies, ([key, item]) => [key, item.inspection.streams]),
              ),
              verified: verified.streams,
            },
          },
        }),
      )
    } catch (error) {
      if (error instanceof MediaWorkflowError) throw error
      if (verifiedMaster)
        throw new MediaWorkflowError(
          'The recording verified, but the media library could not save it. Retry or export the local backup.',
          503,
        )
      if ((error as { code?: unknown }).code === 'ENOENT')
        throw new MediaWorkflowError(
          'The recording file or media engine is unavailable. Export the local backup or retry later.',
          503,
        )
      throw new MediaWorkflowError(
        'The available recording could not be verified. Export the local backup if available.',
        422,
      )
    }
  })
}

export async function discardRecording(payload: Payload, actor: SubmissionActor, id: string) {
  return withUploadLock(payload, uploadSessionLock(id), async () => {
    const row = await owned(payload, actor, id)
    if (row.state === 'completed') throw conflict('This recording is already in the media library.')
    await payload.update({ collection, id, ...access, data: { state: 'cancelled' } })
  })
}

export async function playRecording(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  id: string,
  request: Request,
) {
  const row = await owned(payload, actor, id)
  const query = new URL(request.url).searchParams
  const track = query.get('track')
  if (track && !captureTrackIds.includes(track as CaptureTrackId)) throw unavailable()
  if (track === null && query.has('manifest')) {
    if (row.state !== 'completed') assertOpen(row)
    return Response.json({ ...details(row), chunks: entries(row) }, { headers: privateHeaders })
  }
  if (row.state === 'open') {
    if (query.has('master')) throw unavailable()
    assertOpen(row)
    const parts = Object.entries(entries(row)).filter(
      ([, item]) => item.track === (track ?? 'master'),
    )
    if (!parts.length) throw unavailable()
    const directory = uploadDirectory(config, id)
    return recordingResponse(
      request,
      parts.reduce((sum, [, item]) => sum + item.size, 0),
      parts[0][1].mimeType.split(';')[0],
      async (start, end) => {
        async function* readParts() {
          let offset = 0
          for (const [index, entry] of parts) {
            if (offset > end) return
            if (offset + entry.size > start) {
              // Range requests span parts without loading the whole recording.
              yield* createReadStream(path.join(directory, `${index}.part`), {
                start: Math.max(0, start - offset),
                end: Math.min(entry.size - 1, end - offset),
              })
            }
            offset += entry.size
          }
        }
        return Readable.toWeb(Readable.from(readParts())) as ReadableStream<Uint8Array>
      },
    )
  }
  const assetId = track ? details(row).sources?.[track] : relationId(row.asset)
  if (row.state !== 'completed' || !assetId) throw unavailable()
  const asset = await payload
    .findByID({ collection: 'media-assets', id: assetId, ...access })
    .catch(() => null)
  if (
    !asset ||
    relationId(asset.owner) !== actor.memberId ||
    relationId(asset.site) !== actor.siteId ||
    asset.source !== `creator-capture:${id}:${track ? 'source-' + track : 'master'}` ||
    asset.processingState !== 'ready' ||
    !asset.storageLocation ||
    !asset.mimeType ||
    !asset.sizeBytes
  )
    throw unavailable()
  const key = asset.storageLocation
  return recordingResponse(request, asset.sizeBytes, asset.mimeType, (start, end) =>
    mediaStorage(config).open(key, start, end),
  )
}

async function recordingResponse(
  request: Request,
  size: number,
  mimeType: string,
  open: (start: number, end: number) => Promise<ReadableStream<Uint8Array> | null>,
) {
  const headers = new Headers({
    ...privateHeaders,
    'content-type': mimeType,
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cross-origin-resource-policy': 'same-origin',
  })
  const range = request.headers.get('range')
  let start = 0
  let end = size - 1
  if (range !== null) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match?.[1]) {
      start = Number(match[1])
      if (match[2]) end = Math.min(end, Number(match[2]))
    } else if (match?.[2]) start = Math.max(0, size - Number(match[2]))
    if (
      !match ||
      (!match[1] && !match[2]) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end
    ) {
      headers.set('content-range', `bytes */${size}`)
      return new Response(null, { status: 416, headers })
    }
    headers.set('content-range', `bytes ${start}-${end}/${size}`)
  }
  headers.set('content-length', String(end - start + 1))
  const stream = request.method === 'HEAD' ? null : await open(start, end)
  if (request.method !== 'HEAD' && !stream) throw unavailable()
  return new Response(stream, { status: range ? 206 : 200, headers })
}
