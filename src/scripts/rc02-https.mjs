// Local TLS termination mirrors a normal reverse proxy without modifying hosts.
import { createServer } from 'node:https'
import { request } from 'node:http'
import { readFileSync } from 'node:fs'
createServer(
  {
    key: readFileSync('scratch/rc02-tls/key.pem'),
    cert: readFileSync('scratch/rc02-tls/cert.pem'),
  },
  (incoming, outgoing) => {
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port: 3128,
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
        outgoing.writeHead(response.statusCode, response.headers)
        response.on('error', () => outgoing.destroy())
        response.pipe(outgoing)
      },
    )
    upstream.on('error', () => {
      if (outgoing.headersSent) {
        outgoing.destroy()
        return
      }
      outgoing.writeHead(502)
      outgoing.end('Upstream restarting')
    })
    incoming.pipe(upstream)
  },
).listen(3129, '127.0.0.1')
