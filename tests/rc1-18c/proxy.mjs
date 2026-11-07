import https from 'node:https'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'

// Disposable loopback TLS only; Chromium maps this reserved hostname locally.
https
  .createServer(
    {
      key: readFileSync('scratch/rc02-tls/key.pem'),
      cert: readFileSync('scratch/rc02-tls/cert.pem'),
    },
    (request, response) => {
      const target = existsSync('scratch/rc118c/proxy-target.json')
        ? JSON.parse(readFileSync('scratch/rc118c/proxy-target.json', 'utf8')).port
        : 3428
      if (![3428, 3430].includes(target)) {
        response.writeHead(503)
        response.end('Invalid isolated target')
        return
      }
      const upstream = http.request(
        {
          host: '127.0.0.1',
          port: target,
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
  .listen(3443, '127.0.0.1', () => console.log('18C disposable TLS listening on 3443 -> 3428'))
