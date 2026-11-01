import { createServer } from 'node:http'
import { expect, it } from 'vitest'
import { ollamaAdapter, openAiCompatibleAdapter } from '../../src/modules/ai/gateway'

it('never follows provider redirects or permits remote private-address egress', async () => {
  let escaped = 0
  const server = createServer((request, response) => {
    if (request.url === '/escape') escaped++
    response.writeHead(302, { location: '/escape' }).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected local port')
  const input = {
    model: 'local',
    prompt: 'data',
    signal: AbortSignal.timeout(1000),
    structured: false,
  }
  try {
    await expect(ollamaAdapter(`http://127.0.0.1:${address.port}`).complete(input)).rejects.toThrow(
      'redirect',
    )
    expect(escaped).toBe(0)
    await expect(
      openAiCompatibleAdapter('ai.openai-compatible', 'https://127.0.0.1', 'secret').complete(
        input,
      ),
    ).rejects.toThrow()
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
