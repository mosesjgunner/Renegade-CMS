import { createServer } from 'node:https'
import { request } from 'node:http'
import { readFileSync } from 'node:fs'

const runtime = 'C:/Projects/RENEGADE CMS/rc1-01b-runtime'
createServer(
  {
    key: readFileSync(`${runtime}/key.pem`),
    cert: readFileSync(`${runtime}/cert.pem`),
  },
  (incoming, outgoing) => {
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port: 38742,
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
  },
).listen(38743, '127.0.0.1')
