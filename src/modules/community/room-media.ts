import { createHmac, timingSafeEqual } from 'node:crypto'
import { open, realpath } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { Payload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import { parseByteRange } from '@/modules/media/range-serving'
import type { RoomViewer } from './room-participation'
import { requireRoomAccess, roomQuery } from './rooms'
import { CommunityError } from './service'

export const playbackCookie = 'renegade-room-playback'
const tokenLifetime = 600
const mimeTypes = new Map([
  ['.m3u8', 'application/vnd.apple.mpegurl'],
  ['.ts', 'video/mp2t'],
  ['.m4s', 'video/iso.segment'],
  ['.mp4', 'video/mp4'],
  ['.aac', 'audio/aac'],
  ['.vtt', 'text/vtt'],
  ['.key', 'application/octet-stream'],
])
const mediaFilename = (name: string) =>
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name) && mimeTypes.has(extname(name))

function signature(viewer: RoomViewer, expires: string) {
  return createHmac('sha256', loadConfig().payloadSecret)
    .update(
      JSON.stringify([
        'room-media',
        viewer.siteId,
        viewer.conversationId,
        viewer.memberId,
        expires,
      ]),
    )
    .digest('hex')
}

export function validRoomPlaybackToken(viewer: RoomViewer, token: string | undefined) {
  const match = /^(\d{10,12})\.([a-f0-9]{64})$/.exec(token ?? '')
  return Boolean(
    match &&
      Number(match[1]) > Math.floor(Date.now() / 1000) &&
      timingSafeEqual(
        Buffer.from(match[2], 'hex'),
        Buffer.from(signature(viewer, match[1]), 'hex'),
      ),
  )
}

async function requireTheater(payload: Payload, viewer: RoomViewer) {
  const { binding } = await requireRoomAccess(roomQuery(payload), viewer, 'read')
  if (binding?.mode !== 'theater')
    throw new CommunityError('Theater not found.', 404, 'THEATER_NOT_FOUND')
}

const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

async function roomDirectory(viewer: RoomViewer) {
  const configured = process.env.ROOM_MEDIA_DIR
  if (!configured || !isAbsolute(configured)) return null
  const root = await realpath(configured).catch(() => null)
  if (!root) return null
  const publicRoot = await realpath(join(process.cwd(), 'public')).catch(() => null)
  if (publicRoot) {
    const distance = relative(publicRoot, root)
    if (
      !distance ||
      (!isAbsolute(distance) && distance !== '..' && !distance.startsWith(`..${sep}`))
    )
      return null
  }
  const site = await realpath(join(root, viewer.siteId)).catch(() => null)
  if (!site || dirname(site) !== root || basename(site) !== viewer.siteId) return null
  const room = await realpath(join(site, viewer.conversationId)).catch(() => null)
  return room && dirname(room) === site && basename(room) === viewer.conversationId ? room : null
}

async function mediaPath(dir: string | null, file: string) {
  if (!dir || !mediaFilename(file)) return null
  const path = await realpath(join(dir, file)).catch(() => null)
  return path && dirname(path) === dir && basename(path) === file ? path : null
}

export async function roomPlayback(payload: Payload, viewer: RoomViewer) {
  await requireTheater(payload, viewer)
  const dir = await roomDirectory(viewer)
  const base = `/api/rooms/${viewer.conversationId}/playback`
  const [live, replay] = await Promise.all([
    mediaPath(dir, 'live.m3u8'),
    mediaPath(dir, 'replay.mp4'),
  ])
  const expires = String(Math.floor(Date.now() / 1000) + tokenLifetime)
  const token = `${expires}.${signature(viewer, expires)}`
  return Response.json(
    { live: live ? `${base}/live.m3u8` : null, replay: replay ? `${base}/replay.mp4` : null },
    {
      headers: {
        ...privateHeaders,
        'Set-Cookie': `${playbackCookie}=${token}; Path=${base}; Max-Age=${tokenLifetime}; HttpOnly; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
      },
    },
  )
}

// Keep every playlist dependency (including keys, variants and init segments)
// inside the same protected URL directory. Unknown extensions fail closed.
const playlistTags = new Set([
  'EXTM3U',
  'EXTINF',
  'EXT-X-VERSION',
  'EXT-X-TARGETDURATION',
  'EXT-X-MEDIA-SEQUENCE',
  'EXT-X-DISCONTINUITY-SEQUENCE',
  'EXT-X-ENDLIST',
  'EXT-X-PLAYLIST-TYPE',
  'EXT-X-INDEPENDENT-SEGMENTS',
  'EXT-X-START',
  'EXT-X-BYTERANGE',
  'EXT-X-DISCONTINUITY',
  'EXT-X-PROGRAM-DATE-TIME',
  'EXT-X-KEY',
  'EXT-X-SESSION-KEY',
  'EXT-X-MAP',
  'EXT-X-MEDIA',
  'EXT-X-STREAM-INF',
  'EXT-X-I-FRAME-STREAM-INF',
  'EXT-X-GAP',
])

export function validRoomPlaylist(playlist: string) {
  if (!/^#EXTM3U\r?\n/.test(playlist)) return false
  return playlist.split(/\r?\n/).every((line) => {
    if (!line || (line.startsWith('#') && !line.startsWith('#EXT'))) return true
    if (!line.startsWith('#')) return mediaFilename(line)
    if (!playlistTags.has(line.slice(1).split(':')[0])) return false
    const start = line.indexOf(':')
    const attrs = start < 0 ? '' : line.slice(start + 1)
    const references = attrs.matchAll(/(?:^|,)\s*URI\s*=\s*("[^"]*"|[^,]*)/gi)
    return [...references].every(
      ([, value]) =>
        value.startsWith('"') && value.endsWith('"') && mediaFilename(value.slice(1, -1)),
    )
  })
}

export async function serveRoomMedia(
  payload: Payload,
  viewer: RoomViewer,
  file: string,
  request: Request,
) {
  await requireTheater(payload, viewer)
  const cookies = (request.headers.get('cookie') ?? '').split(/;\s*/)
  const token = cookies
    .find((cookie) => cookie.startsWith(`${playbackCookie}=`))
    ?.slice(playbackCookie.length + 1)
  if (!validRoomPlaybackToken(viewer, token))
    throw new CommunityError('Playback authorization required.', 403, 'ROOM_PLAYBACK_REQUIRED')
  const path = await mediaPath(await roomDirectory(viewer), file)
  const handle = path ? await open(path, 'r').catch(() => null) : null
  if (!handle) return new Response(null, { status: 404, headers: privateHeaders })
  let streamOpened = false
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) return new Response(null, { status: 404, headers: privateHeaders })
    const headers = new Headers(privateHeaders)
    headers.set('Content-Type', mimeTypes.get(extname(file))!)
    if (extname(file) === '.m3u8') {
      if (stat.size > 1_048_576) return new Response(null, { status: 502, headers })
      const playlist = await handle.readFile('utf8')
      if (!validRoomPlaylist(playlist)) return new Response(null, { status: 502, headers })
      return new Response(request.method === 'HEAD' ? null : playlist, { headers })
    }
    const range = parseByteRange(request.headers.get('range'), stat.size)
    headers.set('Accept-Ranges', 'bytes')
    if (range === null) {
      headers.set('Content-Range', `bytes */${stat.size}`)
      return new Response(null, { status: 416, headers })
    }
    if (range) headers.set('Content-Range', `bytes ${range.from}-${range.to}/${stat.size}`)
    headers.set('Content-Length', String(range ? range.to - range.from + 1 : stat.size))
    if (request.method === 'HEAD' || stat.size === 0)
      return new Response(null, { status: range ? 206 : 200, headers })
    const stream = handle.createReadStream({
      start: range?.from ?? 0,
      end: range?.to ?? stat.size - 1,
    })
    streamOpened = true
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: range ? 206 : 200,
      headers,
    })
  } finally {
    if (!streamOpened) await handle.close()
  }
}
