import { createServer } from 'node:https'
import { request } from 'node:http'
import { readFileSync } from 'node:fs'

const runtime = 'C:/Projects/RENEGADE CMS/rc1-01c-runtime'
const ports = new Map([
  ['rc1-01c-lean.test', 38751],
  ['rc1-01c-std.test', 38752],
])

createServer(
  { key: readFileSync(`${runtime}/key.pem`), cert: readFileSync(`${runtime}/cert.pem`) },
  (incoming, outgoing) => {
    const port = ports.get(incoming.headers.host ?? '')
    if (!port) {
      outgoing.writeHead(421)
      outgoing.end('Unknown host')
      return
    }
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(outgoing)
      },
    )
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502)
      outgoing.end('Upstream unavailable')
    })
    incoming.pipe(upstream)
  },
).listen(443, '127.0.0.1')
