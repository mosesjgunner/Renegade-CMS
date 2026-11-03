/* eslint-disable @typescript-eslint/no-explicit-any -- isolated SMTP provider harness */
// Minimal local SMTP server used as the isolated message-dispatch provider
// harness for RC1 17E. Behavior is driven by scratch/rc117e/smtp-control.json
// ({ "mode": "accept" | "retryable" | "retryable-once" | "hang-after-data" }),
// re-read at every DATA completion. Every accepted message is appended to
// scratch/rc117e/smtp-stored.jsonl BEFORE the final response is (or is not)
// sent, so a lost response still leaves the provider-side effect recorded.
// Chunk processing is serialized through a promise chain so protocol state
// can never be interleaved by packet boundaries.
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { appendFile, readFile, writeFile } from 'node:fs/promises'

assert.equal(process.env.RC117E_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith('/rc117e_release_acceptance'))

const controlFile = 'scratch/rc117e/smtp-control.json'
const storedFile = 'scratch/rc117e/smtp-stored.jsonl'
const markerFile = 'scratch/rc117e/smtp-retryable-once.marker'

async function mode(): Promise<string> {
  try {
    return JSON.parse(await readFile(controlFile, 'utf8')).mode ?? 'accept'
  } catch {
    return 'accept'
  }
}

const server = createServer((socket) => {
  socket.setEncoding('utf8')
  let buffer = ''
  let dataMode = false
  let mailFrom = ''
  let rcptTo = ''
  let chain: Promise<void> = Promise.resolve()
  const send = (line: string) => socket.write(`${line}\r\n`)
  send('220 127.0.0.1 renegade-17e-smtp-harness')

  async function processBuffer(): Promise<void> {
    for (;;) {
      if (dataMode) {
        const end = buffer.indexOf('\r\n.\r\n')
        if (end === -1) return // wait for more bytes; buffer stays intact
        const raw = buffer.slice(0, end)
        buffer = buffer.slice(end + 5)
        dataMode = false
        const header = (name: string) =>
          raw.match(new RegExp(`^${name}:\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? ''
        const behavior = await mode()
        const record = {
          messageId: header('Message-ID'),
          idempotencyKey: header('X-Renegade-Idempotency-Key'),
          from: mailFrom,
          to: rcptTo,
          subject: header('Subject'),
          receivedAt: new Date().toISOString(),
          behavior,
        }
        if (behavior === 'retryable') {
          send('421 4.7.1 Harness temporary failure; try again later')
          continue
        }
        if (behavior === 'retryable-once') {
          let seen = false
          try {
            await readFile(markerFile, 'utf8')
            seen = true
          } catch {}
          if (!seen) {
            await writeFile(markerFile, '1')
            send('421 4.7.1 Harness temporary failure; try again later')
            continue
          }
        }
        // The provider-side effect happens here: the message is durably
        // stored before any response is returned (or withheld).
        await appendFile(storedFile, JSON.stringify(record) + '\n')
        if (behavior === 'hang-after-data') {
          // Lost response: never answer; the client stays blocked until
          // it is killed or its socket timeout fires.
          return
        }
        send('250 2.0.0 Ok: queued by 17e harness')
        continue
      }
      const lineEnd = buffer.indexOf('\r\n')
      if (lineEnd === -1) return
      const line = buffer.slice(0, lineEnd)
      buffer = buffer.slice(lineEnd + 2)
      const upper = line.toUpperCase()
      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        send('250-127.0.0.1 greets renegade')
        send('250 8BITMIME')
      } else if (upper.startsWith('MAIL FROM:')) {
        mailFrom = line.slice(line.indexOf(':') + 1).trim()
        send('250 2.1.0 Ok')
      } else if (upper.startsWith('RCPT TO:')) {
        rcptTo = line.slice(line.indexOf(':') + 1).trim()
        send('250 2.1.5 Ok')
      } else if (upper === 'DATA') {
        send('354 End data with <CR><LF>.<CR><LF>')
        dataMode = true
      } else if (upper === 'RSET') {
        send('250 2.0.0 Ok')
      } else if (upper === 'NOOP') {
        send('250 2.0.0 Ok')
      } else if (upper === 'QUIT') {
        send('221 2.0.0 Bye')
        socket.end()
        return
      } else {
        send('502 5.5.2 Command not implemented')
      }
    }
  }

  socket.on('data', (chunk: string) => {
    buffer += chunk
    chain = chain.then(processBuffer).catch(() => undefined)
  })
  socket.on('error', () => undefined)
})
server.listen(39096, '127.0.0.1', () => console.log('17E SMTP harness ready on 127.0.0.1:39096'))
