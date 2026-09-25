import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }))
vi.mock('../../src/modules/core/external-boundary', () => ({
  safeFetch: mocks.safeFetch,
  readBoundedJson: async (response: Response) => response.json(),
}))

import {
  discoverAiModels,
  ollamaAdapter,
  openAiCompatibleAdapter,
} from '../../src/modules/ai/gateway'

beforeEach(() => mocks.safeFetch.mockReset())

describe('tested AI provider HTTP contracts', () => {
  it('uses authenticated OpenAI-compatible chat completions and JSON mode', async () => {
    mocks.safeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"title":"Suggestion"}' } }],
          usage: { prompt_tokens: 9, completion_tokens: 4 },
        }),
        { status: 200 },
      ),
    )
    const result = await openAiCompatibleAdapter(
      'ai.openai-compatible',
      'https://provider.example/v1',
      'test-secret',
    ).complete({
      model: 'tested-model',
      prompt: 'Data only',
      signal: new AbortController().signal,
      maxOutputTokens: 100,
      structured: true,
    })
    expect(result).toEqual({ output: '{"title":"Suggestion"}', inputTokens: 9, outputTokens: 4 })
    const [url, init, options] = mocks.safeFetch.mock.calls[0]
    expect(url).toBe('https://provider.example/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer test-secret')
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'tested-model',
      max_tokens: 100,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: expect.stringContaining('untrusted data') },
        { role: 'user', content: 'Data only' },
      ],
    })
    expect(options).toBeUndefined()
  })
  it('uses only local Ollama generate with non-streaming JSON mode', async () => {
    mocks.safeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ response: '{"altText":"River"}', prompt_eval_count: 11, eval_count: 7 }),
        { status: 200 },
      ),
    )
    const result = await ollamaAdapter('http://127.0.0.1:11434').complete({
      model: 'local-model',
      prompt: 'metadata',
      signal: new AbortController().signal,
      maxOutputTokens: 64,
      structured: true,
    })
    expect(result.output).toBe('{"altText":"River"}')
    const [url, init, options] = mocks.safeFetch.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:11434/api/generate')
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'local-model',
      stream: false,
      format: 'json',
      options: { num_predict: 64 },
    })
    expect(options).toMatchObject({ allowHttp: true, allowPrivate: true })
  })
  it('discovers advertised models through each explicit adapter endpoint', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'remote-model' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'local-model' }] })))
    expect(
      await discoverAiModels('ai.openai-compatible', 'https://provider.example/v1', 'key'),
    ).toEqual(['remote-model'])
    expect(await discoverAiModels('ai.ollama', 'http://127.0.0.1:11434')).toEqual(['local-model'])
    expect(mocks.safeFetch.mock.calls[0][0]).toBe('https://provider.example/v1/models')
    expect(mocks.safeFetch.mock.calls[1][0]).toBe('http://127.0.0.1:11434/api/tags')
  })
})
