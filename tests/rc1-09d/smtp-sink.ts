import assert from 'node:assert/strict'
import { createServer, type Socket } from 'node:net'

export const sockets = new Set<Socket>()
export const messages: Array<{ to: string; raw: string; at: string }> = []
export const sink = createServer((socket) => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
  socket.on('error', () => {})
  let input = '',
    data = false,
    lines: string[] = [],
    to = ''
  socket.write('220 rc109d.local ESMTP\r\n')
  socket.on('data', (chunk) => {
    input += chunk.toString()
    while (input.includes('\r\n')) {
      const end = input.indexOf('\r\n'),
        line = input.slice(0, end)
      input = input.slice(end + 2)
      if (data) {
        if (line !== '.') {
          lines.push(line.replace(/^\.\./, '.'))
          continue
        }
        messages.push({ to, raw: lines.join('\r\n') + '\r\n', at: new Date().toISOString() })
        lines = []
        data = false
        socket.write(`250 captured-${messages.length}\r\n`)
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-rc109d.local\r\n250 8BITMIME\r\n')
      else if (/^RCPT TO:/i.test(line)) {
        to = line.slice(8).trim().replace(/[<>]/g, '')
        assert.match(to, /@example\.test$/)
        socket.write('250 recipient accepted\r\n')
      } else if (/^DATA/i.test(line)) {
        data = true
        socket.write('354 end with dot\r\n')
      } else if (/^QUIT/i.test(line)) socket.end('221 goodbye\r\n')
      else socket.write('250 OK\r\n')
    }
  })
})
