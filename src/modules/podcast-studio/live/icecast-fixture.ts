/**
 * POD-16 — Icecast PROTOCOL FIXTURE (test infrastructure).
 *
 * This is NOT Icecast. icecast2 is not installed on this rig
 * (`which icecast2 icecast` → nothing), so the POD-16 tests run
 * against this minimal fixture instead, and every claim made with it
 * is a claim about the Icecast source/listener PROTOCOL SHAPE, not
 * about a real Icecast server's behaviour at scale.
 *
 * Why a raw TCP server rather than node:http: ffmpeg's Icecast
 * output sends `PUT /mount HTTP/1.1` with `Expect: 100-continue`,
 * `Connection: close` and NO Content-Length / Transfer-Encoding —
 * the body is delimited by the connection closing, HTTP/1.0-style.
 * Node's llhttp parser treats that as a zero-length body and then
 * errors on the audio bytes. Real Icecast accepts it; this fixture
 * accepts it by parsing the request head itself and treating
 * everything after the head as stream bytes until the socket ends.
 *
 * Implemented protocol surface:
 * - Source: `PUT` or `SOURCE` on a mount path with HTTP Basic auth
 *   (user `source`, the configured source password) → 100 Continue,
 *   then the byte stream is captured and fanned out to listeners.
 *   Ice-* headers (ice-name, content-type) are recorded.
 * - Listener: `GET` on a mount with an active (or previously active)
 *   source → 200 with the mount's content type; the listener first
 *   receives the captured backlog, then live bytes as they arrive.
 * - Admin metadata: `GET /admin/metadata?mount=…&mode=updinfo&song=…`
 *   with HTTP Basic auth (user `admin`, the configured admin
 *   password) → records the mount's now-playing song, answers 200.
 * - Anything else → 404. Wrong credentials → 401.
 */

import { createServer, type Server, type Socket } from 'node:net'

export type IcecastFixtureOptions = {
  sourcePassword: string
  adminPassword: string
  /** Cap on the per-mount captured backlog kept for listener replay (default 1 MiB). */
  backlogBytes?: number
}

type MountState = {
  path: string
  contentType: string
  iceName: string | null
  sourceConnected: boolean
  bytesReceived: number
  backlog: Buffer[]
  backlogLength: number
  nowPlaying: string | null
  listeners: Set<Socket>
  waiters: Array<{ minBytes: number; resolve: () => void }>
}

const parseBasicAuth = (header: string | undefined): { user: string; password: string } | null => {
  if (!header?.startsWith('Basic ')) return null
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  if (colon < 0) return null
  return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) }
}

export class IcecastProtocolFixture {
  private server: Server
  private mounts = new Map<string, MountState>()
  private sockets = new Set<Socket>()
  readonly port: number = 0

  private constructor(
    server: Server,
    readonly options: IcecastFixtureOptions,
  ) {
    this.server = server
  }

  static async start(options: IcecastFixtureOptions): Promise<IcecastProtocolFixture> {
    const server = createServer()
    const fixture = new IcecastProtocolFixture(server, options)
    server.on('connection', (socket) => fixture.handleConnection(socket))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    ;(fixture as { port: number }).port = (server.address() as { port: number }).port
    return fixture
  }

  origin(): string {
    return `http://127.0.0.1:${this.port}`
  }

  mountUrl(path: string): string {
    return `${this.origin()}${path}`
  }

  mount(path: string): Readonly<MountState> | undefined {
    return this.mounts.get(path)
  }

  /** Resolves once the mount has received at least `minBytes` of source audio. */
  waitForBytes(path: string, minBytes: number, timeoutMs = 15_000): Promise<void> {
    const mount = this.mountFor(path)
    if (mount.bytesReceived >= minBytes) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `Fixture mount ${path} received ${mount.bytesReceived} < ${minBytes} bytes in ${timeoutMs} ms.`,
            ),
          ),
        timeoutMs,
      )
      mount.waiters.push({
        minBytes,
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
      })
    })
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  private mountFor(path: string): MountState {
    let mount = this.mounts.get(path)
    if (!mount) {
      mount = {
        path,
        contentType: 'audio/mpeg',
        iceName: null,
        sourceConnected: false,
        bytesReceived: 0,
        backlog: [],
        backlogLength: 0,
        nowPlaying: null,
        listeners: new Set(),
        waiters: [],
      }
      this.mounts.set(path, mount)
    }
    return mount
  }

  private handleConnection(socket: Socket): void {
    this.sockets.add(socket)
    socket.on('close', () => this.sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    let head = Buffer.alloc(0)
    let routed = false
    socket.on('data', (chunk: Buffer) => {
      if (routed) return
      head = Buffer.concat([head, chunk])
      const headEnd = head.indexOf('\r\n\r\n')
      if (headEnd < 0) {
        if (head.length > 16_384) socket.destroy()
        return
      }
      routed = true
      const headText = head.subarray(0, headEnd).toString('latin1')
      const rest = head.subarray(headEnd + 4)
      const lines = headText.split('\r\n')
      const [method, rawPath] = (lines[0] ?? '').split(' ')
      const headers = new Map<string, string>()
      for (const line of lines.slice(1)) {
        const colon = line.indexOf(':')
        if (colon > 0)
          headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
      }
      const url = new URL(rawPath ?? '/', this.origin())
      if (method === 'PUT' || method === 'SOURCE') {
        this.handleSource(socket, url.pathname, headers, rest)
      } else if (method === 'GET' && url.pathname === '/admin/metadata') {
        this.handleMetadata(socket, url, headers)
      } else if (method === 'GET') {
        this.handleListener(socket, url.pathname, rest)
      } else {
        socket.end('HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n')
      }
    })
  }

  private handleSource(
    socket: Socket,
    path: string,
    headers: Map<string, string>,
    firstBytes: Buffer,
  ): void {
    const auth = parseBasicAuth(headers.get('authorization'))
    if (!auth || auth.user !== 'source' || auth.password !== this.options.sourcePassword) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n')
      return
    }
    const mount = this.mountFor(path)
    mount.contentType = headers.get('content-type') ?? 'audio/mpeg'
    mount.iceName = headers.get('ice-name') ?? null
    mount.sourceConnected = true
    if ((headers.get('expect') ?? '').toLowerCase() === '100-continue')
      socket.write('HTTP/1.1 100 Continue\r\n\r\n')
    const ingest = (chunk: Buffer) => {
      if (!chunk.length) return
      mount.bytesReceived += chunk.length
      mount.backlog.push(chunk)
      mount.backlogLength += chunk.length
      const cap = this.options.backlogBytes ?? 1_048_576
      while (mount.backlogLength > cap && mount.backlog.length > 1) {
        mount.backlogLength -= mount.backlog.shift()!.length
      }
      for (const listener of mount.listeners) listener.write(chunk)
      mount.waiters = mount.waiters.filter((waiter) => {
        if (mount.bytesReceived >= waiter.minBytes) {
          waiter.resolve()
          return false
        }
        return true
      })
    }
    if (firstBytes.length) ingest(firstBytes)
    socket.on('data', ingest)
    socket.on('close', () => {
      mount.sourceConnected = false
    })
    socket.on('error', () => {
      mount.sourceConnected = false
    })
  }

  private handleListener(socket: Socket, path: string, _rest: Buffer): void {
    const mount = this.mounts.get(path)
    if (!mount || (mount.bytesReceived === 0 && !mount.sourceConnected)) {
      socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n')
      return
    }
    socket.write(
      `HTTP/1.1 200 OK\r\nContent-Type: ${mount.contentType}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n`,
    )
    for (const chunk of mount.backlog) socket.write(chunk)
    mount.listeners.add(socket)
    socket.on('close', () => mount.listeners.delete(socket))
    socket.on('error', () => mount.listeners.delete(socket))
  }

  private handleMetadata(socket: Socket, url: URL, headers: Map<string, string>): void {
    const auth = parseBasicAuth(headers.get('authorization'))
    if (!auth || auth.user !== 'admin' || auth.password !== this.options.adminPassword) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n')
      return
    }
    const mountPath = url.searchParams.get('mount') ?? ''
    const song = url.searchParams.get('song') ?? ''
    if (url.searchParams.get('mode') === 'updinfo' && mountPath) {
      this.mountFor(mountPath).nowPlaying = song
    }
    const body = '<html><body>Metadata updated</body></html>'
    socket.end(
      `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    )
  }
}
