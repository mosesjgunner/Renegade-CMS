import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:https'

const keyPath = process.env.E2E_TLS_KEY_PATH
const certPath = process.env.E2E_TLS_CERT_PATH
if (!keyPath || !certPath) throw new Error('Explicit local TLS key and certificate are required.')

createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (incoming, outgoing) => {
  const upstream = request(
    {
      hostname: 'localhost',
      port: 3110,
      path: incoming.url,
      method: incoming.method,
      headers: {
        ...incoming.headers,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': incoming.headers.host,
        'x-forwarded-for': incoming.socket.remoteAddress,
      },
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
}).listen(3111, '127.0.0.1')
