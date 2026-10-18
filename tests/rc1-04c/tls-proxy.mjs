import https from 'node:https'
import http from 'node:http'
import net from 'node:net'
import { readFileSync } from 'node:fs'

if (process.env.RC1_04C_DISPOSABLE !== 'yes')
  throw new Error('Dedicated disposable environment required')
const origin = new URL(process.env.APP_URL)
if (origin.hostname !== 'localhost' || origin.port !== '38921')
  throw new Error('Unexpected local proxy origin')
https
  .createServer(
    {
      key: readFileSync('scratch/rc104c-20261018/tls/key.pem'),
      cert: readFileSync('scratch/rc104c-20261018/tls/cert.pem'),
    },
    (request, response) => {
      const upstream = http.request(
        {
          host: '127.0.0.1',
          port: 38920,
          path: request.url,
          method: request.method,
          headers: {
            ...request.headers,
            host: origin.host,
            'x-forwarded-host': origin.host,
            'x-forwarded-proto': 'https',
            'x-forwarded-for': request.socket.remoteAddress,
          },
        },
        (incoming) => {
          response.writeHead(incoming.statusCode ?? 502, incoming.headers)
          incoming.pipe(response)
        },
      )
      upstream.on('error', () => {
        response.writeHead(503)
        response.end('Local disposable application is unavailable.')
      })
      request.pipe(upstream)
    },
  )
  .on('upgrade', (request, socket, head) => {
    const upstream = net.connect(38920, '127.0.0.1', () => {
      const headers = {
        ...request.headers,
        host: origin.host,
        'x-forwarded-host': origin.host,
        'x-forwarded-proto': 'https',
      }
      upstream.write(
        `${request.method} ${request.url} HTTP/1.1\r\n${Object.entries(headers)
          .map(([name, value]) => `${name}: ${value}`)
          .join('\r\n')}\r\n\r\n`,
      )
      if (head.length) upstream.write(head)
      socket.pipe(upstream)
      upstream.pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })
  .listen(38921, '127.0.0.1', () =>
    console.log('Disposable HTTPS proxy listening on loopback 38921 -> 38920'),
  )
