// An explicit loopback SMTP sink. Stores actual DATA bytes, never claims inbox delivery.
import { createServer } from 'node:net'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
const directory = 'scratch/rc08b-mail'
mkdirSync(directory, { recursive: true })
let counter = 0
createServer((socket) => {
  let input = '',
    data = false,
    lines = [],
    recipient = '',
    sender = ''
  socket.write('220 rc08b.local ESMTP acceptance sink\r\n')
  socket.on('data', (chunk) => {
    input += chunk.toString('utf8')
    while (input.includes('\r\n')) {
      const end = input.indexOf('\r\n')
      const line = input.slice(0, end)
      input = input.slice(end + 2)
      if (data) {
        if (line !== '.') {
          lines.push(line.replace(/^\.\./, '.'))
          continue
        }
        const raw = lines.join('\r\n') + '\r\n'
        const number = ++counter
        writeFileSync(`${directory}/${number}.eml`, raw)
        writeFileSync(
          `${directory}/${number}.json`,
          JSON.stringify({ recipient, sender, file: `${number}.eml`, boundary: 'local SMTP only' }),
        )
        lines = []
        data = false
        socket.write(`250 local-sink-${number}\r\n`)
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-rc08b.local\r\n250 8BITMIME\r\n')
      else if (/^MAIL FROM:/i.test(line)) {
        sender = line.slice(10)
        socket.write('250 sender accepted\r\n')
      } else if (/^RCPT TO:/i.test(line)) {
        recipient = line.slice(8)
        const failure = existsSync('scratch/rc08b-smtp-mode.txt')
          ? readFileSync('scratch/rc08b-smtp-mode.txt', 'utf8').trim()
          : 'accept'
        socket.write(
          failure === 'temporary'
            ? '451 deliberate local temporary failure\r\n'
            : failure === 'permanent'
              ? '550 deliberate local recipient rejection\r\n'
              : '250 recipient accepted\r\n',
        )
      } else if (/^DATA/i.test(line)) {
        data = true
        socket.write('354 end with dot\r\n')
      } else if (/^QUIT/i.test(line)) {
        socket.end('221 goodbye\r\n')
      } else socket.write('250 OK\r\n')
    }
  })
  socket.on('error', () => {})
}).listen(3132, '127.0.0.1')
