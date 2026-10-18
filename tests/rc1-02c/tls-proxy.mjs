import https from 'node:https'
import http from 'node:http'
import { readFileSync } from 'node:fs'

if (process.env.RC1_02C_DISPOSABLE !== 'yes')
  throw new Error('Dedicated disposable environment required')
const origin = new URL(process.env.APP_URL)
if (origin.hostname !== 'admin.rc102c.test' || origin.port !== '38903')
  throw new Error('Unexpected local proxy origin')
https
  .createServer(
    {
      key: readFileSync('scratch/rc102c-20261017/tls/key.pem'),
      cert: readFileSync('scratch/rc102c-20261017/tls/cert.pem'),
    },
    (request, response) => {
      const upstream = http.request(
        {
          host: '127.0.0.1',
          port: 38904,
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
  .listen(38903, '127.0.0.1', () =>
    console.log('Disposable HTTPS proxy listening on loopback 38903 -> 38904'),
  )
