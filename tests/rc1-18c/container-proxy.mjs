import https from 'node:https'
import http from 'node:http'
import { readFileSync } from 'node:fs'
https
  .createServer(
    { key: readFileSync('/tls/key.pem'), cert: readFileSync('/tls/cert.pem') },
    (request, response) => {
      const upstream = http.request(
        {
          host: 'renegade-web',
          port: 3000,
          path: request.url,
          method: request.method,
          headers: {
            ...request.headers,
            host: 'rc118c.example.test:3443',
            'x-forwarded-host': 'rc118c.example.test:3443',
            'x-forwarded-proto': 'https',
            'x-forwarded-for': '127.0.0.1',
          },
        },
        (incoming) => {
          response.writeHead(incoming.statusCode ?? 502, incoming.headers)
          incoming.pipe(response)
        },
      )
      upstream.on('error', () => {
        response.writeHead(503)
        response.end('Disposable upstream unavailable')
      })
      request.pipe(upstream)
    },
  )
  .listen(3443, '0.0.0.0')
